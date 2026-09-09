const { createContentValidator } = require('../shared/content-safety')
const { publicId } = require('../shared/public-data')
const { makeDeterministicId } = require('../shared/id')
const { getCampusById, getSchoolById } = require('../shared/schools')
const { getUserEntitlements } = require('../shared/entitlements')
const { dayKey, pairId, eligible, score, selectCandidate, sanitizeHeartProfile, FATE_MAX_SCAN } = require('../shared/heart')

module.exports = function createHeartModule({ db, _, cloud, helpers, now = Date.now, random = Math.random }) {
  const validate = createContentValidator(helpers)
  const ok = data => ({ code: 0, data })
  const fail = msg => ({ code: -1, msg })

  async function read(store, collection, id) {
    try {
      const result = await store.collection(collection).doc(id).get()
      return result.data && result.data._id ? result.data : null
    } catch (error) {
      if (/document.*(?:not exist|not found)/i.test(String(error.message || error.errMsg || ''))) return null
      throw error
    }
  }

  function schoolForUser(user) {
    const campus = getCampusById(user && user.campusId)
    return { campus, school: campus && getSchoolById(campus.schoolId) }
  }

  function heartEnabledForUser(user) {
    const { school } = schoolForUser(user)
    return !!(school && school.features && school.features.heart === true)
  }

  async function actor(openid) {
    if (!openid) throw Error('请先登录')
    const user = await helpers.getUserForAction(openid, { requireActive: true })
    if (!user || user.status !== 'active') throw Error('账号不可用')
    return { ...user, userId: user.internalUserId || publicId(openid) }
  }

  async function heartActor(openid) {
    const user = await actor(openid)
    if (!heartEnabledForUser(user)) throw Error('该学校暂未开放心动模式')
    return user
  }

  async function transaction(work) {
    const tx = await db.startTransaction()
    try {
      const result = await work(tx)
      await tx.commit()
      return result
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }

  async function log(name, userId, metadata) {
    const safeMetadata = metadata && typeof metadata === 'object'
      ? Object.fromEntries(Object.entries(metadata).filter(([key, value]) => ['candidateCount', 'scannedCount', 'limit', 'remaining'].includes(key) && Number.isFinite(Number(value))))
      : undefined
    try {
      await db.collection('heart_events').add({ data: { name, userId, createdAt: now(), ...(safeMetadata ? { metadata: safeMetadata } : {}) } })
    } catch (_) {
      console.warn('Heart event log unavailable:', name)
    }
  }

  function ownsNewHeartFile(fileId, userId) {
    return typeof fileId === 'string' && new RegExp(`/heart/${userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`).test(fileId)
  }

  async function cleanupRemovedPhotos(previousPhotos, nextPhotos, userId) {
    if (!cloud || typeof cloud.deleteFile !== 'function') return
    const removed = previousPhotos.filter(fileId => !nextPhotos.includes(fileId) && ownsNewHeartFile(fileId, userId))
    if (!removed.length) return
    try {
      await cloud.deleteFile({ fileList: removed })
    } catch (error) {
      console.warn('Heart photo cleanup failed:', String(error && (error.errMsg || error.message) || error))
    }
  }

  async function getHeartProfile(openid) {
    const user = await heartActor(openid)
    const profile = await read(db, 'heart_profiles', user.userId)
    if (profile && profile.schoolId !== schoolForUser(user).campus.schoolId) {
      return ok({ enabled: false, allowFateCard: false, needsReconfirm: true, message: '你已更换学校，请重新确认心动资料。' })
    }
    return ok(profile
      ? { ...sanitizeHeartProfile(profile), enabled: profile.enabled, adultDeclared: profile.adultDeclared, gender: profile.gender, interestedIn: profile.interestedIn, allowFateCard: profile.allowFateCard }
      : { enabled: false, allowFateCard: false })
  }

  async function updateHeartProfile(openid, data = {}) {
    const user = await heartActor(openid)
    const { campus } = schoolForUser(user)
    if (!campus) return fail('请先选择有效校区')
    const previous = await read(db, 'heart_profiles', user.userId)
    const previousPhotos = previous && Array.isArray(previous.photos) ? previous.photos : []
    if (data.adultDeclared !== true || data.enabled !== true) return fail('请确认已满18周岁并主动开启心动模式')
    const genders = ['male', 'female', 'other']
    if (!genders.includes(data.gender) || !Array.isArray(data.interestedIn) || !data.interestedIn.length || data.interestedIn.some(value => !genders.includes(value))) return fail('请填写双方偏好')
    if (!Array.isArray(data.photos) || data.photos.length < 1 || data.photos.length > 3 || data.photos.some(photo => typeof photo !== 'string' || !/^cloud:\/\/[^\s]+$/.test(photo))) return fail('请上传1至3张云存储照片')
    if (data.photos.some(photo => !previousPhotos.includes(photo) && !ownsNewHeartFile(photo, user.userId))) return fail('照片必须由当前心动资料上传')
    const bio = String(data.bio || '').trim()
    const lookingFor = String(data.lookingFor || '').trim()
    const grade = String(data.grade || '').trim()
    const interestIds = Array.isArray(data.interestIds) ? [...new Set(data.interestIds)] : []
    if (bio.length > 160 || lookingFor.length > 80 || grade.length > 16 || interestIds.length > 12 || interestIds.some(value => typeof value !== 'string' || value.length > 20)) return fail('资料长度超出限制')
    const text = [user.nickName || '', bio, lookingFor, grade, ...interestIds].join(' ')
    if (/\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:微信|微.?信号|vx|wechat|qq|电话|手机|联系方式)\s*[:：号]?\s*[a-z\d_-]{4,}/i.test(text)) return fail('资料中不能展示联系方式')
    const safety = await validate({ openid, text, images: data.photos })
    if (!safety.pass) return { code: safety.code, msg: safety.reason }
    const profile = { userId: user.userId, ownerDocId: user._id, enabled: true, adultDeclared: true, gender: data.gender, interestedIn: [...new Set(data.interestedIn)], grade, photos: data.photos, bio, interestIds, lookingFor, allowFateCard: data.allowFateCard === true, schoolId: campus.schoolId, campusId: campus.id, campusName: campus.name, nickname: user.nickName || '同学', createdAt: previous ? previous.createdAt : now(), updatedAt: now() }
    if (!user.internalUserId) await db.collection('users').doc(user._id).update({ data: { internalUserId: user.userId } })
    await db.collection('heart_profiles').doc(user.userId).set({ data: profile })
    await cleanupRemovedPhotos(previousPhotos, data.photos, user.userId)
    await log(previous && previous.enabled ? 'heart_profile_completed' : 'heart_mode_opened', user.userId)
    return getHeartProfile(openid)
  }

  async function disableHeartProfile(openid) {
    const user = await heartActor(openid)
    const profile = await read(db, 'heart_profiles', user.userId)
    if (profile) await db.collection('heart_profiles').doc(user.userId).update({ data: { enabled: false, allowFateCard: false, updatedAt: now() } })
    await log('heart_profile_disabled', user.userId)
    return ok({ enabled: false, allowFateCard: false })
  }

  async function toggleFateCardOptIn(openid, data = {}) {
    const user = await heartActor(openid)
    const profile = await read(db, 'heart_profiles', user.userId)
    if (!profile || !profile.enabled) return fail('请先开启心动模式')
    await db.collection('heart_profiles').doc(user.userId).update({ data: { allowFateCard: data.allowFateCard === true, updatedAt: now() } })
    return ok({ allowFateCard: data.allowFateCard === true })
  }

  async function pairValid(store, me, targetId, fate = false) {
    const fence = await read(store, 'heart_block_fences', pairId(me.userId, targetId))
    if (fence && fence.blocked) return null
    const a = await read(store, 'heart_profiles', me.userId)
    const b = await read(store, 'heart_profiles', targetId)
    if (!eligible(a, b, fate)) return null
    const au = await read(store, 'users', a.ownerDocId)
    const bu = await read(store, 'users', b.ownerDocId)
    if (!au || !bu || au.status !== 'active' || bu.status !== 'active' || !heartEnabledForUser(au) || !heartEnabledForUser(bu)) return null
    const ac = getCampusById(au.campusId)
    const bc = getCampusById(bu.campusId)
    if (!ac || !bc || ac.schoolId !== a.schoolId || bc.schoolId !== b.schoolId) return null
    if (await helpers.conversationBlocked(au._openid, bu._openid)) return null
    return { a: { ...a, lastLoginTime: au.lastLoginTime }, b: { ...b, lastLoginTime: bu.lastLoginTime }, au, bu }
  }

  async function batch(collection, field, ids) {
    const result = []
    for (let index = 0; index < ids.length; index += 20) result.push(...((await db.collection(collection).where({ [field]: _.in(ids.slice(index, index + 20)) }).limit(100).get()).data || []))
    return result
  }

  async function candidates(user, fate = false, page = 1) {
    const me = await read(db, 'heart_profiles', user.userId)
    if (!me || !me.enabled) throw Error('请先开启心动模式')
    const currentCampus = getCampusById(user.campusId)
    if (!currentCampus || currentCampus.schoolId !== me.schoolId) throw Error('你已更换学校，请重新确认心动资料。')
    const windowSize = fate ? 100 : 15
    const rows = (await db.collection('heart_profiles').where({ enabled: true, schoolId: me.schoolId }).orderBy('userId', 'asc').skip((page - 1) * windowSize).limit(windowSize).get()).data || []
    const eligibleRows = rows.filter(profile => eligible(me, profile, fate))
    const [users, matches, likes, fences] = await Promise.all([
      batch('users', '_id', eligibleRows.map(profile => profile.ownerDocId)),
      batch('heart_matches', '_id', eligibleRows.map(profile => pairId(user.userId, profile.userId))),
      batch('heart_likes', '_id', eligibleRows.map(profile => makeDeterministicId('heartlike', user.userId, profile.userId))),
      batch('heart_block_fences', '_id', eligibleRows.map(profile => pairId(user.userId, profile.userId)))
    ])
    const hidden = await helpers.findAuthorsHiddenByBlockRelation(user._openid, users.map(candidate => candidate._openid))
    const byId = new Map(users.map(candidate => [candidate._id, candidate]))
    const matched = new Set(matches.map(match => match._id))
    const reacted = new Set(likes.map(like => like.toUserId))
    const blocked = new Set(fences.filter(fence => fence.blocked).map(fence => fence._id))
    const buddies = await batch('buddy_posts', 'authorId', users.map(candidate => candidate._openid))
    const result = []
    for (const profile of eligibleRows) {
      const candidate = byId.get(profile.ownerDocId)
      const campus = candidate && getCampusById(candidate.campusId)
      if (!candidate || candidate.status !== 'active' || !heartEnabledForUser(candidate) || !campus || campus.schoolId !== me.schoolId || hidden.has(candidate._openid) || matched.has(pairId(user.userId, profile.userId)) || reacted.has(profile.userId) || blocked.has(pairId(user.userId, profile.userId))) continue
      const recentBuddy = buddies.filter(post => post.authorId === candidate._openid && ['OPEN', 'FULL'].includes(post.status) && new Date(post.endAt || new Date(post.startAt).getTime() + 7200000).getTime() > now()).sort((left, right) => new Date(right.startAt) - new Date(left.startAt))[0]
      result.push({ ...sanitizeHeartProfile(profile), ...score(me, { ...profile, lastLoginTime: candidate.lastLoginTime }, now()), ...(recentBuddy ? { recentBuddy: { postId: recentBuddy._id, title: recentBuddy.title, category: recentBuddy.category } } : {}) })
    }
    return { rows: result, hasMore: rows.length === windowSize }
  }

  async function getHeartDiscover(openid, data = {}) {
    const user = await heartActor(openid)
    const page = Math.max(1, Math.floor(Number(data.page) || 1))
    const result = await candidates(user, false, page)
    await log('heart_card_viewed', user.userId)
    return ok(result)
  }

  async function likeHeartProfile(openid, data = {}) {
    const user = await heartActor(openid)
    const target = data.targetUserId
    if (typeof target !== 'string' || !target || target === user.userId) return fail('无效对象')
    const result = await transaction(async tx => {
      const pair = await pairValid(tx, user, target)
      if (!pair) return fail('该资料已不可用')
      const id = makeDeterministicId('heartlike', user.userId, target)
      const matchId = pairId(user.userId, target)
      const old = await read(tx, 'heart_likes', id)
      if (old && old.status === 'PASSED') return fail('你已略过这位同学')
      const reverse = await read(tx, 'heart_likes', makeDeterministicId('heartlike', target, user.userId))
      const match = await read(tx, 'heart_matches', matchId)
      await tx.collection('heart_profiles').doc(user.userId).update({ data: { interactionAt: now() } })
      await tx.collection('heart_profiles').doc(target).update({ data: { interactionAt: now() } })
      if (!old || old.status !== 'LIKED') await tx.collection('heart_likes').doc(id).set({ data: { fromUserId: user.userId, toUserId: target, status: 'LIKED', createdAt: now() } })
      const matched = !!match || !!(reverse && reverse.status === 'LIKED')
      if (matched && !match) await tx.collection('heart_matches').doc(matchId).set({ data: { userIds: [user.userId, target].sort(), createdAt: now() } })
      return ok({ status: matched ? 'MATCHED' : 'WAITING', matchId: matched ? matchId : '', targetUserId: target, ...score(pair.a, pair.b, now()) })
    })
    if (result.code === 0) await log(result.data.status === 'MATCHED' ? 'heart_match' : 'heart_like', user.userId)
    return result
  }

  async function passHeartProfile(openid, data = {}) {
    const user = await heartActor(openid)
    const target = data.targetUserId
    if (typeof target !== 'string' || !target || target === user.userId) return fail('无效对象')
    const result = await transaction(async tx => {
      const pair = await pairValid(tx, user, target)
      if (!pair) return fail('该资料已不可用')
      const match = await read(tx, 'heart_matches', pairId(user.userId, target))
      if (match) return ok({ passed: false, status: 'MATCHED' })
      const id = makeDeterministicId('heartlike', user.userId, target)
      const old = await read(tx, 'heart_likes', id)
      if (!old || old.status !== 'PASSED') await tx.collection('heart_likes').doc(id).set({ data: { fromUserId: user.userId, toUserId: target, status: 'PASSED', createdAt: old ? old.createdAt : now(), updatedAt: now() } })
      return ok({ passed: true, status: 'PASSED' })
    })
    if (result.code === 0 && result.data.passed) await log('heart_pass', user.userId)
    return result
  }

  async function getHeartMatches(openid) {
    const user = await heartActor(openid)
    const rows = (await db.collection('heart_matches').where({ userIds: _.all([user.userId]) }).limit(100).get()).data || []
    const result = []
    for (const match of rows) {
      const target = match.userIds.find(id => id !== user.userId)
      const pair = await pairValid(db, user, target)
      if (pair) result.push({ matchId: match._id, ...sanitizeHeartProfile(pair.b), ...score(pair.a, pair.b, now()) })
    }
    return ok(result)
  }

  async function getFateCardQuota(openid) {
    const user = await heartActor(openid)
    const dateKey = dayKey(now())
    const entitlements = getUserEntitlements(user)
    const usage = await read(db, 'fate_card_usage', makeDeterministicId('fateusage', user.userId, dateKey))
    return ok({ dateKey, limit: entitlements.heartFateDailyLimit, remaining: Math.max(0, entitlements.heartFateDailyLimit - (usage ? usage.usedCount : 0)), membershipTier: entitlements.membershipTier })
  }

  async function drawFateCard(openid) {
    const user = await heartActor(openid)
    const dateKey = dayKey(now())
    const limit = getUserEntitlements(user).heartFateDailyLimit
    const quota = await getFateCardQuota(openid)
    if (!quota.data.remaining) { await log('fate_card_limit_reached', user.userId); return fail('今天的缘分已经遇见啦，明天再来看看') }
    const list = { rows: [] }
    for (let page = 1; page <= Math.ceil(FATE_MAX_SCAN / 100); page++) {
      const batchRows = await candidates(user, true, page)
      list.rows.push(...batchRows.rows)
      if (!batchRows.hasMore) break
    }
    if (!list.rows.length) await log('fate_card_candidate_pool_insufficient', user.userId, { candidateCount: 0, scannedCount: FATE_MAX_SCAN })
    const history = (await db.collection('fate_card_history').where({ userId: user.userId }).orderBy('createdAt', 'desc').limit(100).get()).data || []
    const recent = new Set(history.filter(row => now() - row.createdAt < 30 * 86400000).map(row => row.targetUserId))
    const candidate = selectCandidate(list.rows.filter(profile => !recent.has(profile.userId)), random)
    if (!candidate) { await log('fate_card_empty', user.userId); return ok({ empty: true, ...(await getFateCardQuota(openid)).data }) }
    const result = await transaction(async tx => {
      const id = makeDeterministicId('fateusage', user.userId, dateKey)
      const usage = await read(tx, 'fate_card_usage', id)
      const used = usage ? usage.usedCount : 0
      if (used >= limit) return fail('今天的缘分已经遇见啦，明天再来看看')
      const pair = await pairValid(tx, user, candidate.userId, true)
      if (!pair || await read(tx, 'heart_matches', pairId(user.userId, candidate.userId))) return fail('候选人已失效，请重试，次数未扣除')
      const historyId = makeDeterministicId('fatehistory', user.userId, candidate.userId, dateKey)
      if (await read(tx, 'fate_card_history', historyId)) return fail('刚刚已遇见这位同学，请重试')
      const card = { ...sanitizeHeartProfile(pair.b), ...score(pair.a, pair.b, now()) }
      await tx.collection('fate_card_usage').doc(id).set({ data: { userId: user.userId, dateKey, usedCount: used + 1, lastDrawAt: now() } })
      await tx.collection('fate_card_history').doc(historyId).set({ data: { userId: user.userId, targetUserId: candidate.userId, drawDate: dateKey, createdAt: now(), matchScore: card.matchScore } })
      return ok({ card, limit, remaining: limit - used - 1 })
    })
    await log(result.code === 0 ? 'fate_card_drawn' : 'fate_card_limit_reached', user.userId)
    return result
  }

  async function startHeartChat(openid, data = {}) {
    const user = await heartActor(openid)
    const pair = await pairValid(db, user, data.targetUserId)
    if (!pair || !await read(db, 'heart_matches', pairId(user.userId, data.targetUserId))) return fail('双方感兴趣后才能聊天')
    await log('heart_chat_started', user.userId)
    return ok({ targetUserId: data.targetUserId })
  }

  return { getHeartProfile, updateHeartProfile, disableHeartProfile, getHeartDiscover, likeHeartProfile, passHeartProfile, getHeartMatches, drawFateCard, getFateCardQuota, toggleFateCardOptIn, startHeartChat }
}
