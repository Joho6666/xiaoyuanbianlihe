const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')

;(async () => {
  const f = await fixture()
  const a = await f.add('market_sender', 'male')
  const b = await f.add('market_receiver')
  const notifications = []
  const messages = createMessages({
    db: f.db, _: f.db.command,
    helpers: {
      getUserForAction: async id => f.users[id], getUsersByOpenids: async () => [],
      checkRateLimit: async () => true, checkBannedWords: () => ({ pass: true }),
      wxTextCheck: async () => ({ pass: true }), wxImageCheck: async () => ({ pass: true }),
      triggerSubscribeNotify: async payload => notifications.push(payload), trimSnippet: value => value,
      conversationBlocked: async (left, right) => f.blocked.has([left, right].sort().join(':')), safeUserBlocksQuery: async run => run(), USER_BLOCKS: 'user_blocks', checkAdmin: async () => false,
      publicId: value => value
    }
  })
  assert.notEqual((await f.heart.startHeartChat(a.id, { targetUserId: b.userId })).code, 0, 'Heart source requires a match')
  for (const content of ['market contact', 'buddy accepted contact', 'existing conversation']) {
    assert.equal((await messages.sendMessage(a.id, { targetOpenid: b.id, content, type: 'text' })).code, 0, content)
  }
  assert.equal(notifications.length, 3)
  assert(notifications.every(note => /targetUserId=/.test(note.page) && !/openid=/i.test(note.page)))
  assert.equal((await f.heart.likeHeartProfile(a.id, { targetUserId: b.userId })).data.status, 'WAITING')
  assert.equal((await f.heart.likeHeartProfile(b.id, { targetUserId: a.userId })).data.status, 'MATCHED')
  assert.equal((await f.heart.startHeartChat(a.id, { targetUserId: b.userId })).code, 0)
  f.blocked.add([a.id, b.id].sort().join(':'))
  assert.notEqual((await messages.sendMessage(a.id, { targetOpenid: b.id, content: 'blocked', type: 'text' })).code, 0)
  console.log('PASS Chat contexts: generic business chat stays open, Heart start requires match, block rejects all')
})().catch(error => { console.error(error); process.exitCode = 1 })
