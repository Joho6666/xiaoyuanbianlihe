// test/unit/ride-domain.test.js - 拼车同行领域模型单元测试
const assert = require('assert')
const {
  RIDE_STATUS,
  RIDE_DEPARTURE_MODES,
  createRidePostEntity,
  canTransitionRideStatus,
  computeRideExpiresAt,
  resolveExpiredRideStatus,
  normalizeFlexibleMinutes
} = require('../../shared/domain/ride')
const {
  RIDE_PLACES,
  filterRidePlaces,
  getHotRidePlaces,
  getRidePlaceById,
  haversineMeters
} = require('../../shared/domain/ride-places')
const { formatRideTime, departureLabel, rideStatusLabel } = require('../../campus_treehole/utils/ride-format')

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

const NOW = new Date('2026-09-11T10:00:00.000Z').toISOString() // UTC 10:00 = 桂林 18:00
const SOUTH = RIDE_PLACES.find(p => p.poiId === 'guat-south-gate')
const NORTH_STATION = RIDE_PLACES.find(p => p.poiId === 'guilin-north-station')

console.log('Ride Domain')

test('NOW 行程：出发时间=发布时间，60 分钟后过期', () => {
  const ride = createRidePostEntity({
    authorId: 'author_a',
    campusId: 'guit-hangtian',
    departureMode: RIDE_DEPARTURE_MODES.NOW,
    origin: SOUTH,
    destination: NORTH_STATION,
    departureTime: 'ignored',
    maxPeople: 3,
    now: NOW
  })
  assert.equal(ride.departureTime, NOW)
  assert.equal(ride.status, RIDE_STATUS.OPEN)
  assert.equal(ride.currentPeople, 1)
  assert.equal(ride.expiresAt, new Date(new Date(NOW).getTime() + 60 * 60000).toISOString())
})

test('SCHEDULED 行程：expiresAt = 出发时间 + flexible + 30 分钟宽限', () => {
  const departure = '2026-09-12T10:00:00.000Z'
  const ride = createRidePostEntity({
    authorId: 'author_a',
    campusId: 'guit-hangtian',
    departureMode: RIDE_DEPARTURE_MODES.SCHEDULED,
    origin: SOUTH,
    destination: NORTH_STATION,
    departureTime: departure,
    flexibleMinutes: 30,
    maxPeople: 4,
    now: NOW
  })
  assert.equal(ride.departureTime, departure)
  const expected = new Date(new Date(departure).getTime() + 60 * 60000).toISOString()
  assert.equal(ride.expiresAt, expected)
  // schoolId 由服务端 publishRide 根据学校目录补齐，实体默认空串
  assert.equal(ride.schoolId, '')
})

test('人数限制在 2~6 且含发起人', () => {
  const base = { origin: SOUTH, destination: NORTH_STATION, departureMode: 'NOW', now: NOW, campusId: 'guit-hangtian' }
  assert.equal(createRidePostEntity({ ...base, maxPeople: 1, authorId: 'a' }).maxPeople, 2)
  assert.equal(createRidePostEntity({ ...base, maxPeople: 99, authorId: 'a' }).maxPeople, 6)
  assert.equal(createRidePostEntity({ ...base, authorId: 'a' }).currentPeople, 1)
})

test('非法输入被拒绝：缺地点 / 同一点位 / 备注超长 / 过去时间 / 超过14天', () => {
  const base = { departureMode: 'SCHEDULED', departureTime: '2026-09-12T10:00:00.000Z', maxPeople: 3, now: NOW, campusId: 'guit-hangtian' }
  assert.throws(() => createRidePostEntity({ ...base, authorId: 'a', origin: null, destination: NORTH_STATION }))
  assert.throws(() => createRidePostEntity({ ...base, authorId: 'a', origin: SOUTH, destination: { ...SOUTH } }))
  assert.throws(() => createRidePostEntity({ ...base, authorId: 'a', origin: SOUTH, destination: NORTH_STATION, note: 'x'.repeat(101) }))
  assert.throws(() => createRidePostEntity({ ...base, authorId: 'a', origin: SOUTH, destination: NORTH_STATION, departureTime: '2026-09-10T10:00:00.000Z' }))
  assert.throws(() => createRidePostEntity({ ...base, authorId: 'a', origin: SOUTH, destination: NORTH_STATION, departureTime: '2026-10-01T10:00:00.000Z' }))
})

test('状态机：合法与非法流转', () => {
  assert.ok(canTransitionRideStatus('OPEN', 'FULL'))
  assert.ok(canTransitionRideStatus('OPEN', 'DEPARTED'))
  assert.ok(canTransitionRideStatus('OPEN', 'CANCELLED'))
  assert.ok(canTransitionRideStatus('OPEN', 'EXPIRED'))
  assert.ok(canTransitionRideStatus('FULL', 'OPEN'))
  assert.ok(canTransitionRideStatus('FULL', 'DEPARTED'))
  assert.ok(canTransitionRideStatus('FULL', 'COMPLETED'))
  assert.ok(canTransitionRideStatus('FULL', 'CANCELLED'))
  assert.ok(canTransitionRideStatus('DEPARTED', 'COMPLETED'))
  assert.ok(!canTransitionRideStatus('OPEN', 'COMPLETED'))
  assert.ok(!canTransitionRideStatus('COMPLETED', 'DEPARTED'))
  assert.ok(!canTransitionRideStatus('CANCELLED', 'OPEN'))
  assert.ok(!canTransitionRideStatus('EXPIRED', 'OPEN'))
})

test('惰性过期：OPEN 到期 → EXPIRED；DEPARTED 不受影响', () => {
  const expiredAt = '2026-09-11T09:00:00.000Z'
  assert.equal(resolveExpiredRideStatus({ status: 'OPEN', expiresAt: expiredAt }, Date.parse(NOW)), 'EXPIRED')
  assert.equal(resolveExpiredRideStatus({ status: 'FULL', expiresAt: expiredAt }, Date.parse(NOW)), 'EXPIRED')
  assert.equal(resolveExpiredRideStatus({ status: 'OPEN', expiresAt: '2026-09-11T12:00:00.000Z' }, Date.parse(NOW)), 'OPEN')
  assert.equal(resolveExpiredRideStatus({ status: 'DEPARTED', expiresAt: expiredAt }, Date.parse(NOW)), 'DEPARTED')
  assert.equal(resolveExpiredRideStatus({ status: 'OPEN', expiresAt: null }, Date.parse(NOW)), 'OPEN')
})

test('flexibleMinutes 只接受 15/30/60，默认 30', () => {
  assert.equal(normalizeFlexibleMinutes(15), 15)
  assert.equal(normalizeFlexibleMinutes(45), 30)
  assert.equal(normalizeFlexibleMinutes('x'), 30)
})

test('地点目录：搜索 / 分类 / 热门 / 距离', () => {
  assert.equal(getRidePlaceById('guilin-north-station').name, '桂林北站')
  assert.ok(filterRidePlaces({ keyword: '桂林北' }).some(p => p.poiId === 'guilin-north-station'))
  assert.ok(filterRidePlaces({ keyword: '桂航' }).every(p => p.category === 'school'))
  assert.ok(filterRidePlaces({ keyword: '', category: 'airport' }).every(p => p.poiId === 'liangjiang-airport'))
  assert.ok(getHotRidePlaces(6).length === 6)
  assert.ok(getHotRidePlaces(6).every(p => p.hot))
  // 桂林北站↔两江机场约 28~30km，用于距离档位校验
  const north = getRidePlaceById('guilin-north-station')
  const airport = getRidePlaceById('liangjiang-airport')
  const d = haversineMeters(north.latitude, north.longitude, airport.latitude, airport.longitude)
  assert.ok(d > 20000 && d < 40000, `distance ${d}`)
})

test('时间展示与标签', () => {
  const now = new Date('2026-09-11T10:00:00.000Z') // 桂林 9月11日 18:00
  assert.equal(formatRideTime('2026-09-11T10:00:00.000Z', now), '今天 18:00')
  assert.equal(formatRideTime('2026-09-12T10:30:00.000Z', now), '明天 18:30')
  assert.equal(formatRideTime('2026-09-13T02:00:00.000Z', now), '9月13日 10:00')
  assert.equal(departureLabel({ departureMode: 'NOW' }), '现在出发')
  assert.equal(departureLabel({ departureMode: 'SCHEDULED' }), '预约')
  assert.equal(rideStatusLabel('OPEN'), '招募中')
  assert.equal(rideStatusLabel('WHATEVER'), 'WHATEVER')
})

process.exitCode = failed > 0 ? 1 : 0
if (failed > 0) {
  console.error(`Ride domain tests: ${failed} failed`)
} else {
  console.log(`PASS Ride domain: ${passed} assertions passed`)
}
