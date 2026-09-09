// shared/domain/user.js - 统一用户核心模型
// 规范：内部统一使用 InternalUserId (UUID v4)，禁止使用 openid / uid 随意代表用户

const crypto = require('crypto')

/**
 * 验证是否为合法的 InternalUserId (UUID v4 / 稳定 UUID 格式)
 * @param {string} id
 * @returns {boolean}
 */
function isValidInternalUserId(id) {
  if (typeof id !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

/**
 * 根据外部微信 openid 派生出确定性的兼容 UUID（用于平滑迁移老数据）
 * @param {string} openid
 * @returns {string} UUID v4 格式的稳定字符串
 */
function deriveDeterministicUserId(openid) {
  if (!openid) throw new Error('Openid cannot be empty for deterministic user ID derivation')
  const hex = crypto.createHash('sha256').update(`xiaoyuanbianlihe:user:${openid}`).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16), // version 4
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20), // variant RFC4122
    hex.slice(20, 32)
  ].join('-')
}

/**
 * 创建标准 User 实体骨架
 * @param {Object} params
 * @returns {Object}
 */
function createUserEntity({
  id,
  numericId = '',
  nickname = '',
  avatarUrl = '',
  gender = 'undisclosed',
  schoolId = 'guat',
  campusId = 'guit-hangtian',
  studentType = 'chinese_student',
  role = 'user',
  status = 'active',
  createdAt = new Date().toISOString()
}) {
  const finalId = id || deriveDeterministicUserId(numericId || String(Date.now()))
  return {
    id: finalId,
    numericId: String(numericId || '').trim(),
    nickname: String(nickname || '校园同学').trim(),
    avatarUrl: String(avatarUrl || '/images/avatar_default.png').trim(),
    gender: ['male', 'female', 'other', 'undisclosed'].includes(gender) ? gender : 'undisclosed',
    schoolId: String(schoolId || 'guat').trim(),
    campusId: String(campusId || 'guit-hangtian').trim(),
    studentType: ['chinese_student', 'international_student', 'alumni', 'staff'].includes(studentType) ? studentType : 'chinese_student',
    role: ['user', 'moderator', 'admin'].includes(role) ? role : 'user',
    status: ['active', 'muted', 'banned', 'deleted'].includes(status) ? status : 'active',
    banExpiry: null,
    createdAt,
    updatedAt: createdAt
  }
}

module.exports = {
  isValidInternalUserId,
  deriveDeterministicUserId,
  createUserEntity
}
