// dbOperations/shared/rate-limit.js - 通用频率限制
// 真实 timestamp 契约：调用方必须显式声明集合的时间字段（默认 createTime）。
// 纯工厂，可注入内存 DB 做真实行为契约测试。
function createRateLimiter({ db, _, now }) {
  const nowMs = typeof now === 'function' ? now : () => Date.now()
  function isNotExist(err) {
    const raw = (err && (err.errMsg || err.message || '')) + ''
    return /not exist|DATABASE_COLLECTION_NOT_EXIST|not exists/i.test(raw)
  }

  /**
   * @param {string} openid 操作者
   * @param {string} collection 计数集合
   * @param {number} minutes 窗口（分钟）
   * @param {number} maxCount 窗口内允许的最大写入数
   * @param {string} [field] 时间字段名（默认 createTime；字段必须与集合实际存储一致且为 Date 类型）
   */
  async function check(openid, collection, minutes, maxCount, field = 'createTime') {
    const timeAgo = new Date(nowMs() - minutes * 60 * 1000)
    try {
      const res = await db.collection(collection).where({
        _openid: openid,
        [field]: _.gte(timeAgo)
      }).count()
      return res.total < maxCount
    } catch (err) {
      if (isNotExist(err)) return true
      console.error('[rate-limit] 频率检查异常，按已达上限处理:', err)
      return false
    }
  }

  return { check }
}

module.exports = { createRateLimiter }
