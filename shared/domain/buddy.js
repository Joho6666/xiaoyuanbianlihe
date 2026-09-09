// shared/domain/buddy.js - Tongpin 同频找搭子核心领域模型
// 定义 5 态生命周期：OPEN -> FULL -> FINISHED -> CANCELLED -> EXPIRED 与轻量推荐评分

const BUDDY_STATUS = {
  OPEN: 'OPEN',           // 招募中
  FULL: 'FULL',           // 满员锁定
  FINISHED: 'FINISHED',   // 已完成
  CANCELLED: 'CANCELLED', // 发起人取消
  EXPIRED: 'EXPIRED'      // 已逾期截止
}

const APPLICATION_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
}

const BUDDY_CATEGORIES = [
  { id: 'meal', name: '吃饭', emoji: '🍜' },
  { id: 'sport', name: '运动', emoji: '🏸' },
  { id: 'study', name: '学习', emoji: '📚' },
  { id: 'game', name: '游戏', emoji: '🎮' },
  { id: 'travel', name: '旅行', emoji: '✈️' },
  { id: 'citywalk', name: 'City Walk', emoji: '🚶' },
  { id: 'movie', name: '电影', emoji: '🎬' },
  { id: 'photo', name: '拍照', emoji: '📷' },
  { id: 'custom', name: '自定义', emoji: '✨' }
]

/**
 * 构造搭子招募贴实体
 * @param {Object} params
 * @returns {Object}
 */
function createBuddyPostEntity({
  id,
  authorId,
  schoolId,
  campusId = '',
  category = 'sport',
  title,
  description,
  startAt,
  endAt = null,
  location,
  minPeople = 2,
  maxPeople = 4,
  genderRequirement = 'any',
  schoolOnly = false,
  status = BUDDY_STATUS.OPEN,
  createdAt = new Date().toISOString()
}) {
  if (!authorId) throw new Error('BuddyPost requires authorId')
  if (!title) throw new Error('BuddyPost requires title')
  if (!startAt) throw new Error('BuddyPost requires startAt')

  return {
    id: id || `buddy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    schoolId: schoolId || 'guat',
    campusId,
    category,
    title: String(title).trim(),
    description: String(description || '').trim(),
    startAt: new Date(startAt).toISOString(),
    endAt: endAt ? new Date(endAt).toISOString() : null,
    location: String(location || '').trim(),
    minPeople: Math.max(2, Number(minPeople) || 2),
    maxPeople: Math.max(minPeople, Number(maxPeople) || 4),
    acceptedCount: 1, // 发起人默认算 1 人
    genderRequirement: ['any', 'male_only', 'female_only'].includes(genderRequirement) ? genderRequirement : 'any',
    schoolOnly: !!schoolOnly,
    status: Object.values(BUDDY_STATUS).includes(status) ? status : BUDDY_STATUS.OPEN,
    conversationId: null,
    createdAt,
    updatedAt: createdAt
  }
}

/**
 * 状态机转换校验
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @returns {boolean}
 */
function canTransitionBuddyStatus(currentStatus, targetStatus) {
  const transitions = {
    [BUDDY_STATUS.OPEN]: [BUDDY_STATUS.FULL, BUDDY_STATUS.FINISHED, BUDDY_STATUS.CANCELLED, BUDDY_STATUS.EXPIRED],
    [BUDDY_STATUS.FULL]: [BUDDY_STATUS.OPEN, BUDDY_STATUS.FINISHED, BUDDY_STATUS.CANCELLED],
    [BUDDY_STATUS.FINISHED]: [],
    [BUDDY_STATUS.CANCELLED]: [],
    [BUDDY_STATUS.EXPIRED]: []
  }
  return (transitions[currentStatus] || []).includes(targetStatus)
}

/**
 * 计算搭子推荐评分 (可解释性评分)
 * score = timeScore * 0.35 + campusScore * 0.25 + interestScore * 0.25 + activityScore * 0.15
 * 若无兴趣资料自动降级为: timeScore * 0.50 + campusScore * 0.30 + activityScore * 0.20
 * @param {Object} post - 组局贴
 * @param {Object} [userContext] - 当前用户上下文 { campusId, interests, lastLoginTime }
 * @returns {number} 0 ~ 100 综合推荐分数
 */
function computeBuddyRecommendScore(post, userContext = {}) {
  // 1. 时间临近分数 (距离当前时间越合理/越紧迫分数越高)
  const now = Date.now()
  const startAtMs = post.startAt ? new Date(post.startAt).getTime() : now
  const diffHours = (startAtMs - now) / (1000 * 3600)

  let timeScore = 40
  if (diffHours < 0) {
    timeScore = 10 // 已逾期或正在进行
  } else if (diffHours <= 6) {
    timeScore = 100 // 6小时内：马上开始
  } else if (diffHours <= 24) {
    timeScore = 90 // 今天之内
  } else if (diffHours <= 48) {
    timeScore = 75 // 明天
  } else if (diffHours <= 120) {
    timeScore = 55 // 本周末或近日
  }

  // 2. 同校区就近分数
  let campusScore = 50
  if (userContext.campusId && post.campusId) {
    campusScore = userContext.campusId === post.campusId ? 100 : 20
  }

  // 3. 兴趣重合分数
  let interestScore = null
  if (Array.isArray(userContext.interests) && userContext.interests.length > 0) {
    const postText = `${post.category || ''} ${post.title || ''} ${post.description || ''}`
    const hasMatch = userContext.interests.some((tag) => postText.includes(tag))
    interestScore = hasMatch ? 100 : 30
  }

  // 4. 最近活跃/发布新鲜度
  const createAtMs = post.createTime ? new Date(post.createTime).getTime() : now
  const ageHours = (now - createAtMs) / (1000 * 3600)
  let activityScore = 40
  if (ageHours <= 2) activityScore = 100
  else if (ageHours <= 12) activityScore = 80
  else if (ageHours <= 24) activityScore = 65

  // 满员帖适当减权，招募中加权
  const statusMultiplier = post.status === BUDDY_STATUS.OPEN ? 1.0 : 0.6

  if (interestScore !== null) {
    const base = timeScore * 0.35 + campusScore * 0.25 + interestScore * 0.25 + activityScore * 0.15
    return Math.round(base * statusMultiplier)
  } else {
    const base = timeScore * 0.50 + campusScore * 0.30 + activityScore * 0.20
    return Math.round(base * statusMultiplier)
  }
}

module.exports = {
  BUDDY_STATUS,
  APPLICATION_STATUS,
  BUDDY_CATEGORIES,
  createBuddyPostEntity,
  canTransitionBuddyStatus,
  computeBuddyRecommendScore
}
