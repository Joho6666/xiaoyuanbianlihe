// campus_treehole/utils/ride-format.js - 拼车同行展示格式化（纯函数）
const { RIDE_DEPARTURE_MODES } = require('./domain/ride')

function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * 出发时间展示：今天/明天/具体日期 + HH:mm（按桂林 UTC+8 语义格式化）
 */
function formatRideTime(time, now = new Date()) {
  const ms = new Date(time).getTime()
  if (!Number.isNaN(ms)) {
    const nowDay = Math.floor((now.getTime() + 8 * 3600000) / 86400000)
    const day = Math.floor((ms + 8 * 3600000) / 86400000)
    const shifted = new Date(ms + 8 * 3600000)
    const hm = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
    if (day === nowDay) return `今天 ${hm}`
    if (day === nowDay + 1) return `明天 ${hm}`
    if (day === nowDay - 1) return `昨天 ${hm}`
    const month = shifted.getUTCMonth() + 1
    const dayOfMonth = shifted.getUTCDate()
    if (now.getUTCFullYear() === shifted.getUTCFullYear()) return `${month}月${dayOfMonth}日 ${hm}`
    return `${shifted.getUTCFullYear()}年${month}月${dayOfMonth}日 ${hm}`
  }
  return ''
}

/**
 * 发布相对时间：x分钟前 / x小时前 / 具体时间
 */
function formatRelativeTime(time, now = new Date()) {
  const ms = new Date(time).getTime()
  if (!Number.isFinite(ms)) return ''
  const diff = now.getTime() - ms
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return formatRideTime(time, now)
}

/**
 * 时间浮动标签：±30分钟
 */
function formatFlexible(minutes) {
  return `±${Number(minutes) || 0}分钟`
}

/**
 * 出发方式标签：现在出发 / 预约
 */
function departureLabel(ride) {
  return ride && ride.departureMode === RIDE_DEPARTURE_MODES.NOW ? '现在出发' : '预约'
}

/**
 * 拼车状态中文标签
 */
const RIDE_STATUS_LABELS = {
  OPEN: '招募中',
  FULL: '已满员',
  DEPARTED: '已出发',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  EXPIRED: '已过期'
}

function rideStatusLabel(status) {
  return RIDE_STATUS_LABELS[status] || status
}

module.exports = { formatRideTime, formatRelativeTime, formatFlexible, departureLabel, rideStatusLabel, RIDE_STATUS_LABELS }
