// test/regression/ride-capacity.test.js - 拼车容量并发安全回归测试
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()
  await f.addUser('author')
  await f.addUser('racer1')
  await f.addUser('racer2')
  await f.addUser('racer3')
  await f.addUser('racer4')

  // maxPeople=2（发起人 + 1 个空位）：两人同时抢最后 1 席
  const rideId = await f.publishRide('author', { maxPeople: 2 })

  const r1 = await f.ride.applyRideJoin('racer1', { rideId })
  const r2 = await f.ride.applyRideJoin('racer2', { rideId })
  assert.equal(r1.code, 0)
  assert.equal(r2.code, 0)

  // 事务串行化：两个审批并发提交，只有一个成功
  const [review1, review2] = await Promise.all([
    f.ride.reviewRideJoin('author', { requestId: r1.data.requestId, decision: 'accept' }),
    f.ride.reviewRideJoin('author', { requestId: r2.data.requestId, decision: 'accept' })
  ])
  const codes = [review1.code, review2.code].sort((a, b) => a - b)
  assert.deepEqual(codes, [-1, 0], `exactly one accept succeeds: ${review1.msg} / ${review2.msg}`)

  const rideDoc = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.equal(rideDoc.currentPeople, 2, 'currentPeople == maxPeople')
  assert.ok(rideDoc.currentPeople <= rideDoc.maxPeople, 'currentPeople never exceeds maxPeople')
  assert.equal(rideDoc.status, 'FULL', 'ride FULL after last seat taken')

  const acceptedCount = (await f.db.collection('ride_join_requests').where({ rideId, status: 'ACCEPTED' }).get()).data.length
  assert.equal(acceptedCount, 1, 'exactly one ACCEPTED request')
  const members = (await f.db.collection('ride_members').where({ rideId }).get()).data
  assert.equal(members.length, 2, 'author + one member doc')

  // 失败者申请仍是 PENDING，且行程满员后不能再接受
  const loser = review1.code === 0 ? 'racer2' : 'racer1'
  const loserRequestId = review1.code === 0 ? r2.data.requestId : r1.data.requestId
  const loserDoc = (await f.db.collection('ride_join_requests').doc(loserRequestId).get()).data
  assert.equal(loserDoc.status, 'PENDING', `loser (${loser}) stays PENDING`)
  const lateAccept = await f.ride.reviewRideJoin('author', { requestId: loserRequestId, decision: 'accept' })
  assert.notEqual(lateAccept.code, 0, 'FULL ride cannot accept more')

  // 并发抢 3 席中最后 1 席（3 人同时申请、同时审批）
  const ride2 = await f.publishRide('author', { departureMode: 'SCHEDULED', departureTime: '2026-09-12T10:00:00.000Z', maxPeople: 4 })
  const apps = []
  for (const racer of ['racer2', 'racer3', 'racer4']) {
    const applied = await f.ride.applyRideJoin(racer, { rideId: ride2 })
    apps.push(applied.data.requestId)
  }
  // 先接受 2 人（占 3/4）
  await f.ride.reviewRideJoin('author', { requestId: apps[0], decision: 'accept' })
  await f.ride.reviewRideJoin('author', { requestId: apps[1], decision: 'accept' })
  const midRide = (await f.db.collection('ride_posts').doc(ride2).get()).data
  assert.equal(midRide.currentPeople, 3)
  // 剩余 1 席，1 个并发审批
  const [last] = await Promise.all([
    f.ride.reviewRideJoin('author', { requestId: apps[2], decision: 'accept' })
  ])
  assert.equal(last.code, 0)
  const finalRide = (await f.db.collection('ride_posts').doc(ride2).get()).data
  assert.equal(finalRide.currentPeople, 4)
  assert.ok(finalRide.currentPeople <= finalRide.maxPeople)
  assert.equal(finalRide.status, 'FULL')

  // FULL 后 leave → 名额回补且并发安全
  const leaveRide = await f.publishRide('author', { maxPeople: 2 })
  const leaveApp = await f.ride.applyRideJoin('racer1', { rideId: leaveRide })
  await f.ride.reviewRideJoin('author', { requestId: leaveApp.data.requestId, decision: 'accept' })
  const afterFull = (await f.db.collection('ride_posts').doc(leaveRide).get()).data
  assert.equal(afterFull.status, 'FULL')
  const left = await f.ride.leaveRide('racer1', { rideId: leaveRide })
  assert.equal(left.code, 0)
  const afterLeave = (await f.db.collection('ride_posts').doc(leaveRide).get()).data
  assert.equal(afterLeave.currentPeople, 1)
  assert.equal(afterLeave.status, 'OPEN', 'FULL → OPEN after leave')

  console.log('PASS Ride capacity: serialized transactions, no over-acceptance, leave restores OPEN')
})().catch(error => { console.error(error); process.exitCode = 1 })
