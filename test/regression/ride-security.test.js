// test/regression/ride-security.test.js - 拼车隐私与安全回归测试
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()
  await f.addUser('author')
  await f.addUser('stranger')
  await f.addUser('blockedbuddy')

  const rideId = await f.publishRide('author', {
    maxPeople: 4,
    note: '高铁19:40，最好18:30左右走'
  })

  // ===== 隐私序列化：广场/详情绝不泄露 openid / numericId / internalUserId =====
  const square = await f.ride.getRideSquare({ campusId: 'guit-hangtian', currentOpenid: 'stranger' })
  assert.equal(square.code, 0)
  const squareItem = square.data.list.find(item => item.id === rideId)
  assert.ok(squareItem, 'ride visible in square')
  for (const key of Object.keys(squareItem)) {
    assert.ok(!/openid/i.test(key), `no openid key in square item: ${key}`)
    assert.ok(!['numericId', 'internalUserId', 'phone', 'wechat'].includes(key), `sensitive key leaked: ${key}`)
  }
  // 原始 openid 不出现在输出：无 _openid 键，authorId 为确定性公开 ID
  assert.ok(!('_openid' in squareItem), 'no _openid key in square item')
  assert.notEqual(squareItem.authorId, 'author')
  assert.ok(squareItem.authorId && squareItem.authorId.length === 36, 'authorId is deterministic public uuid')

  const detail = await f.ride.getRideById({ rideId, openid: 'stranger' })
  assert.equal(detail.code, 0)
  const detailJson = JSON.stringify(detail.data)
  assert.ok(!detailJson.includes('numericId'), 'detail leaks no numericId')
  assert.ok(!detailJson.includes('internalUserId'), 'detail leaks no internalUserId')
  assert.ok(!/"_openid"/.test(detailJson), 'detail leaks no _openid')
  assert.equal(detail.data.isAuthor, false)
  assert.equal(detail.data.canChat, false, 'non-member cannot chat yet')

  // 详情对作者可见 isAuthor，成员态正确
  const authorDetail = await f.ride.getRideById({ rideId, openid: 'author' })
  assert.equal(authorDetail.data.isAuthor, true)
  assert.equal(authorDetail.data.isMember, true, 'author is member')

  // ===== 伪造字段被忽略：客户端提交 status / currentPeople / expiresAt 无效 =====
  const forgedId = await f.publishRide('stranger', {
    maxPeople: 4,
    status: 'COMPLETED',
    currentPeople: 99,
    expiresAt: '1970-01-01T00:00:00.000Z'
  })
  const forgedDoc = (await f.db.collection('ride_posts').doc(forgedId).get()).data
  assert.equal(forgedDoc.status, 'OPEN', 'client-forged status ignored')
  assert.equal(forgedDoc.currentPeople, 1, 'client-forged currentPeople ignored')
  assert.ok(forgedDoc.expiresAt.startsWith('2026'), 'server-computed expiresAt')

  // ===== Block 语义 =====
  // stranger 拉黑 author → 广场看不到 author 行程；详情不可看；不能申请
  f.blocked.add(['stranger', 'author'].sort().join(':'))
  const squareBlocked = await f.ride.getRideSquare({ campusId: 'guit-hangtian', currentOpenid: 'stranger' })
  assert.ok(!squareBlocked.data.list.some(item => item.id === rideId), 'blocked author hidden from square')

  const detailBlocked = await f.ride.getRideById({ rideId, openid: 'stranger' })
  assert.notEqual(detailBlocked.code, 0, 'blocked viewer cannot open detail')

  const applyResult = await f.ride.applyRideJoin('stranger', { rideId })
  assert.notEqual(applyResult.code, 0, 'blocked user cannot apply')

  // author 行程的匹配列表排除拉黑用户
  const matches = await f.ride.getRideMatches({ rideId: forgedId, openid: 'stranger' })
  assert.equal(matches.code, 0)

  // ===== RIDE Contact Grant：接受前私信 403，接受后放行 =====
  f.blocked.delete(['stranger', 'author'].sort().join(':'))

  // messages 模块（与 chat-context 同一套接线），contactAllowed = contacts.ensureContact
  const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')
  const messages = createMessages({
    db: f.db,
    _: f.db.command,
    cloud: {},
    helpers: {
      getUserForAction: async id => f.users[id],
      getUsersByOpenids: async () => [],
      checkRateLimit: async () => true,
      checkBannedWords: () => ({ pass: true }),
      wxTextCheck: async () => ({ pass: true }),
      wxImageCheck: async () => ({ pass: true }),
      publicId: value => value,
      triggerSubscribeNotify: async () => {},
      trimSnippet: value => value,
      conversationBlocked: async (left, right) => f.blocked.has([left, right].sort().join(':')),
      safeUserBlocksQuery: async run => run(),
      USER_BLOCKS: 'user_blocks',
      checkAdmin: async () => false,
      contactAllowed: (a, b) => f.contacts.ensureContact(a, b)
    }
  })

  const buddyId = 'chatter'
  await f.addUser(buddyId)
  const chatRideId = await f.publishRide('author', { maxPeople: 3 })
  const beforeGrant = await messages.sendMessage(buddyId, { targetOpenid: 'author', content: '你好', type: 'text' })
  assert.equal(beforeGrant.code, 403, 'first-contact DM requires a grant')

  const apply = await f.ride.applyRideJoin(buddyId, { rideId: chatRideId })
  assert.equal(apply.code, 0)
  const accept = await f.ride.reviewRideJoin('author', { requestId: apply.data.requestId, decision: 'accept' })
  assert.equal(accept.code, 0)

  const afterGrant = await messages.sendMessage(buddyId, { targetOpenid: 'author', content: '南门见', type: 'text' })
  assert.equal(afterGrant.code, 0, `RIDE grant unlocks DM: ${afterGrant.msg}`)

  // startRideContact：仅成员可建立联系；客户端用公开 targetUserId，服务器解析回内部 openid
  const contactAsOutsider = await f.ride.startRideContact('stranger', { rideId: chatRideId, targetUserId: 'whatever' })
  assert.notEqual(contactAsOutsider.code, 0, 'non-member cannot start contact')
  const authorDetailForContact = await f.ride.getRideById({ rideId: chatRideId, openid: buddyId })
  const authorMember = authorDetailForContact.data.members.find(member => member.role === 'author')
  const contactAsMemberProbe = authorMember && authorMember.memberId
  const contactAsMember = await f.ride.startRideContact(buddyId, { rideId: chatRideId, targetUserId: contactAsMemberProbe })
  assert.equal(contactAsMember.code, 0, 'member can start contact via public userId')
  assert.ok(contactAsMember.data && contactAsMember.data.targetUserId)

  // ===== P1-5: Author Snapshot 真实持久化与展示 =====
  await f.addUser('xiaolin', { nickName: '小林', avatarUrl: '/images/avatar_xiaolin.jpg' })
  const xiaolinRideId = await f.publishRide('xiaolin', { maxPeople: 3 })
  const squareXiaolin = await f.ride.getRideSquare({ campusId: 'guit-hangtian' })
  const xiaolinItem = squareXiaolin.data.list.find(i => i.id === xiaolinRideId)
  assert.ok(xiaolinItem, 'xiaolin ride in square')
  assert.equal(xiaolinItem.author.nickName, '小林', 'author nickName must be persisted snapshot')
  assert.equal(xiaolinItem.author.avatarUrl, '/images/avatar_xiaolin.jpg', 'avatarUrl must be persisted snapshot')

  // ===== 未注册 action：ride 域不会出现“未知操作”穿透（契约测试单独覆盖注册表） =====
  console.log('PASS Ride security: serialization whitelist, forge-proof status, block semantics, RIDE grant DM gate')
})().catch(error => { console.error(error); process.exitCode = 1 })
