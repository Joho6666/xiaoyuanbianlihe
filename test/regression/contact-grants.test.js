const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const createContacts = require('../../campus_treehole/cloudfunctions/dbOperations/modules/contacts')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')

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
  await f.db.collection('market_goods').doc('active_goods').set({ data: { _openid: seller.id, status: 'active' } })
  assert.equal((await contacts.startMarketContact(buyer.id, { goodsId: 'active_goods' })).code, 0, 'active Market item grants contact')
  assert.equal((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: '询问商品' })).code, 0)
  assert.equal((await contacts.startMarketContact(freshBuyer.id, { goodsId: 'active_goods' })).code, 0, 'a second active item grant is independent')
  await f.db.collection('market_goods').doc('active_goods').update({ data: { status: 'deleted' } })
  assert.equal((await messages.sendMessage(freshBuyer.id, { targetOpenid: seller.id, type: 'text', content: '下架后无新消息' })).code, 403, 'inactive Market item cannot authorize a new conversation')
  await f.db.collection('mutual_posts').doc('mutual').set({ data: { _openid: seller.id, status: 'open' } })
  assert.equal((await contacts.startMutualContact(buyer.id, { postId: 'mutual' })).code, 0, 'open Mutual entry grants contact')
  f.blocked.add([buyer.id, seller.id].sort().join(':'))
  assert.equal((await contacts.startBridgeContact(buyer.id, { targetOpenid: seller.id })).code, -1, 'block rejects Bridge contact')
  assert.notEqual((await messages.sendMessage(buyer.id, { targetOpenid: seller.id, type: 'text', content: 'blocked' })).code, 0, 'block rejects a granted conversation')
  console.log('PASS Contact grants: Market invalidation, Mutual, legacy rejection, and block enforcement')
})().catch(error => { console.error(error); process.exitCode = 1 })
