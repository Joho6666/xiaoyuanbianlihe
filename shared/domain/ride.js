// shared/domain/ride.js - 拼车同行核心领域模型
// 6 态生命周期：OPEN -> FULL -> DEPARTED -> COMPLETED；OPEN/FULL 可 CANCELLED / EXPIRED
// 纯函数，无 DB 依赖；客户端镜像见 campus_treehole/utils/domain/，云端副本见 cloudfunctions/dbOperations/domain/

const RIDE_STATUS = {
  OPEN: 'OPEN',             // 招募中
  FULL: 'FULL',             // 满员锁定
  DEPARTED: 'DEPARTED',     // 已出发
  COMPLETED: 'COMPLETED',   // 已完成
  CANCELLED: 'CANCELLED',   // 发起人取消
  EXPIRED: 'EXPIRED'        // 已过期
}

const RIDE_REQUEST_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
}

const RIDE_DEPARTURE_MODES = {
  NOW: 'NOW',               // 现在出发（30~60 分钟内）
  SCHEDULED: 'SCHEDULED'    // 预约时间
}

const RIDE_FLEXIBLE_OPTIONS = [15, 30, 60]
const RIDE_NOW_TTL_MINUTES = 60          // NOW 行程发布后的有效时长
const RIDE_SCHEDULED_GRACE_MINUTES = 30  // 预约行程过期的宽限时长
const RIDE_MIN_PEOPLE = 2
const RIDE_MAX_PEOPLE = 6
const RIDE_NOTE_MAX_LENGTH = 100
const RIDE_SCHEDULED_MAX_AHEAD_DAYS = 14

const RIDE_TRANSITIONS = {
  [RIDE_STATUS.OPEN]: [RIDE_STATUS.FULL, RIDE_STATUS.DEPARTED, RIDE_STATUS.CANCELLED, RIDE_STATUS.EXPIRED],
  [RIDE_STATUS.FULL]: [RIDE_STATUS.OPEN, RIDE_STATUS.DEPARTED, RIDE_STATUS.CANCELLED, RIDE_STATUS.EXPIRED],
  [RIDE_STATUS.DEPARTED]: [RIDE_STATUS.COMPLETED],
  [RIDE_STATUS.COMPLETED]: [],
  [RIDE_STATUS.CANCELLED]: [],
  [RIDE_STATUS.EXPIRED]: []
}

/**
 * 状态机转换校验（服务端强制执行，客户端提交的 status 一律忽略）
 */
function canTransitionRideStatus(currentStatus, targetStatus) {
  return (RIDE_TRANSITIONS[currentStatus] || []).includes(targetStatus)
}

function normalizeFlexibleMinutes(value) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return 30
  return RIDE_FLEXIBLE_OPTIONS.includes(minutes) ? minutes : 30
}

function normalizePlace(place, field) {
  if (!place || typeof place !== 'object') throw new Error(`请选择${field}`)
  const name = String(place.name || '').trim()
  if (!name) throw new Error(`请选择${field}`)
  const latitude = Number(place.latitude)
  const longitude = Number(place.longitude)
  return {
    poiId: String(place.poiId || '').trim(),
    name,
    address: String(place.address || '').trim(),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  }
}

function minutesBetween(from, to) {
  return Math.abs(new Date(to).getTime() - new Date(from).getTime()) / 60000
}

/**
 * 计算过期时间：
 * NOW        -> 发布时刻 + 60 分钟
 * SCHEDULED  -> 出发时刻 + flexibleMinutes + 30 分钟宽限
 */
function computeRideExpiresAt({ departureMode, departureTime, flexibleMinutes, now = new Date().toISOString() }) {
  const base = departureMode === RIDE_DEPARTURE_MODES.NOW
    ? new Date(now).getTime()
    : new Date(departureTime).getTime()
  if (!Number.isFinite(base)) return null
  const extra = departureMode === RIDE_DEPARTURE_MODES.NOW
    ? RIDE_NOW_TTL_MINUTES
    : normalizeFlexibleMinutes(flexibleMinutes) + RIDE_SCHEDULED_GRACE_MINUTES
  return new Date(base + extra * 60000).toISOString()
}

/**
 * 构造拼车行程实体（currentPeople=1：发起人自带 1 席）
 */
function createRidePostEntity({
  id,
  authorId,
  schoolId,
  campusId,
  departureMode,
  origin,
  destination,
  departureTime,
  flexibleMinutes = 30,
  maxPeople,
  note = '',
  now = new Date().toISOString()
}) {
  if (!authorId) throw new Error('Ride requires authorId')
  if (!campusId) throw new Error('Ride requires campusId')
  const mode = Object.values(RIDE_DEPARTURE_MODES).includes(departureMode) ? departureMode : RIDE_DEPARTURE_MODES.NOW

  let startMs = null
  if (mode === RIDE_DEPARTURE_MODES.SCHEDULED) {
    startMs = new Date(departureTime).getTime()
    if (!Number.isFinite(startMs)) throw new Error('请选择出发时间')
    const aheadMs = startMs - new Date(now).getTime()
    if (aheadMs < -5 * 60000) throw new Error('预约时间不能早于当前时间')
    if (aheadMs > RIDE_SCHEDULED_MAX_AHEAD_DAYS * 24 * 60 * 60000) throw new Error(`预约时间最多提前 ${RIDE_SCHEDULED_MAX_AHEAD_DAYS} 天`)
  }

  const safeOrigin = normalizePlace(origin, '出发地')
  const safeDestination = normalizePlace(destination, '目的地')
  if (safeOrigin.poiId && safeOrigin.poiId === safeDestination.poiId) throw new Error('出发地和目的地不能相同')
  const noteText = String(note || '').trim()
  if (noteText.length > RIDE_NOTE_MAX_LENGTH) throw new Error(`备注最多 ${RIDE_NOTE_MAX_LENGTH} 字`)

  const seats = Math.min(RIDE_MAX_PEOPLE, Math.max(RIDE_MIN_PEOPLE, Number(maxPeople) || 3))
  const createdAt = new Date(now).toISOString()
  const effectiveDeparture = mode === RIDE_DEPARTURE_MODES.NOW ? createdAt : new Date(startMs).toISOString()
  return {
    id: id || `ride_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    schoolId: schoolId || '',
    campusId,
    departureMode: mode,
    origin: safeOrigin,
    destination: safeDestination,
    departureTime: effectiveDeparture,
    flexibleMinutes: normalizeFlexibleMinutes(flexibleMinutes),
    maxPeople: seats,
    currentPeople: 1,
    note: noteText,
    status: RIDE_STATUS.OPEN,
    createdAt,
    updatedAt: createdAt,
    expiresAt: computeRideExpiresAt({ departureMode: mode, departureTime: effectiveDeparture, flexibleMinutes, now: createdAt })
  }
}

/**
 * 惰性过期判定：OPEN/FULL 且 expiresAt 已到 → EXPIRED
 */
function resolveExpiredRideStatus(ride, now = Date.now()) {
  if (!ride) return RIDE_STATUS.EXPIRED
  const expirable = [RIDE_STATUS.OPEN, RIDE_STATUS.FULL].includes(ride.status)
  if (!expirable) return ride.status
  const expiresMs = ride.expiresAt ? new Date(ride.expiresAt).getTime() : NaN
  if (!Number.isFinite(expiresMs)) return ride.status
  return now >= expiresMs ? RIDE_STATUS.EXPIRED : ride.status
}

module.exports = {
  RIDE_STATUS,
  RIDE_REQUEST_STATUS,
  RIDE_DEPARTURE_MODES,
  RIDE_FLEXIBLE_OPTIONS,
  RIDE_NOW_TTL_MINUTES,
  RIDE_SCHEDULED_GRACE_MINUTES,
  RIDE_MIN_PEOPLE,
  RIDE_MAX_PEOPLE,
  RIDE_NOTE_MAX_LENGTH,
  RIDE_SCHEDULED_MAX_AHEAD_DAYS,
  RIDE_TRANSITIONS,
  canTransitionRideStatus,
  normalizeFlexibleMinutes,
  computeRideExpiresAt,
  createRidePostEntity,
  resolveExpiredRideStatus,
  minutesBetween
}
