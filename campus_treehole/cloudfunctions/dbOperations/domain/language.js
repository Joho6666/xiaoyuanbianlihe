// shared/domain/language.js - UniBridge 语言交换与双语模型
// 定义语言分类、熟练度等级以及双向语伴互补匹配机制

const PROFICIENCY_LEVELS = {
  NATIVE: 'native',
  FLUENT: 'fluent',
  INTERMEDIATE: 'intermediate',
  BEGINNER: 'beginner'
}

const SUPPORTED_LANGUAGES = [
  { code: 'zh', nameZh: '中文 (普通话)', nameEn: 'Chinese (Mandarin)' },
  { code: 'en', nameZh: '英语', nameEn: 'English' },
  { code: 'fr', nameZh: '法语', nameEn: 'French' },
  { code: 'es', nameZh: '西班牙语', nameEn: 'Spanish' },
  { code: 'ja', nameZh: '日语', nameEn: 'Japanese' },
  { code: 'ko', nameZh: '韩语', nameEn: 'Korean' },
  { code: 'ru', nameZh: '俄语', nameEn: 'Russian' },
  { code: 'de', nameZh: '德语', nameEn: 'German' }
]

/**
 * 构造 UserLanguage 实体
 * @param {string} userId
 * @param {string} languageCode
 * @param {string} proficiency
 * @param {boolean} isLearning
 * @returns {Object}
 */
function createUserLanguage(userId, languageCode, proficiency, isLearning = false) {
  if (!userId) throw new Error('UserLanguage requires userId')
  if (!languageCode) throw new Error('UserLanguage requires languageCode')

  return {
    id: `${userId}:${languageCode}:${isLearning ? 'learn' : 'speak'}`,
    userId,
    languageCode,
    proficiency: Object.values(PROFICIENCY_LEVELS).includes(proficiency) ? proficiency : PROFICIENCY_LEVELS.INTERMEDIATE,
    isLearning: !!isLearning
  }
}

/**
 * 判断两个用户的语言配置是否构成互补语伴对 (Language Exchange Match)
 * 互补规则：用户 A 的母语/流利语言是用户 B 正在学习的目标，且用户 B 的母语/流利语言是用户 A 正在学习的目标
 * @param {Array<Object>} userALanguages
 * @param {Array<Object>} userBLanguages
 * @returns {{ isMatch: boolean, score: number, sharedPair: Array<string> }}
 */
function evaluateLanguageExchangeMatch(userALanguages = [], userBLanguages = []) {
  const aNative = userALanguages.filter((l) => !l.isLearning && (l.proficiency === 'native' || l.proficiency === 'fluent')).map((l) => l.languageCode)
  const aLearning = userALanguages.filter((l) => l.isLearning).map((l) => l.languageCode)

  const bNative = userBLanguages.filter((l) => !l.isLearning && (l.proficiency === 'native' || l.proficiency === 'fluent')).map((l) => l.languageCode)
  const bLearning = userBLanguages.filter((l) => l.isLearning).map((l) => l.languageCode)

  // A 教 B: A 熟练且 B 正在学
  const aTeachesB = aNative.filter((code) => bLearning.includes(code))
  // B 教 A: B 熟练且 A 正在学
  const bTeachesA = bNative.filter((code) => aLearning.includes(code))

  const isMutual = aTeachesB.length > 0 && bTeachesA.length > 0
  let score = 0
  if (isMutual) {
    score = 100 + (aTeachesB.length + bTeachesA.length) * 10
  } else if (aTeachesB.length > 0 || bTeachesA.length > 0) {
    score = 50 // 单向互助
  }

  return {
    isMatch: isMutual,
    score,
    aTeachesB,
    bTeachesA
  }
}

module.exports = {
  PROFICIENCY_LEVELS,
  SUPPORTED_LANGUAGES,
  createUserLanguage,
  evaluateLanguageExchangeMatch
}
