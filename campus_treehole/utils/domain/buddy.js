// shared/domain/buddy.js - Tongpin 同频找搭子核心领域模型
// 定义 5 态生命周期：OPEN -> FULL -> FINISHED -> CANCELLED -> EXPIRED 与信用评价

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
  { id: 'sports', name: '运动健身', emoji: '🏸' },
  { id: 'study', name: '自习考研', emoji: '📚' },
  { id: 'meal', name: '食堂干饭', emoji: '🍜' },
  { id: 'travel', name: '周末出游', emoji: '🎒' },
  { id: 'game', name: '开黑游戏', emoji: '🎮' },
  { id: 'entertainment', name: '桌游观影', emoji: '🎬' }
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
  category = 'sports',
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
    schoolId: schoolId || 'guit',
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
    conversationId: null, // 成局后生成的群聊会话 ID
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

module.exports = {
  BUDDY_STATUS,
  APPLICATION_STATUS,
  BUDDY_CATEGORIES,
  createBuddyPostEntity,
  canTransitionBuddyStatus
}
