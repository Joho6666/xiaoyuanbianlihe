// utils/i18n.js - 小程序双语国际化核心工具库
// 支撑 UniBridge 跨文化频道与全站多语言无缝切换

const zhCN = require('../locales/zh-CN')
const enUS = require('../locales/en-US')

const STORAGE_KEY = 'campus_app_locale'
const DEFAULT_LOCALE = 'zh-CN'

const dictionaries = {
  'zh-CN': zhCN,
  'en-US': enUS
}

/**
 * 获取当前设定的语言代码
 * @returns {'zh-CN' | 'en-US'}
 */
function getLocale() {
  try {
    const cached = wx.getStorageSync(STORAGE_KEY)
    if (cached && dictionaries[cached]) return cached
  } catch (e) {}
  return DEFAULT_LOCALE
}

/**
 * 设置当前语言代码并持久化存储
 * @param {'zh-CN' | 'en-US'} locale
 */
function setLocale(locale) {
  if (!dictionaries[locale]) {
    console.warn(`[i18n] 不支持的语言类型: ${locale}，回退至默认`)
    locale = DEFAULT_LOCALE
  }
  try {
    wx.setStorageSync(STORAGE_KEY, locale)
  } catch (e) {}
  return locale
}

/**
 * 翻译指定 key 路径 (例如 'discover.buddyTitle')
 * @param {string} keyPath
 * @param {Object} [params] - 插值变量 { name: 'John' }
 * @param {'zh-CN' | 'en-US'} [localeOverride]
 * @returns {string}
 */
function t(keyPath, params = {}, localeOverride = null) {
  const currentLocale = localeOverride || getLocale()
  const dict = dictionaries[currentLocale] || dictionaries[DEFAULT_LOCALE]

  const parts = String(keyPath).split('.')
  let val = dict
  for (const p of parts) {
    if (val && typeof val === 'object' && p in val) {
      val = val[p]
    } else {
      // 找不到时尝试回退到中文默认包
      let fallbackVal = dictionaries[DEFAULT_LOCALE]
      for (const fp of parts) {
        if (fallbackVal && typeof fallbackVal === 'object' && fp in fallbackVal) {
          fallbackVal = fallbackVal[fp]
        } else {
          return keyPath
        }
      }
      val = fallbackVal
      break
    }
  }

  if (typeof val !== 'string') return keyPath

  // 变量插值
  return val.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? String(params[paramKey]) : match
  })
}

/**
 * 获取完整的当前字典对象（便于页面一次性 setData({ $t: getDictionary() })）
 * @param {'zh-CN' | 'en-US'} [localeOverride]
 * @returns {Object}
 */
function getDictionary(localeOverride = null) {
  const loc = localeOverride || getLocale()
  return dictionaries[loc] || dictionaries[DEFAULT_LOCALE]
}

module.exports = {
  getLocale,
  setLocale,
  t,
  getDictionary,
  DEFAULT_LOCALE
}
