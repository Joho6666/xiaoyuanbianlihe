function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s\-—_/\\()[\]{}（）【】、，。,:：·'"`]/g, '')
}

function pointLabels(point) {
  return [point.name, point.shortName, ...(Array.isArray(point.aliases) ? point.aliases : [])].map(normalize).filter(Boolean)
}

function matchPickupPoint(candidate, pickupPoints = [], context = {}) {
  const source = { ...candidate, pickupPointId: '', pickupPointName: '', matchStatus: 'NEEDS_REVIEW', warnings: Array.isArray(candidate.warnings) ? candidate.warnings.slice() : [] }
  const text = normalize(candidate.pickupPointText || candidate.pickupPointName || '')
  if (!text) {
    source.warnings.push('pickupPointMissing')
    return source
  }
  const available = pickupPoints.filter((point) => point && point.enabled !== false && (!context.deliveryCampus || !point.deliveryCampus || point.deliveryCampus === context.deliveryCampus))
  const scored = []
  available.forEach((point) => {
    pointLabels(point).forEach((label) => {
      let score = 0
      if (text === label) score = 1
      else if (text.includes(label) || label.includes(text)) score = Math.min(text.length, label.length) / Math.max(text.length, label.length) * 0.82
      if (score > 0) scored.push({ point, score })
    })
  })
  scored.sort((a, b) => b.score - a.score)
  const uniqueScores = []
  const seenPoints = new Set()
  scored.forEach((entry) => {
    const pointId = String(entry.point.id)
    if (seenPoints.has(pointId)) return
    seenPoints.add(pointId)
    uniqueScores.push(entry)
  })
  const best = uniqueScores[0]
  const second = uniqueScores[1]
  if (!best || (second && Math.abs(best.score - second.score) < 0.08)) {
    source.warnings.push(best ? 'pickupPointAmbiguous' : 'pickupPointUnmatched')
    if (!best && available.length === 0 && pickupPoints.some((point) => point && point.enabled !== false)) source.warnings.push('pickupPointCampusMismatch')
    return source
  }
  source.pickupPointId = String(best.point.id)
  source.pickupPointName = String(best.point.name || best.point.shortName || best.point.id)
  source.matchStatus = 'MATCHED'
  source.confidence = Math.max(Number(candidate.confidence) || 0, Math.min(0.99, best.score))
  return source
}

function deduplicatePickupCandidates(candidates = []) {
  const byKey = new Map()
  let duplicateCount = 0
  candidates.forEach((candidate) => {
    const pointKey = candidate.pickupPointId || normalize(candidate.pickupPointText || candidate.pickupPointName)
    const key = `${pointKey}\u0000${String(candidate.pickupCode || '').trim().toUpperCase()}`
    if (!key || key === '\u0000') return
    const previous = byKey.get(key)
    if (!previous) {
      byKey.set(key, { ...candidate, warnings: Array.isArray(candidate.warnings) ? candidate.warnings.slice() : [] })
      return
    }
    duplicateCount += 1
    const winner = (Number(candidate.confidence) || 0) > (Number(previous.confidence) || 0) ? { ...candidate, warnings: Array.isArray(candidate.warnings) ? candidate.warnings.slice() : [] } : previous
    winner.warnings = Array.from(new Set([...(winner.warnings || []), 'duplicateCandidate']))
    byKey.set(key, winner)
  })
  const result = Array.from(byKey.values())
  Object.defineProperty(result, 'duplicateCount', { value: duplicateCount, enumerable: false })
  return result
}

module.exports = { normalize, matchPickupPoint, deduplicatePickupCandidates }
