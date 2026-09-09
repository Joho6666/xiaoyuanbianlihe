const FATE_CARD_LIMITS = Object.freeze({ free: 1, premium: 3 })
function getUserEntitlements(user, env = process.env) {
  // Only explicitly configured development accounts receive preview entitlements.
  const ids = String(env.HEART_PREMIUM_TEST_USER_IDS || '').split(',').filter(Boolean)
  const premium = env.APP_ENV === 'development' && ids.includes(user.userId)
  return { membershipTier: premium ? 'premium' : 'free', heartFateDailyLimit: premium ? FATE_CARD_LIMITS.premium : FATE_CARD_LIMITS.free }
}
module.exports = { FATE_CARD_LIMITS, getUserEntitlements }
