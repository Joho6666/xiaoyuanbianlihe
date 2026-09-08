const { resolveCampusId, LEGACY_CAMPUS_ALIASES } = require('./schools')
// shared/campus.js - 校区辅助函数与默认校区约定
const DEFAULT_CAMPUS_ID = 'guit-hangtian'

/**
 * 统一校区读取解析器
 * 支持传入直接的 campusId 字符串，或者包含 campusId 字段的对象
 * @param {string|Object|null|undefined} input
 * @returns {string|null}
 */
function resolveCampusIdForRead(input) {
  if (typeof input === 'string') {
    return resolveCampusId(input) || null
  }
  if (input && typeof input.campusId === 'string') {
    return resolveCampusId(input.campusId) || null
  }
  return null
}

/**
 * 统一生成校区查询条件
 * 支持 campusWhereClause(campusId) 或 campusWhereClause(_, campusId)
 * @param {Object|string} arg1 - Command 操作符对象 _ 或 campusId
 * @param {string} [arg2] - campusId
 * @returns {Object|null}
 */
function campusWhereClause(arg1, arg2) {
  let cmd = null
  let campusId = null
  if (arg2 !== undefined) {
    cmd = arg1
    campusId = arg2
  } else {
    campusId = arg1
  }

  if (!campusId || typeof campusId !== 'string') return null
  const cid = resolveCampusId(campusId)
  if (!cid) return null

  if (cid === DEFAULT_CAMPUS_ID) {
    if (cmd && typeof cmd.or === 'function') {
      const existsClause = typeof cmd.exists === 'function' ? cmd.exists(false) : { $exists: false }
      return cmd.or([
        { campusId: DEFAULT_CAMPUS_ID },
        { campusId: existsClause }
      ])
    }
    return { campusId: DEFAULT_CAMPUS_ID }
  }

  const aliases = Object.keys(LEGACY_CAMPUS_ALIASES).filter(key => LEGACY_CAMPUS_ALIASES[key] === cid)
  if (aliases.length && cmd && typeof cmd.in === 'function') return { campusId: cmd.in([cid, ...aliases]) }
  return { campusId: cid }
}

module.exports = {
  DEFAULT_CAMPUS_ID,
  resolveCampusIdForRead,
  campusWhereClause
}
