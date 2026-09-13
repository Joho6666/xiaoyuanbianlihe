// test/regression/ride-e2e.test.js - 拼车全场景端到端与过期测试 (§39 双账号 + §40 过期)
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()

  // 模拟两个学生用户：学生 A（发起人）、学生 B（加入者）、学生 C（第三人）
  await f.addUser('student_a', { nickName: '小林', avatarUrl: '/images/avatar_a.png' })
  await f.addUser('student_b', { nickName: '阿杰', avatarUrl: '/images/avatar_b.png' })
  await f.addUser('student_c', { nickName: '小宇', avatarUrl: '/images/avatar_c.png' })

  console.log('=== §39 双账号 E2E 完整工作流 ===')

  // 1. 学生 A 打开拼车同行 -> 我要拼车 -> 桂航南门 -> 桂林北站 -> NOW 3人 -> 发布
  const publishRes = await f.ride.publishRide('student_a', {
    departureMode: 'NOW',
    origin: { poiId: 'guat-south-gate', name: '桂林航天工业学院（南校门）', address: '桂林市七星区金鸡路2号', latitude: 25.3321, longitude: 110.3653 },
    destination: { poiId: 'guilin-north-station', name: '桂林北站', address: '桂林市叠彩区站前路2号', latitude: 25.3390, longitude: 110.3135 },
    maxPeople: 3,
    note: '高铁19:40，最好18:30左右走',
    campusId: 'guit-hangtian'
  })
  assert.equal(publishRes.code, 0, 'publish must succeed')
  const rideId = publishRes.data.rideId

  // 2. 检查广场列表与自动匹配推荐
  const squareRes = await f.ride.getRideSquare({ campusId: 'guit-hangtian', currentOpenid: 'student_b' })
  assert.equal(squareRes.code, 0)
  const squareItem = squareRes.data.list.find(r => r.id === rideId)
  assert.ok(squareItem, 'A 的行程必须在广场可见')
  assert.equal(squareItem.author.nickName, '小林', 'authorSnapshot 必须正确展示为小林')
  assert.equal(squareItem.remainPeople, 2, '3人上限，已占1，余2人')

  // 3. 学生 B 打开广场，查看行程详情 -> 申请加入
  const detailForB = await f.ride.getRideById({ rideId, openid: 'student_b' })
  assert.equal(detailForB.code, 0)
  assert.equal(detailForB.data.isMember, false)
  assert.equal(detailForB.data.canChat, false, '未通过前不可私信')

  const applyRes = await f.ride.applyRideJoin('student_b', { rideId })
  assert.equal(applyRes.code, 0, 'B apply must succeed')
  assert.equal(applyRes.data.status, 'PENDING')

  // 4. 学生 A 收到申请并接受
  const reqRes = await f.ride.getRideRequests('student_a', { tab: 'received' })
  assert.equal(reqRes.code, 0)
  const reqItem = reqRes.data.list.find(item => item._id === applyRes.data.requestId)
  assert.ok(reqItem, 'A 收到 B 的加入申请')

  const acceptRes = await f.ride.reviewRideJoin('student_a', { requestId: reqItem._id, decision: 'accept' })
  assert.equal(acceptRes.code, 0, 'A accept B must succeed')

  // 5. 验证 B 成为成员，B 可以联系 A，但 B 不能联系另一个普通成员 C
  const detailAfterAccept = await f.ride.getRideById({ rideId, openid: 'student_b' })
  assert.equal(detailAfterAccept.data.isMember, true, 'B is now a confirmed member')
  assert.equal(detailAfterAccept.data.canChat, true, 'B now allowed to chat')

  // B 联系 A (Author) -> PASS
  const bContactA = await f.ride.startRideContact('student_b', { rideId, targetOpenid: 'student_a' })
  assert.equal(bContactA.code, 0, 'B -> A (author) must PASS')

  // C 申请加入并被接受
  const applyC = await f.ride.applyRideJoin('student_c', { rideId })
  await f.ride.reviewRideJoin('student_a', { requestId: applyC.data.requestId, decision: 'accept' })

  // B 联系 C (普通成员间私信) -> FAIL (§26)
  const bContactC = await f.ride.startRideContact('student_b', { rideId, targetOpenid: 'student_c' })
  assert.notEqual(bContactC.code, 0, 'B (member) -> C (member) must FAIL')

  // 6. B 退出行程 -> 名额回补，join request 重置为 CANCELLED，B 可重新申请
  const leaveRes = await f.ride.leaveRide('student_b', { rideId })
  assert.equal(leaveRes.code, 0, 'B leave must succeed')

  const postAfterLeave = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.equal(postAfterLeave.currentPeople, 2, 'seats restored from 3 to 2')

  const myReqsB = await f.ride.getRideRequests('student_b', { tab: 'sent' })
  const bReqItem = myReqsB.data.list.find(item => item.ride && item.ride.id === rideId)
  assert.equal(bReqItem.status, 'CANCELLED', 'B request status synced to CANCELLED')

  const reapplyB = await f.ride.applyRideJoin('student_b', { rideId })
  assert.equal(reapplyB.code, 0, 'B can re-apply after leaving')
  assert.equal(reapplyB.data.status, 'PENDING')

  console.log('=== §40 过期行程 E2E 测试 ===')

  // 创建一个即将过期的行程
  const expRideId = await f.publishRide('student_a', { maxPeople: 2 })
  const expApp = await f.ride.applyRideJoin('student_b', { rideId: expRideId })
  assert.equal(expApp.code, 0)

  // 快进 65 分钟（NOW 60min TTL 到期）
  f.addTime(65)

  // 1. 申请已过期行程 -> FAIL
  const applyExpired = await f.ride.applyRideJoin('student_c', { rideId: expRideId })
  assert.notEqual(applyExpired.code, 0, 'applying to expired ride must fail')
  assert.ok(/不可申请|过期/.test(applyExpired.msg), applyExpired.msg)

  // 2. 审批已过期行程中的 PENDING 申请 -> FAIL (§3 / P1-2)
  const reviewExpired = await f.ride.reviewRideJoin('student_a', { requestId: expApp.data.requestId, decision: 'accept' })
  assert.notEqual(reviewExpired.code, 0, 'approving expired ride must fail')
  assert.ok(/过期/.test(reviewExpired.msg), reviewExpired.msg)

  // 3. 对已过期行程建立新联系 -> FAIL (§21)
  const contactExpired = await f.ride.startRideContact('student_a', { rideId: expRideId, targetOpenid: 'student_b' })
  assert.notEqual(contactExpired.code, 0, 'contact on expired ride must fail')
  assert.ok(/已结束|过期/.test(contactExpired.msg), contactExpired.msg)

  // 4. 发起人尝试标记出发已过期行程 -> FAIL
  const departExpired = await f.ride.updateRideStatus('student_a', { rideId: expRideId, action: 'depart' })
  assert.notEqual(departExpired.code, 0, 'cannot depart expired ride')

  // 5. 详情页仍可查看基础信息，状态显示为 EXPIRED
  const expDetail = await f.ride.getRideById({ rideId: expRideId, openid: 'student_a' })
  assert.equal(expDetail.code, 0)
  assert.equal(expDetail.data.status, 'EXPIRED', 'detail shows EXPIRED status')

  console.log('PASS Ride E2E: §39 dual-account full flow + §40 expiration full protection')
})().catch(error => { console.error(error); process.exitCode = 1 })
