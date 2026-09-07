// shared/domain/mutual.js - 校园互助生活与失物招领领域模型
const MUTUAL_TYPES = {
  HELP: 'help',   // 校园互助 / 跑腿 / 答疑
  LOST: 'lost',   // 寻物启事
  FOUND: 'found'  // 失物招领
}

const MUTUAL_STATUS = {
  OPEN: 'open',               // 招募/寻物中
  IN_PROGRESS: 'in_progress', // 进行中 / 已有人接单
  RESOLVED: 'resolved',       // 已解决 / 已寻回 / 已归还
  CLOSED: 'closed'            // 发起人主动关闭
}

const HELP_CATEGORIES = [
  { id: 'errand', name: '跑腿带物', nameEn: 'Errands' },
  { id: 'study', name: '课业答疑', nameEn: 'Study Help' },
  { id: 'borrow', name: '物品借用', nameEn: 'Item Borrowing' },
  { id: 'skill', name: '技能互换', nameEn: 'Skill Swap' },
  { id: 'other', name: '日常求助', nameEn: 'General Help' }
]

const LOST_CATEGORIES = [
  { id: 'card', name: '证件卡片', nameEn: 'Cards & ID' },
  { id: 'digital', name: '数码配件', nameEn: 'Electronics' },
  { id: 'keys', name: '钥匙饰品', nameEn: 'Keys & Accessories' },
  { id: 'clothing', name: '衣物服饰', nameEn: 'Clothing' },
  { id: 'books', name: '图书文具', nameEn: 'Books & Stationery' },
  { id: 'other', name: '其他物品', nameEn: 'Others' }
]

function createMutualPostEntity({
  id,
  authorId,
  schoolId = 'guit',
  campusId = '',
  type = MUTUAL_TYPES.HELP,
  category = 'other',
  title,
  content,
  images = [],
  location = '',
  reward = '',
  contactPreference = 'in_app',
  status = MUTUAL_STATUS.OPEN,
  createdAt = new Date().toISOString()
}) {
  if (!authorId) throw new Error('MutualPost requires authorId')
  if (!title) throw new Error('MutualPost requires title')
  if (!content) throw new Error('MutualPost requires content')

  return {
    id: id || `mutual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    schoolId,
    campusId,
    type: Object.values(MUTUAL_TYPES).includes(type) ? type : MUTUAL_TYPES.HELP,
    category,
    title: String(title).trim(),
    content: String(content).trim(),
    images: Array.isArray(images) ? images : [],
    location: String(location || '').trim(),
    reward: String(reward || '').trim(),
    contactPreference,
    status: Object.values(MUTUAL_STATUS).includes(status) ? status : MUTUAL_STATUS.OPEN,
    createdAt,
    updatedAt: createdAt
  }
}

function canTransitionMutualStatus(currentStatus, targetStatus) {
  const transitions = {
    [MUTUAL_STATUS.OPEN]: [MUTUAL_STATUS.IN_PROGRESS, MUTUAL_STATUS.RESOLVED, MUTUAL_STATUS.CLOSED],
    [MUTUAL_STATUS.IN_PROGRESS]: [MUTUAL_STATUS.OPEN, MUTUAL_STATUS.RESOLVED, MUTUAL_STATUS.CLOSED],
    [MUTUAL_STATUS.RESOLVED]: [],
    [MUTUAL_STATUS.CLOSED]: []
  }
  return (transitions[currentStatus] || []).includes(targetStatus)
}

module.exports = {
  MUTUAL_TYPES,
  MUTUAL_STATUS,
  HELP_CATEGORIES,
  LOST_CATEGORIES,
  createMutualPostEntity,
  canTransitionMutualStatus
}
