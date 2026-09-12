// test/regression/ride-requests.test.js - 拼车申请工作流回归测试
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()
  await f.addUser('author')
  await f.addUser('bob')
  await f.addUser('carol')
  await f.addUser('mallory')

  const rideId = await f.publishRide('author', { maxPeople: 3 })

  // 自己申请自己的行程 → FAIL
  const selfApply = await f.ride.applyRideJoin('author', { rideId })
  assert.notEqual(selfApply.code, 0, 'self apply must fail')

  // bob 申请成功；重复申请幂等（同一 requestId，不产生第二条）
  const first = await f.ride.applyRideJoin('bob', { rideId })
  assert.equal(first.code, 0, `bob apply: ${first.msg}`)
  const second = await f.ride.applyRideJoin('bob', { rideId })
  assert.equal(second.code, 0)
  assert.equal(first.data.requestId, second.data.requestId, 'duplicate apply is idempotent')
  const reqCount = (await f.db.collection('ride_join_requests').where({ rideId }).get()).data.length
  assert.equal(reqCount, 1, 'only one request doc')

  // 通知作者
  assert.ok(f.notifications.some(n => n.type === 'ride_join_request' && n.toOpenid === 'author' && n.fromOpenid === 'bob'), 'author notified')

  // 非作者审批 → FAIL
  const foreignReview = await f.ride.reviewRideJoin('mallory', { requestId: first.data.requestId, decision: 'accept' })
  assert.notEqual(foreignReview.code, 0, 'non-author review must fail')

  // 作者接受 bob
  const accept = await f.ride.reviewRideJoin('author', { requestId: first.data.requestId, decision: 'accept' })
  assert.equal(accept.code, 0, `accept: ${accept.msg}`)
  assert.equal(accept.data.rideStatus, 'OPEN')
  const rideDoc = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.equal(rideDoc.currentPeople, 2, 'author + bob')

  // bob 重复申请 → 提示已加入
  const reapplyAccepted = await f.ride.applyRideJoin('bob', { rideId })
  assert.notEqual(reapplyAccepted.code, 0)

  // 已接受后重复审批 → 该申请已处理
  const reAccept = await f.ride.reviewRideJoin('author', { requestId: first.data.requestId, decision: 'accept' })
  assert.notEqual(reAccept.code, 0)

  // RIDE Contact Grant 已建立，bob ↔ author 可互查
  const grants = (await f.db.collection('contact_grants').where({ sourceId: rideId }).get()).data
  assert.equal(grants.length, 1, 'RIDE grant created')
  assert.equal(grants[0].type, 'RIDE')
  const ensured = await f.contacts.ensureContact('author', 'bob')
  assert.equal(ensured, true, 'grant allows first contact')

  // carol 申请 → 满 3 人后不能申请
  const carolApply = await f.ride.applyRideJoin('carol', { rideId })
  assert.equal(carolApply.code, 0)
  await f.ride.reviewRideJoin('author', { requestId: carolApply.data.requestId, decision: 'accept' })
  const fullRide = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.equal(fullRide.status, 'FULL', 'ride is full at 3/3')

  const dave = await f.addUser('dave')
  const lateApply = await f.ride.applyRideJoin('dave', { rideId })
  assert.notEqual(lateApply.code, 0, 'full ride cannot be applied')

  // carol 退出行程 → 名额回补，FULL → OPEN；dave 可以申请
  const leave = await f.ride.leaveRide('carol', { rideId })
  assert.equal(leave.code, 0, `leave: ${leave.msg}`)
  const reopened = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.equal(reopened.currentPeople, 2)
  assert.equal(reopened.status, 'OPEN', 'FULL → OPEN after leave')
  const daveReapply = await f.ride.applyRideJoin('dave', { rideId })
  assert.equal(daveReapply.code, 0, 'dave can apply after reopen')

  // 发起人不能 leave，只能取消
  const authorLeave = await f.ride.leaveRide('author', { rideId })
  assert.notEqual(authorLeave.code, 0)

  // 撤销申请 → CANCELLED → 可重新申请（幂等重置）
  const cancel = await f.ride.cancelRideJoin('dave', { rideId })
  assert.equal(cancel.code, 0)
  const reapplyAfterCancel = await f.ride.applyRideJoin('dave', { rideId })
  assert.equal(reapplyAfterCancel.code, 0, 're-apply after cancel')

  // REJECTED 后不能重复申请
  const reject = await f.ride.reviewRideJoin('author', { requestId: reapplyAfterCancel.data.requestId, decision: 'reject' })
  assert.equal(reject.code, 0)
  const reapplyRejected = await f.ride.applyRideJoin('dave', { rideId })
  assert.notEqual(reapplyRejected.code, 0, 'rejected request cannot re-apply')

  // 取消行程 → 通知成员 + PENDING 自动关闭
  const malloryRideId = await f.publishRide('mallory', { maxPeople: 2 })
  const carolApply2 = await f.ride.applyRideJoin('carol', { rideId: malloryRideId })
  assert.equal(carolApply2.code, 0)
  const cancelRide = await f.ride.updateRideStatus('mallory', { rideId: malloryRideId, action: 'cancel' })
  assert.equal(cancelRide.code, 0)
  // carol 仅 PENDING 未被接受 → 收到申请关闭通知（而非成员取消通知）
  assert.ok(f.notifications.some(n => n.type === 'ride_join_rejected' && n.toOpenid === 'carol' && n.targetId === malloryRideId), 'pending requester notified')
  const pendingAfter = (await f.db.collection('ride_join_requests').where({ rideId: malloryRideId, status: 'PENDING' }).get()).data
  assert.equal(pendingAfter.length, 0, 'pending requests auto-closed')

  // 已接受成员收到 ride_cancelled
  const memberRideId = await f.publishRide('mallory', { maxPeople: 2 })
  const memberApply = await f.ride.applyRideJoin('bob', { rideId: memberRideId })
  assert.equal(memberApply.code, 0)
  await f.ride.reviewRideJoin('mallory', { requestId: memberApply.data.requestId, decision: 'accept' })
  const cancelRide2 = await f.ride.updateRideStatus('mallory', { rideId: memberRideId, action: 'cancel' })
  assert.equal(cancelRide2.code, 0)
  assert.ok(f.notifications.some(n => n.type === 'ride_cancelled' && n.toOpenid === 'bob'), 'accepted member notified of cancel')

  // 非法状态操作被拒：COMPLETED 后不能再出发
  const departRideId = await f.publishRide('author', { maxPeople: 2 })
  await f.ride.updateRideStatus('author', { rideId: departRideId, action: 'depart' })
  const departAgain = await f.ride.updateRideStatus('author', { rideId: departRideId, action: 'depart' })
  assert.notEqual(departAgain.code, 0, 'DEPARTED → DEPARTED invalid')
  const complete = await f.ride.updateRideStatus('author', { rideId: departRideId, action: 'complete' })
  assert.equal(complete.code, 0, 'DEPARTED → COMPLETED ok')
  const clientForged = await f.ride.updateRideStatus('bob', { rideId: departRideId, action: 'cancel' })
  assert.notEqual(clientForged.code, 0, 'non-author cannot change status')

  console.log('PASS Ride requests: workflow, idempotency, capacity gates, state machine, notifications')
})().catch(error => { console.error(error); process.exitCode = 1 })
