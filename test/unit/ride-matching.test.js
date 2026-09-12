// test/unit/ride-matching.test.js - 拼车匹配评分单元测试（任务书 §46 场景）
const assert = require('assert')
const {
  scoreRidePair,
  isRecommendable,
  isRideEligible,
  rankRideMatches,
  matchPercent,
  timeWindowMinutes
} = require('../../shared/domain/ride-matching')
const { RIDE_PLACES } = require('../../shared/domain/ride-places')

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

const place = poiId => RIDE_PLACES.find(p => p.poiId === poiId)
const NOW = Date.parse('2026-09-11T09:50:00.000Z') // 桂林 17:50

function ride(overrides = {}) {
  return {
    _id: overrides._id || `ride_${Math.random().toString(36).slice(2, 8)}`,
    _openid: overrides._openid || 'author_x',
    schoolId: overrides.schoolId || 'guat',
    campusId: 'guit-hangtian',
    departureMode: overrides.departureMode || 'NOW',
    origin: overrides.origin || place('guat-south-gate'),
    destination: overrides.destination || place('guilin-north-station'),
    departureTime: overrides.departureTime || '2026-09-11T10:00:00.000Z', // 桂林 18:00
    flexibleMinutes: overrides.flexibleMinutes || 30,
    maxPeople: 4,
    currentPeople: overrides.currentPeople || 1,
    status: overrides.status || 'OPEN',
    expiresAt: overrides.expiresAt || '2026-09-11T11:00:00.000Z'
  }
}

console.log('Ride Matching')

// A：桂航南门 → 桂林北站 18:00（目标）
const target = ride({ _id: 'ride_a', _openid: 'author_a' })
// B：同路线 18:10 → HIGH MATCH
const rideB = ride({ _id: 'ride_b', _openid: 'author_b', departureTime: '2026-09-11T10:10:00.000Z' })
// C：桂航北门 → 桂林北站 18:30 → MATCH
const rideC = ride({ _id: 'ride_c', _openid: 'author_c', origin: place('guat-north-gate'), departureTime: '2026-09-11T10:30:00.000Z' })
// D：桂航 → 桂林西站 18:00 → NO MATCH
const rideD = ride({ _id: 'ride_d', _openid: 'author_d', destination: place('guilin-west-station') })
// E：同路线 21:00（预约 ±30）→ NO MATCH
const rideE = ride({ _id: 'ride_e', _openid: 'author_e', departureMode: 'SCHEDULED', departureTime: '2026-09-11T13:00:00.000Z', flexibleMinutes: 30 })
// BLOCKED：同路线但被拉黑
const rideBlocked = ride({ _id: 'ride_blocked', _openid: 'author_blocked' })
// EXPIRED：同路线但已过期
const rideExpired = ride({ _id: 'ride_expired', _openid: 'author_expired', expiresAt: '2026-09-11T09:00:00.000Z' })

test('B 同路线 18:10 → 高分（目的地 50 + 时间 30 + 起点 20）', () => {
  const pair = scoreRidePair(target, rideB)
  assert.equal(pair.destination, 50)
  assert.equal(pair.time, 30)
  assert.equal(pair.origin, 20)
  assert.equal(pair.total, 100)
  assert.ok(pair.withinTimeWindow)
  assert.ok(isRecommendable(pair))
  assert.equal(matchPercent(pair.total), 99)
})

test('C 北门 → 北站 18:30 → 推荐且分数低于 B', () => {
  const pair = scoreRidePair(target, rideC)
  assert.ok(pair.destination >= 35, 'same destination POI')
  assert.ok(pair.time >= 15)
  assert.ok(isRecommendable(pair))
  const scoreB = scoreRidePair(target, rideB).total
  assert.ok(pair.total < scoreB)
})

test('D 目的地桂林西站 → 不推荐（目的地分 0）', () => {
  const pair = scoreRidePair(target, rideD)
  assert.equal(pair.destination, 0)
  assert.ok(!isRecommendable(pair))
})

test('E 同路线 21:00 → 不推荐（超出时间窗口）', () => {
  const pair = scoreRidePair(target, rideE)
  assert.equal(pair.destination, 50)
  assert.ok(!pair.withinTimeWindow)
  assert.ok(!isRecommendable(pair))
})

test('双方 SCHEDULED：时间窗口 = max(双方 flexibleMinutes)', () => {
  const t1 = ride({ departureMode: 'SCHEDULED', flexibleMinutes: 60, departureTime: '2026-09-11T10:00:00.000Z' })
  const t2 = ride({ departureMode: 'SCHEDULED', flexibleMinutes: 15, departureTime: '2026-09-11T10:55:00.000Z' })
  assert.equal(timeWindowMinutes(t1, t2), 60)
  const pair = scoreRidePair(t1, t2)
  assert.ok(pair.withinTimeWindow, '55min ≤ 60min')
  const t3 = ride({ departureMode: 'SCHEDULED', flexibleMinutes: 15, departureTime: '2026-09-11T10:20:00.000Z' })
  assert.equal(timeWindowMinutes(t1, t3), 60)
})

test('任一为 NOW：时间窗口固定 60 分钟', () => {
  const scheduled = ride({ departureMode: 'SCHEDULED', flexibleMinutes: 60 })
  assert.equal(timeWindowMinutes(target, scheduled), 60)
})

test('BLOCKED → 不在推荐列表', () => {
  const ranked = rankRideMatches(target, [rideB, rideBlocked], {
    now: NOW,
    blockedOpenids: new Set(['author_blocked'])
  })
  assert.ok(ranked.some(item => item.ride._id === 'ride_b'))
  assert.ok(!ranked.some(item => item.ride._id === 'ride_blocked'))
})

test('EXPIRED → 不在推荐列表', () => {
  const ranked = rankRideMatches(target, [rideExpired], { now: NOW })
  assert.equal(ranked.length, 0)
})

test('资格过滤：自己 / 满员 / 不同校 / 非 OPEN', () => {
  assert.ok(!isRideEligible(ride({ _id: 'ride_a', _openid: 'author_a' }), target, { now: NOW }), 'self')
  assert.ok(!isRideEligible(ride({ currentPeople: 4 }), target, { now: NOW }), 'full')
  assert.ok(!isRideEligible(ride({ schoolId: 'gxnu' }), target, { now: NOW }), 'different school')
  assert.ok(!isRideEligible(ride({ status: 'FULL' }), target, { now: NOW }), 'not open')
  assert.ok(isRideEligible(rideB, target, { now: NOW }))
})

test('排序与 Top N 截断', () => {
  const far = ride({ _id: 'ride_far', _openid: 'author_far', origin: place('yangshuo'), departureTime: '2026-09-11T10:20:00.000Z' })
  const ranked = rankRideMatches(target, [far, rideC, rideB], { now: NOW })
  // far 目的地相同（≥35）仍推荐，但起点过远排序垫底
  assert.deepEqual(ranked.map(item => item.ride._id), ['ride_b', 'ride_c', 'ride_far'])
  const rankedAll = rankRideMatches(target, [rideC, rideB, far], { now: NOW, limit: 2 })
  assert.equal(rankedAll.length, 2)
})

test('Top 10 上限', () => {
  const many = []
  for (let i = 0; i < 15; i += 1) {
    many.push(ride({ _id: `ride_n${i}`, _openid: `author_n${i}`, departureTime: `2026-09-11T10:${String(10 + i).padStart(2, '0')}:00.000Z` }))
  }
  const ranked = rankRideMatches(target, many, { now: NOW })
  assert.equal(ranked.length, 10)
})

process.exitCode = failed > 0 ? 1 : 0
if (failed > 0) {
  console.error(`Ride matching tests: ${failed} failed`)
} else {
  console.log(`PASS Ride matching: ${passed} assertions passed`)
}
