// Server-owned, source-bound authorization for first-contact private chats.
const { publicId } = require('../shared/public-data')
const { makeDeterministicId } = require('../shared/id')

module.exports = function createContactsModule({ db, _, helpers }) {
  const { getUserForAction, conversationBlocked } = helpers
  const fail = msg => ({ code: -1, msg })
  const idOf = user => user && (user.internalUserId || publicId(user._openid))

  async function userByOpenid(openid) {
    const rows = (await db.collection('users').where({ _openid: openid, status: 'active' }).limit(1).get()).data || []
    return rows[0] || null
  }
  async function read(collection, id) {
    try { return (await db.collection(collection).doc(id).get()).data || null } catch (_) { return null }
  }
  async function hasHistory(a, b) {
    const result = await db.collection('messages').where({ fromOpenid: a, toOpenid: b }).limit(1).get()
    if ((result.data || []).length) return true
    const reverse = await db.collection('messages').where({ fromOpenid: b, toOpenid: a }).limit(1).get()
    return (reverse.data || []).length > 0
  }
  async function grantsForPair(a, b) {
    const userIds = [idOf(a), idOf(b)].sort()
    return (await db.collection('contact_grants').where({ userIds: _.all(userIds) }).limit(50).get()).data || []
  }
  async function grantIsActive(grant, a, b) {
    if (!grant || grant.active !== true) return false
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return false
    if (grant.type === 'MARKET') {
      const goods = await read('market_goods', grant.sourceId)
      return !!goods && goods.status === 'active' && [a._openid, b._openid].includes(goods._openid)
    }
    if (grant.type === 'MUTUAL') {
      const post = await read('mutual_posts', grant.sourceId)
      return !!post && ['open', 'in_progress'].includes(post.status)
    }
    if (grant.type === 'BUDDY') return !!(await read('buddy_posts', grant.sourceId))
    if (grant.type === 'HEART') return !!(await read('heart_matches', grant.sourceId))
    if (grant.type === 'BRIDGE') {
      const validLanguage = user => user && user.languageProfile && Array.isArray(user.languageProfile.nativeLanguages) && user.languageProfile.nativeLanguages.length && Array.isArray(user.languageProfile.targetLanguages) && user.languageProfile.targetLanguages.length
      return validLanguage(a) && validLanguage(b)
    }
    return true
  }
  async function createGrant(actor, target, type, sourceId) {
    if (!actor || !target || actor._openid === target._openid) return fail('无效联系对象')
    if (await conversationBlocked(actor._openid, target._openid)) return fail('无法与该用户建立联系')
    const userIds = [idOf(actor), idOf(target)].sort()
    const _id = makeDeterministicId('contact', type, sourceId || '', ...userIds)
    const now = new Date()
    await db.collection('contact_grants').doc(_id).set({ data: {
      userIds, type, sourceId: sourceId || '', active: true, createdAt: now, expiresAt: null
    } })
    return { code: 0, data: { targetUserId: idOf(target) } }
  }
  async function grantForOpenids(actorOpenid, targetOpenid, type, sourceId) {
    return createGrant(await userByOpenid(actorOpenid), await userByOpenid(targetOpenid), type, sourceId)
  }
  async function activeGrant(a, b) {
    const rows = await grantsForPair(a, b)
    for (const grant of rows) {
      if (await grantIsActive(grant, a, b)) return true
    }
    return false
  }
  async function ensureContact(actorOpenid, targetOpenid) {
    const actor = await getUserForAction(actorOpenid, { requireActive: true })
    const target = await userByOpenid(targetOpenid)
    if (!target || await conversationBlocked(actorOpenid, targetOpenid)) return false
    const grants = await grantsForPair(actor, target)
    const grantStates = await Promise.all(grants.map(grant => grantIsActive(grant, actor, target)))
    if (grantStates.some(Boolean)) return true
    // A source-bound grant must not become a permanent bypass after its source
    // is closed (for example, a delisted Market item). Pure historical chats
    // without a source grant remain continuable.
    if (grants.some(grant => ['MARKET', 'MUTUAL', 'BUDDY', 'HEART', 'BRIDGE'].includes(grant.type))) return false
    return hasHistory(actorOpenid, targetOpenid)
  }
  async function startExistingContact(openid, { targetOpenid }) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const target = await userByOpenid(targetOpenid)
    if (!target || await conversationBlocked(openid, targetOpenid)) return fail('当前没有可用的联系权限')
    return await hasHistory(openid, targetOpenid) ? { code: 0, data: { targetUserId: idOf(target) } } : fail('当前没有可用的联系权限')
  }
  async function startMarketContact(openid, { goodsId }) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const goods = await read('market_goods', goodsId)
    if (!goods || goods.status !== 'active' || goods._openid === openid) return fail('当前商品不可联系')
    return createGrant(actor, await userByOpenid(goods._openid), 'MARKET', goodsId)
  }
  async function startMutualContact(openid, { postId }) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const post = await read('mutual_posts', postId)
    if (!post || !['open', 'in_progress'].includes(post.status) || post._openid === openid) return fail('当前条目不可联系')
    return createGrant(actor, await userByOpenid(post._openid), 'MUTUAL', postId)
  }
  async function startBridgeContact(openid, { targetOpenid }) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const target = await userByOpenid(targetOpenid)
    const valid = user => user && user.languageProfile && Array.isArray(user.languageProfile.nativeLanguages) && user.languageProfile.nativeLanguages.length && Array.isArray(user.languageProfile.targetLanguages) && user.languageProfile.targetLanguages.length
    if (!valid(actor) || !valid(target)) return fail('双方需先完善语言资料')
    return createGrant(actor, target, 'BRIDGE', '')
  }
  async function startBuddyContact(openid, { postId, targetOpenid }) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const post = await read('buddy_posts', postId)
    if (!post) return fail('组局不存在')
    const accepted = (await db.collection('buddy_applications').where({ postId, status: 'ACCEPTED' }).limit(50).get()).data || []
    const members = new Set([post._openid, ...accepted.map(row => row.applicantId)])
    const targetId = targetOpenid || (openid === post._openid ? accepted[0] && accepted[0].applicantId : post._openid)
    if (!members.has(openid) || !members.has(targetId) || targetId === openid) return fail('仅发起人与已接受成员可联系')
    return createGrant(actor, await userByOpenid(targetId), 'BUDDY', postId)
  }
  return { grantForOpenids, ensureContact, startExistingContact, startMarketContact, startMutualContact, startBridgeContact, startBuddyContact }
}
