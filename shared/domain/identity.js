// shared/domain/identity.js - 统一认证身份抽象 (AuthIdentity)
// 实现：User 1:N AuthIdentity，彻底解耦业务 User 主键与微信 OpenID 等第三方凭据

const { deriveDeterministicUserId } = require('./user')

const AUTH_PROVIDERS = {
  WECHAT_MINI: 'wechat_mini',
  WECHAT_OFFICIAL: 'wechat_official',
  PHONE: 'phone',
  EMAIL: 'email'
}

/**
 * 构造 AuthIdentity 实体
 * @param {string} userId - 内部 User.id (UUID)
 * @param {string} provider - 渠道类型 (wechat_mini / wechat_official / phone / email)
 * @param {string} providerKey - 渠道唯一标识 (openid / unionid / 手机号 / 邮箱)
 * @param {Object} [meta]
 * @returns {Object}
 */
function createAuthIdentity(userId, provider, providerKey, meta = {}) {
  if (!userId) throw new Error('AuthIdentity requires userId')
  if (!provider || !Object.values(AUTH_PROVIDERS).includes(provider)) {
    throw new Error(`Invalid auth provider: ${provider}`)
  }
  if (!providerKey) throw new Error('AuthIdentity requires providerKey')

  return {
    id: `ident_${provider}_${providerKey}`,
    userId,
    provider,
    providerKey: String(providerKey).trim(),
    credentialHash: meta.credentialHash || null,
    lastLoginAt: new Date().toISOString(),
    createdAt: meta.createdAt || new Date().toISOString()
  }
}

/**
 * 适配器：从微信小程序调用上下文平滑获取或映射为 InternalUserId
 * @param {string} openid - 微信用户 OPENID
 * @param {Array<Object>} [existingIdentities] - 可选的已存身份映射
 * @returns {{ userId: string, identity: Object }}
 */
function resolveWechatMiniIdentity(openid, existingIdentities = []) {
  if (!openid) throw new Error('OpenID cannot be empty')

  const found = existingIdentities.find(
    (i) => i.provider === AUTH_PROVIDERS.WECHAT_MINI && i.providerKey === openid
  )

  if (found) {
    return {
      userId: found.userId,
      identity: found,
      isNew: false
    }
  }

  // 若尚未写入独立 identities 库，通过确定性算法生成稳定一致的 InternalUserId
  const derivedUserId = deriveDeterministicUserId(openid)
  const identity = createAuthIdentity(derivedUserId, AUTH_PROVIDERS.WECHAT_MINI, openid)

  return {
    userId: derivedUserId,
    identity,
    isNew: true
  }
}

module.exports = {
  AUTH_PROVIDERS,
  createAuthIdentity,
  resolveWechatMiniIdentity
}
