// test/regression/ride-report.test.js - 拼车举报流程与后台目标映射测试 (§11)
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')
const createSafety = require('../../campus_treehole/cloudfunctions/dbOperations/modules/safety')
const createWebAdmin = require('../../campus_treehole/cloudfunctions/dbOperations/webAdminHandlers')

;(async () => {
  const f = await fixture()
  await f.addUser('reporter', { nickName: '举报人' })
  await f.addUser('author', { nickName: '发起人' })
  await f.addUser('admin_user', { nickName: '管理员', role: 'admin' })

  const rideId = await f.publishRide('author', { maxPeople: 3 })

  const safety = createSafety({
    db: f.db,
    _: f.db.command,
    helpers: {
      getUserForAction: async id => f.users[id],
      checkAdmin: async id => (f.users[id] && f.users[id].role === 'admin'),
      safeUserBlocksQuery: async run => run(),
      USER_BLOCKS: 'user_blocks',
      isUserBlocksUnavailableError: () => false,
      removeFollowBetween: async () => {},
      normalizeBatchAuthors: authors => authors,
      isCollectionNotExistError: () => false,
      ensureCollection: async () => {}
    }
  })

  // 1. 举报真实存在的 ride: PASS
  const validReport = await safety.reportContent('reporter', {
    targetId: rideId,
    targetType: 'ride',
    reason: '虚假行程'
  })
  assert.equal(validReport.code, 0, 'valid ride report must PASS')
  assert.ok(/尽快处理/.test(validReport.msg))

  // 2. 重复举报: FAIL
  const dupReport = await safety.reportContent('reporter', {
    targetId: rideId,
    targetType: 'ride',
    reason: '再次举报'
  })
  assert.notEqual(dupReport.code, 0, 'duplicate report must FAIL')
  assert.ok(/已举报过/.test(dupReport.msg))

  // 3. 举报不存在的 rideId: FAIL
  const fakeReport = await safety.reportContent('reporter', {
    targetId: 'ride_non_existent_123',
    targetType: 'ride',
    reason: '虚假行程'
  })
  assert.notEqual(fakeReport.code, 0, 'non-existent ride report must FAIL')
  assert.ok(/不存在/.test(fakeReport.msg))

  // 4. 管理员后台 mapping: targetType=ride -> ride_posts
  const webAdmin = createWebAdmin(f.db, f.db.command, {}, {
    getEventHelpers: () => ({}),
    getExpressHelpers: () => ({}),
    getUsersByOpenids: async () => []
  })

  const reports = (await f.db.collection('reports').where({ targetType: 'ride' }).get()).data
  assert.equal(reports.length, 1, 'one report record in DB')
  const reportDoc = reports[0]
  assert.equal(reportDoc.status, 'pending')

  // 管理员处理举报（如处理违规下架对应 ride_post）
  const handleRes = await webAdmin('handleReport', {
    reportId: reportDoc._id,
    result: 'resolved' // webAdmin 在 result === 'resolved' 时执行根据 reportTargetCollection 删除对应内容
  })
  assert.equal(handleRes.code, 0, 'admin handleReport on ride must succeed')

  const postAfter = (await f.db.collection('ride_posts').doc(rideId).get()).data
  assert.ok(postAfter && postAfter.status === 'deleted', 'target ride_post marked deleted by admin handleReport')

  console.log('PASS Ride report: real existence validated, duplicate blocked, webAdmin target mapped')
})().catch(error => { console.error(error); process.exitCode = 1 })
