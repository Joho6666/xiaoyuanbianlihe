const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const createContacts = require('../../campus_treehole/cloudfunctions/dbOperations/modules/contacts')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')
const createSafety = require('../../campus_treehole/cloudfunctions/dbOperations/modules/safety')

;(async () => {
  const f = await fixture()
  const seller = await f.add('seller', 'male')
  const buyer = await f.add('buyer', 'female')
  const freshBuyer = await f.add('fresh_buyer', 'female')
  const contacts = createContacts({
    db: f.db, _: f.db.command,
    helpers: { getUserForAction: async id => f.users[id], conversationBlocked: async (a, b) => f.blocked.has([a, b].sort().join(':')) }
  })
  const messages = createMessages({
    db: f.db, _: f.db.command,
    helpers: {
      getUserForAction: async id => f.users[id], getUsersByOpenids: async () => [], checkRateLimit: async () => true,
      checkBannedWords: () => ({ pass: true }), wxTextCheck: async () => ({ pass: true }), wxImageCheck: async () => ({ pass: true }),
      triggerSubscribeNotify: async () => {}, trimSnippet: value => value, conversationBlocked: async (a, b) => f.blocked.has([a, b].sort().join(':')),
      safeUserBlocksQuery: async run => run(), USER_BLOCKS: 'user_blocks', checkAdmin: async () => false, contactAllowed: contacts.ensureContact
    }
  })

  assert.equal((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: '陌生私聊' })).code, 403, 'legacy entry cannot create first contact')
  assert.equal((await messages.getMessages(buyer.id, seller.id)).code, 403, 'legacy entry cannot read a new conversation')

  // Heart chat is gated by a real match, then creates a server-owned grant.
  assert.notEqual((await f.heart.startHeartChat(buyer.id, { targetUserId: seller.userId })).code, 0, 'unmatched Heart users cannot start chat')
  assert.equal((await f.heart.likeHeartProfile(buyer.id, { targetUserId: seller.userId })).data.status, 'WAITING')
  assert.equal((await f.heart.likeHeartProfile(seller.id, { targetUserId: buyer.userId })).data.status, 'MATCHED')
  assert.equal((await f.heart.startHeartChat(buyer.id, { targetUserId: seller.userId })).code, 0, 'matched Heart users can start chat')
  assert.equal((await f.heart.startHeartChat(buyer.id, { targetUserId: seller.userId })).code, 0, 'Heart grant upsert is idempotent')
  const heartGrants = (await f.db.collection('contact_grants').where({ type: 'HEART' }).limit(10).get()).data || []
  assert.equal(heartGrants.length, 1)
  assert.deepEqual(Object.keys(heartGrants[0]).sort(), ['_id', 'active', 'createdAt', 'expiresAt', 'sourceId', 'type', 'userIds'].sort(), 'grant schema is minimal')
  assert(!JSON.stringify(heartGrants[0]).includes('openid'), 'grant never stores OpenID')
  assert.equal((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: '匹配后聊天' })).code, 0)

  await f.db.collection('market_goods').doc('active_goods').set({ data: { _openid: seller.id, status: 'active' } })
  assert.equal((await contacts.startMarketContact(buyer.id, { goodsId: 'active_goods' })).code, 0, 'active Market item grants contact')
  assert.equal((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: '询问商品' })).code, 0)
  assert.equal((await contacts.startMarketContact(freshBuyer.id, { goodsId: 'active_goods' })).code, 0, 'a second active item grant is independent')
  assert.equal((await messages.sendMessage(freshBuyer.id, { targetOpenid: seller.id, type: 'text', content: '下架前询问' })).code, 0)
  await f.db.collection('market_goods').doc('active_goods').update({ data: { status: 'deleted' } })
  assert.equal((await messages.sendMessage(freshBuyer.id, { targetOpenid: seller.id, type: 'text', content: '下架后无新消息' })).code, 403, 'inactive Market item cannot authorize a new conversation')
  await f.db.collection('mutual_posts').doc('mutual').set({ data: { _openid: seller.id, status: 'open' } })
  assert.equal((await contacts.startMutualContact(buyer.id, { postId: 'mutual' })).code, 0, 'open Mutual entry grants contact')
  f.blocked.add([buyer.id, seller.id].sort().join(':'))
  assert.equal((await contacts.startBridgeContact(buyer.id, { targetOpenid: seller.id })).code, -1, 'block rejects Bridge contact')
  assert.notEqual((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: 'blocked' })).code, 0, 'block rejects a granted conversation')

  // Buddy: only organiser and accepted members can establish a grant.
  const organiser = await f.add('organiser', 'male')
  const member = await f.add('member', 'female')
  const pending = await f.add('pending', 'female')
  const outsider = await f.add('outsider', 'female')
  await f.db.collection('buddy_posts').doc('buddy-1').set({ data: { _openid: organiser.id, authorId: organiser.id, status: 'OPEN' } })
  await f.db.collection('buddy_applications').doc('accepted-1').set({ data: { postId: 'buddy-1', applicantId: member.id, status: 'ACCEPTED' } })
  await f.db.collection('buddy_applications').doc('pending-1').set({ data: { postId: 'buddy-1', applicantId: pending.id, status: 'PENDING' } })
  assert.equal((await contacts.startBuddyContact(organiser.id, { postId: 'buddy-1' })).code, 0, 'organiser can contact accepted member')
  assert.equal((await contacts.startBuddyContact(member.id, { postId: 'buddy-1', targetOpenid: organiser.id })).code, 0, 'accepted member can contact organiser')
  assert.notEqual((await contacts.startBuddyContact(pending.id, { postId: 'buddy-1', targetOpenid: organiser.id })).code, 0, 'pending applicant cannot contact')
  assert.notEqual((await contacts.startBuddyContact(outsider.id, { postId: 'buddy-1', targetOpenid: organiser.id })).code, 0, 'non-participant cannot contact')

  // Bridge requires both language profiles; Existing requires historical messages.
  for (const user of [buyer, freshBuyer]) {
    f.users[user.id].languageProfile = { nativeLanguages: ['zh'], targetLanguages: ['en'] }
    await f.db.collection('users').doc(f.users[user.id]._id).update({ data: { languageProfile: f.users[user.id].languageProfile } })
  }
  assert.equal((await contacts.startBridgeContact(buyer.id, { targetOpenid: freshBuyer.id })).code, 0, 'valid language profiles grant Bridge contact')
  assert.notEqual((await contacts.startBridgeContact(organiser.id, { targetOpenid: outsider.id })).code, 0, 'missing language profile rejects Bridge contact')
  assert.notEqual((await contacts.startExistingContact(organiser.id, { targetOpenid: outsider.id })).code, 0, 'no history cannot start Existing contact')
  await f.db.collection('messages').add({ data: { fromOpenid: buyer.id, toOpenid: freshBuyer.id, type: 'text', content: '历史消息', createTime: new Date() } })
  assert.equal((await contacts.startExistingContact(buyer.id, { targetOpenid: freshBuyer.id })).code, 0, 'history permits Existing contact continuation')

  // Banned targets are not active contact endpoints, even if a prior source existed.
  const safety = createSafety({ db: f.db, _: f.db.command, cloud: {}, helpers: {
    getUserForAction: async id => f.users[id], checkAdmin: async () => true,
    getUsersByOpenids: async () => [], isCollectionNotExistError: () => false,
    isUserBlocksUnavailableError: () => false
  } })
  await f.db.collection('market_goods').doc('ban-goods').set({ data: { _openid: organiser.id, status: 'active' } })
  assert.equal((await contacts.startMarketContact(buyer.id, { goodsId: 'ban-goods' })).code, 0)
  assert.equal((await safety.banUser('admin', organiser.id)).code, 0, 'admin ban succeeds')
  assert.notEqual((await contacts.startMarketContact(freshBuyer.id, { goodsId: 'ban-goods' })).code, 0, 'banned target cannot receive new contact grants')
  console.log('PASS Contact grants: Market invalidation, Mutual, legacy rejection, and block enforcement')
})().catch(error => { console.error(error); process.exitCode = 1 })
