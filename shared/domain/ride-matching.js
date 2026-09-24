// shared/domain/ride-matching.js - 拼车同行匹配评分（纯函数）
// 权重：目的地 50 / 时间 30 / 起点 20；硬门槛：目的地分≥35 且 时间差≤允许窗口。
// 客户端镜像见 campus_treehole/utils/domain/，云端副本见 cloudfunctions/dbOperations/domain/。
const { minutesBetween, resolveExpiredRideStatus, RIDE_STATUS, RIDE_DEPARTURE_MODES } = require('./ride')
const { haversineMeters } = require('./ride-places')

const MATCH_WEIGHTS = { destination: 50, time: 30, origin: 20 }
const DESTINATION_MIN_SCORE = 35
const NOW_TIME_WINDOW_MINUTES = 60
const MATCH_LIMIT = 10

function distanceMeters(from, to) {
  if (!from || !to) return Infinity
  return haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude)
}

function scoreDestination(a, b) {
  if (a.destination && b.destination && a.destination.poiId && a.destination.poiId === b.destination.poiId) {
    return MATCH_WEIGHTS.destination
  }
  const d = distanceMeters(a.destination, b.destination)
  if (d <= 500) return 45
  if (d <= 1500) return 35
  return 0
}

function timeWindowMinutes(a, b) {
  const bothScheduled = a.departureMode === RIDE_DEPARTURE_MODES.SCHEDULED
    && b.departureMode === RIDE_DEPARTURE_MODES.SCHEDULED
  if (!bothScheduled) return NOW_TIME_WINDOW_MINUTES
  return Math.max(Number(a.flexibleMinutes) || 0, Number(b.flexibleMinutes) || 0)
}

function scoreTime(a, b) {
  const diff = minutesBetween(a.departureTime, b.departureTime)
  if (diff <= 15) return 30
  if (diff <= 30) return 25
  if (diff <= 60) return 15
  return 0
}

function scoreOrigin(a, b) {
  const d = distanceMeters(a.origin, b.origin)
  if (d <= 500) return 20
  if (d <= 1000) return 15
  if (d <= 2000) return 8
  return 0
}

/**
 * 两两行程评分。返回各维度分与硬门槛判定。
 */
function scoreRidePair(a, b) {
  const destination = scoreDestination(a, b)
  const time = scoreTime(a, b)
  const origin = scoreOrigin(a, b)
  const window = timeWindowMinutes(a, b)
  const diffMinutes = minutesBetween(a.departureTime, b.departureTime)
  const withinTimeWindow = Number.isFinite(diffMinutes) && diffMinutes <= window
  return {
    destination,
    time,
    origin,
    total: destination + time + origin,
    timeWindow: window,
    diffMinutes: Math.round(diffMinutes),
    withinTimeWindow
  }
}

/**
 * 推荐门槛：目的地足够近 且 出发时间在允许窗口内
 */
function isRecommendable(pairScore) {
  return pairScore.destination >= DESTINATION_MIN_SCORE && pairScore.withinTimeWindow
}

/**
 * 匹配百分比（仅 UX 展示，上限 99）
 */
function matchPercent(total) {
  return Math.max(0, Math.min(99, Math.round(total)))
}

/**
 * 候选资格：同校、OPEN、非本人、不在 Block 集合、有余位、未过期
 */
function isRideEligible(candidate, viewer, { now = Date.now(), blockedOpenids } = {}) {
  if (!candidate || !viewer) return false
  if (candidate._id === viewer._id) return false
  if (candidate.status !== RIDE_STATUS.OPEN) return false
  if (resolveExpiredRideStatus(candidate, now) !== RIDE_STATUS.OPEN) return false
  if (candidate.schoolId && viewer.schoolId && candidate.schoolId !== viewer.schoolId) return false
  if ((Number(candidate.currentPeople) || 0) >= (Number(candidate.maxPeople) || 0)) return false
  const authorOpenid = candidate._openid
  if (authorOpenid && blockedOpenids && (blockedOpenids.has ? blockedOpenids.has(authorOpenid) : blockedOpenids.includes(authorOpenid))) return false
  return true
}

/**
 * 为目标行程从候选中排序推荐（Top N）。
 * 输入/输出均为纯数据：target 与 candidates 为行程实体（含 _openid 时用于本人/Block 判定）。
 */
function rankRideMatches(target, candidates, { now = Date.now(), blockedOpenids, limit = MATCH_LIMIT } = {}) {
  if (!target || !Array.isArray(candidates)) return []
  const scored = []
  for (const candidate of candidates) {
    if (!isRideEligible(candidate, target, { now, blockedOpenids })) continue
    const pair = scoreRidePair(target, candidate)
    if (!isRecommendable(pair)) continue
    scored.push({ ride: candidate, score: pair, percent: matchPercent(pair.total) })
  }
  // §16: 确定性排序规则：得分高优先 -> 时间差小优先 -> 出发时间早优先 -> ID 稳定兜底
  scored.sort((x, y) => {
    if (y.score.total !== x.score.total) return y.score.total - x.score.total
    const diffDiff = (x.score.diffMinutes || 0) - (y.score.diffMinutes || 0)
    if (diffDiff !== 0) return diffDiff
    const timeDiff = new Date(x.ride.departureTime).getTime() - new Date(y.ride.departureTime).getTime()
    if (timeDiff !== 0) return timeDiff
    return String(x.ride._id || x.ride.id || '').localeCompare(String(y.ride._id || y.ride.id || ''))
  })
  return scored.slice(0, limit)
}

module.exports = {
  MATCH_WEIGHTS,
  DESTINATION_MIN_SCORE,
  NOW_TIME_WINDOW_MINUTES,
  MATCH_LIMIT,
  distanceMeters,
  scoreDestination,
  scoreTime,
  scoreOrigin,
  timeWindowMinutes,
  scoreRidePair,
  isRecommendable,
  isRideEligible,
  matchPercent,
  rankRideMatches
}
