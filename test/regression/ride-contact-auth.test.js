// test/regression/ride-contact-auth.test.js - 拼车私信权限与矩阵测试 (§26)
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()
  await f.addUser('author_x', { nickName: '发起人' })
  await f.addUser('member_a', { nickName: '成员A' })
  await f.addUser('member_b', { nickName: '成员B' })
  await f.addUser('outsider', { nickName: '路人' })

  const rideId = await f.publishRide('author_x', { maxPeople: 4 })

  // 成员A和成员B加入
  const appA = await f.ride.applyRideJoin('member_a', { rideId })
  await f.ride.reviewRideJoin('author_x', { requestId: appA.data.requestId, decision: 'accept' })
  const appB = await f.ride.applyRideJoin('member_b', { rideId })
  await f.ride.reviewRideJoin('author_x', { requestId: appB.data.requestId, decision: 'accept' })

  // 1. Author → Member A: PASS
  const authorToA = await f.ride.startRideContact('author_x', { rideId, targetOpenid: 'member_a' })
  assert.equal(authorToA.code, 0, 'Author -> Member A must PASS')
  assert.ok(authorToA.data && authorToA.data.targetUserId)

  // 2. Member A → Author: PASS
  const aToAuthor = await f.ride.startRideContact('member_a', { rideId, targetOpenid: 'author_x' })
  assert.equal(aToAuthor.code, 0, 'Member A -> Author must PASS')

  // 3. Member A → Member B: FAIL (禁止普通成员间私信)
  const aToB = await f.ride.startRideContact('member_a', { rideId, targetOpenid: 'member_b' })
  assert.notEqual(aToB.code, 0, 'Member A -> Member B must FAIL')
  assert.ok(/发起人/.test(aToB.msg), `expected explanation in msg: ${aToB.msg}`)

  // 4. Non-member → Author: FAIL
  const outsiderToAuthor = await f.ride.startRideContact('outsider', { rideId, targetOpenid: 'author_x' })
  assert.notEqual(outsiderToAuthor.code, 0, 'Non-member -> Author must FAIL')

  // 5. Author → Outsider: FAIL
  const authorToOutsider = await f.ride.startRideContact('author_x', { rideId, targetOpenid: 'outsider' })
  assert.notEqual(authorToOutsider.code, 0, 'Author -> Outsider must FAIL')

  // 6. Blocked pair: FAIL
  f.blocked.add(['author_x', 'member_b'].sort().join(':'))
  const blockedContact = await f.ride.startRideContact('member_b', { rideId, targetOpenid: 'author_x' })
  assert.notEqual(blockedContact.code, 0, 'Blocked pair must FAIL')
  f.blocked.delete(['author_x', 'member_b'].sort().join(':'))

  // 7. Cancelled Ride: 新建 Contact 必须 FAIL (§20)
  const cancelRideId = await f.publishRide('author_x', { maxPeople: 2 })
  const appCancel = await f.ride.applyRideJoin('member_a', { rideId: cancelRideId })
  await f.ride.reviewRideJoin('author_x', { requestId: appCancel.data.requestId, decision: 'accept' })
  await f.ride.updateRideStatus('author_x', { rideId: cancelRideId, action: 'cancel' })
  const cancelContact = await f.ride.startRideContact('member_a', { rideId: cancelRideId, targetOpenid: 'author_x' })
  assert.notEqual(cancelContact.code, 0, 'Cancelled ride cannot create new contact grant')

  // 8. Expired Ride: 新建 Contact 必须 FAIL (§40)
  const expRideId = await f.publishRide('author_x', { maxPeople: 2 })
  const appExp = await f.ride.applyRideJoin('member_a', { rideId: expRideId })
  await f.ride.reviewRideJoin('author_x', { requestId: appExp.data.requestId, decision: 'accept' })
  f.addTime(65)
  const expContact = await f.ride.startRideContact('member_a', { rideId: expRideId, targetOpenid: 'author_x' })
  assert.notEqual(expContact.code, 0, 'Expired ride cannot create new contact grant')

  console.log('PASS Ride contact authorization: author-member only, member-member blocked, state gated')
})().catch(error => { console.error(error); process.exitCode = 1 })
