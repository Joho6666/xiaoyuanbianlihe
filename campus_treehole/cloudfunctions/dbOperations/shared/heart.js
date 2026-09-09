const { makeDeterministicId } = require('./id')
const dayKey = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10)
const pairId = (a,b) => makeDeterministicId('heartmatch', ...[a,b].sort())
function eligible(a, b, fate = false) {
  return !!(a && b && a.enabled && b.enabled && a.adultDeclared && b.adultDeclared && a.userId !== b.userId && a.schoolId && a.schoolId === b.schoolId && (!fate || b.allowFateCard) && a.interestedIn.includes(b.gender) && b.interestedIn.includes(a.gender))
}
function score(a, b, now = Date.now()) {
  const sharedInterests = a.interestIds.filter(id => b.interestIds.includes(id))
  const last = Number(b.lastActiveAt || b.updatedAt || 0)
  const recent = Math.max(0, 15 * (1 - Math.max(0,now-last) / (7*86400000)))
  return { sharedInterests, matchScore: Math.round((a.campusId === b.campusId ? 30 : 0) + Math.min(30, sharedInterests.length * 10) + 25 + recent) }
}
function selectCandidate(rows, random = Math.random) {
  const top = rows.slice().sort((a,b) => b.matchScore-a.matchScore).slice(0,20)
  let ticket = random() * top.reduce((sum,r) => sum + Math.max(1,r.matchScore),0)
  return top.find(r => (ticket -= Math.max(1,r.matchScore)) < 0) || top[top.length-1]
}
function sanitizeHeartProfile(p) {
  if (!p) return null
  const fields=['userId','nickname','schoolId','campusId','campusName','grade','photos','bio','interestIds','lookingFor','sharedInterests','matchScore','recentBuddy']
  return Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))
}
module.exports = { dayKey, pairId, eligible, score, selectCandidate, sanitizeHeartProfile }
