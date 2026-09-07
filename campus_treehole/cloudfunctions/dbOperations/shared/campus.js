// shared/campus.js - 校区辅助函数与默认校区约定
const DEFAULT_CAMPUS_ID = 'guit-hangtian'

function resolveCampusIdForRead(data) {
  const raw = data && data.campusId
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return null
}

function campusWhereClause(_, campusId) {
  if (!campusId) return null
  if (campusId === DEFAULT_CAMPUS_ID) {
    return _.or([
      { campusId: DEFAULT_CAMPUS_ID },
      { campusId: _.exists(false) }
    ])
  }
  return { campusId }
}

module.exports = {
  DEFAULT_CAMPUS_ID,
  resolveCampusIdForRead,
  campusWhereClause
}
