// utils/authAdapter.js - 客户端身份适配层
// 统一封装 InternalUserId，保证小程序端各业务模块不再直接拿 openid 当用户外键

const { deriveDeterministicUserId } = require('./domain/user')
const { AUTH_PROVIDERS, createAuthIdentity } = require('./domain/identity')

const USER_ID_STORAGE_KEY = 'campus_internal_user_id'
const AUTH_IDENTITY_STORAGE_KEY = 'campus_auth_identity'

/**
 * 在客户端规范化登录结果
 * @param {Object} loginResult - login 云函数返回值
 * @returns {{ internalUserId: string, openid: string, user: Object }}
 */
function normalizeLoginResponse(loginResult) {
  if (!loginResult || loginResult.code !== 0) {
    return { internalUserId: '', openid: '', user: null }
  }

  const openid = loginResult.openid || (loginResult.user && loginResult.user._openid) || ''
  let internalUserId = loginResult.internalUserId || (loginResult.user && loginResult.user.internalUserId) || ''

  if (!internalUserId && openid) {
    internalUserId = deriveDeterministicUserId(openid)
  }

  if (internalUserId) {
    wx.setStorageSync(USER_ID_STORAGE_KEY, internalUserId)
    const identity = createAuthIdentity(internalUserId, AUTH_PROVIDERS.WECHAT_MINI, openid)
    wx.setStorageSync(AUTH_IDENTITY_STORAGE_KEY, identity)
  }

  return {
    internalUserId,
    openid,
    user: {
      ...loginResult.user,
      internalUserId
    }
  }
}

/**
 * 获取当前登录用户的稳定 InternalUserId
 * @param {string} [fallbackOpenid] - 如果缓存丢失，允许由 openid 计算
 * @returns {string}
 */
function getCurrentInternalUserId(fallbackOpenid = '') {
  const cached = wx.getStorageSync(USER_ID_STORAGE_KEY)
  if (cached) return cached

  if (fallbackOpenid) {
    const derived = deriveDeterministicUserId(fallbackOpenid)
    wx.setStorageSync(USER_ID_STORAGE_KEY, derived)
    return derived
  }

  return ''
}

/**
 * 清除身份缓存
 */
function clearAuthIdentity() {
  wx.removeStorageSync(USER_ID_STORAGE_KEY)
  wx.removeStorageSync(AUTH_IDENTITY_STORAGE_KEY)
}

module.exports = {
  USER_ID_STORAGE_KEY,
  AUTH_IDENTITY_STORAGE_KEY,
  normalizeLoginResponse,
  getCurrentInternalUserId,
  clearAuthIdentity
}
