// utils/languageProfile.js - 用户语言与身份档案辅助工具
// 为 UniBridge 国际学生和中国学生跨文化交流提供档案存取与验证

const { SUPPORTED_LANGUAGES, PROFICIENCY_LEVELS, evaluateLanguageExchangeMatch } = require('./domain/language')

const STUDENT_TYPES = {
  CHINESE_STUDENT: 'chinese_student',
  INTERNATIONAL_STUDENT: 'international_student',
  ALUMNI: 'alumni',
  STAFF: 'staff'
}

/**
 * 校验并规范化用户语言档案对象
 * @param {Object} rawProfile
 * @returns {Object}
 */
function normalizeLanguageProfile(rawProfile = {}) {
  const studentType = Object.values(STUDENT_TYPES).includes(rawProfile.studentType)
    ? rawProfile.studentType
    : STUDENT_TYPES.CHINESE_STUDENT

  const nativeLanguages = Array.isArray(rawProfile.nativeLanguages)
    ? rawProfile.nativeLanguages.filter((code) => SUPPORTED_LANGUAGES.some((l) => l.code === code))
    : [studentType === STUDENT_TYPES.INTERNATIONAL_STUDENT ? 'en' : 'zh']

  const targetLanguages = Array.isArray(rawProfile.targetLanguages)
    ? rawProfile.targetLanguages.filter((code) => SUPPORTED_LANGUAGES.some((l) => l.code === code))
    : [studentType === STUDENT_TYPES.INTERNATIONAL_STUDENT ? 'zh' : 'en']

  return {
    studentType,
    country: String(rawProfile.country || (studentType === STUDENT_TYPES.INTERNATIONAL_STUDENT ? 'US' : 'CN')).toUpperCase(),
    nativeLanguages,
    targetLanguages,
    exchangeMode: ['offline', 'online', 'hybrid'].includes(rawProfile.exchangeMode) ? rawProfile.exchangeMode : 'hybrid',
    availableTimes: Array.isArray(rawProfile.availableTimes) ? rawProfile.availableTimes : ['weekend'],
    communicationPref: ['wechat', 'in_app', 'offline'].includes(rawProfile.communicationPref) ? rawProfile.communicationPref : 'in_app'
  }
}

module.exports = {
  STUDENT_TYPES,
  SUPPORTED_LANGUAGES,
  PROFICIENCY_LEVELS,
  normalizeLanguageProfile,
  evaluateLanguageExchangeMatch
}
