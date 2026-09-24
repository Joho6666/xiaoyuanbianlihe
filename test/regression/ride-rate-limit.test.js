// test/regression/ride-rate-limit.test.js - 限流时间戳契约回归测试（真实 helper，不做行为替身）
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')
const { createRateLimiter } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/rate-limit')

;(async () => {
  const f = await fixture({ useRealRateLimit: true })
  await f.addUser('author')
  await f.addUser('joiner')

  // ===== 契约证明：字段不对齐时计数永远为 0（旧 bug 复现），对齐后生效 =====
  for (let i = 0; i < 10; i += 1) {
    const published = await f.ride.publishRide('author', {
      departureMode: 'NOW',
      origin: { poiId: 'guat-south-gate', name: '桂航南门', address: '', latitude: 25.3321, longitude: 110.3653 },
      destination: { poiId: 'guilin-north-station', name: '桂林北站', address: '', latitude: 25.3390, longitude: 110.3135 },
      maxPeople: 3,
      campusId: 'guit-hangtian'
    })
    assert.equal(published.code, 0, `publish #${i + 1}: ${published.msg}`)
  }
  const limiter = createRateLimiter({ db: f.db, _: f.db.command, now: () => f.time() })
  assert.equal(await limiter.check('author', 'ride_posts', 60, 10, 'createdAt'), false, '10/10 已到上限，第 11 次应被拦截')
  assert.equal(await limiter.check('author', 'ride_posts', 60, 10, 'createTime'), true, '旧 bug 复现：错字段计数为 0（证明修复的必要性）')

  // ===== publishRide：第 11 次发布被限流 =====
  const eleventh = await f.ride.publishRide('author', {
    departureMode: 'NOW',
    origin: { poiId: 'guat-south-gate', name: '桂航南门', address: '', latitude: 25.3321, longitude: 110.3653 },
    destination: { poiId: 'guilin-north-station', name: '桂林北站', address: '', latitude: 25.3390, longitude: 110.3135 },
    maxPeople: 3,
    campusId: 'guit-hangtian'
  })
  assert.notEqual(eleventh.code, 0, '11th publish must be rate limited')
  assert.ok(/频繁/.test(eleventh.msg), eleventh.msg)

  // ===== applyRideJoin：30 次放行，第 31 次拒绝 =====
  const rideIds = []
  for (let i = 0; i < 31; i += 1) {
    const owner = `owner${i}`
    await f.addUser(owner)
    const published = await f.ride.publishRide(owner, {
      departureMode: 'NOW',
      origin: { poiId: 'guat-south-gate', name: '桂航南门', address: '', latitude: 25.3321, longitude: 110.3653 },
      destination: { poiId: 'guilin-north-station', name: '桂林北站', address: '', latitude: 25.3390, longitude: 110.3135 },
      maxPeople: 4,
      campusId: 'guit-hangtian'
    })
    assert.equal(published.code, 0, `owner${i} publish`)
    rideIds.push(published.data.rideId)
  }
  for (let i = 0; i < 30; i += 1) {
    const applied = await f.ride.applyRideJoin('joiner', { rideId: rideIds[i] })
    assert.equal(applied.code, 0, `apply #${i + 1}: ${applied.msg}`)
  }
  const thirtyFirst = await f.ride.applyRideJoin('joiner', { rideId: rideIds[30] })
  assert.notEqual(thirtyFirst.code, 0, '31st apply must be rate limited')
  assert.ok(/频繁/.test(thirtyFirst.msg), thirtyFirst.msg)

  console.log('PASS Ride rate limit: real helper contract, 10/10 publish cap, 30/30 apply cap, wrong-field bug reproduced')
})().catch(error => { console.error(error); process.exitCode = 1 })
