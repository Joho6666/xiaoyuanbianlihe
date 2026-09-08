const schools = require('../config/schools')
function decode(value) {
  try { return decodeURIComponent(String(value || '').trim()) } catch (_) { return '' }
}
function parseLanding(options = {}) {
  const q = options.query || {}
  const scene = decode(q.scene || (typeof options.scene === 'string' ? options.scene : ''))
  const short = { c_guat: { schoolId: 'guat', campusId: 'guit-hangtian' }, c_guet_hj: { schoolId: 'guet', campusId: 'guet-huajiang' } }
  const old = scene.match(/^(?:school_|s_)(.+?)(?:_campus_|_c_)(.+)$/)
  const fromScene = short[scene] || (old ? { schoolId: old[1], campusId: old[2] } : {})
  const schoolId = decode(q.schoolId || fromScene.schoolId)
  const campusId = decode(q.campusId || fromScene.campusId)
  const school = schoolId ? schools.getSchoolById(schoolId) : null
  const campus = campusId ? schools.getCampusByCampusId(campusId) : null
  if ((schoolId && !school) || (campusId && !campus)) return null
  if (school && campus && campus.schoolId !== school.id) return null
  const selected = campus || (school && (school.campuses.find(c => c.isDefault) || school.campuses[0]))
  if (!selected) return null
  return { schoolId: campus ? campus.schoolId : school.id, campusId: selected.id, source: decode(q.source), campaign: decode(q.campaign) }
}
module.exports = { parseLanding }
