const CODE_PATTERNS = [
  /\b[A-Z]{1,8}\d[A-Z0-9-]{2,30}\b/gi,
  /\b\d{1,4}(?:-\d{1,4}){1,3}\b/g,
  /\b\d{4,10}\b/g
]

function cleanLine(value) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isPhone(value) {
  return /^1\d{10}$/.test(String(value || '').replace(/\s/g, ''))
}

function isDateLike(value) {
  return /^(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(String(value || ''))
}

function extractCodes(text) {
  const source = String(text || '').toUpperCase()
  const values = []
  const seen = new Set()
  CODE_PATTERNS.forEach((pattern) => {
    let match
    while ((match = pattern.exec(source)) !== null) {
      const code = cleanLine(match[0]).replace(/[，。；;]+$/g, '')
      if (!code || isPhone(code) || isDateLike(code) || seen.has(code)) continue
      const contextBefore = source.slice(Math.max(0, match.index - 8), match.index)
      const contextAfter = source.slice(match.index + code.length, match.index + code.length + 8)
      if (/手机号|电话|手机/.test(contextBefore)) continue
      if (/^\d+$/.test(code) && !/(取件码|提货码|验证码|驿站码|包裹|快递|code|取件)/i.test(`${contextBefore}${contextAfter}`)) continue
      seen.add(code)
      values.push({ code, index: match.index, end: match.index + match[0].length })
    }
  })
  return values.sort((a, b) => a.index - b.index || b.code.length - a.code.length).filter((entry, index, all) => {
    const previous = all.slice(0, index).find((item) => entry.index < item.end && entry.end > item.index)
    return !previous
  })
}

function findPointText(lines, codeLineIndex) {
  const carrier = /菜鸟|顺丰|丰巢|京东|中通|圆通|申通|韵达|极兔|邮政|快递|驿站|服务点|取件点/i
  const nearby = []
  for (let offset = -2; offset <= 2; offset += 1) {
    const line = lines[codeLineIndex + offset]
    if (line && carrier.test(line) && !/取件码|包裹数|手机号|电话/.test(line)) nearby.push(line)
  }
  return nearby.sort((a, b) => Math.abs(lines.indexOf(a) - codeLineIndex) - Math.abs(lines.indexOf(b) - codeLineIndex))[0] || ''
}

function parsePackageCount(text, codeCount, codeLine = '') {
  const source = String(codeLine || text || '')
  const match = source.match(/(?:共|包裹数|包裹数量|数量)\s*[:：]?\s*(\d{1,2})\s*(?:件|个包裹|个)/i) || source.match(/(\d{1,2})\s*件/i)
  if (!match) return { packageCount: 1, warning: 'packageCountDefaulted' }
  const count = Number(match[1])
  if (!Number.isInteger(count) || count < 1 || count > 20) return { packageCount: 1, warning: 'packageCountAmbiguous' }
  return { packageCount: count }
}

function parsePickupCandidates(text, context = {}) {
  const lines = String(text || '').split(/\r?\n/).map(cleanLine).filter(Boolean)
  const codes = extractCodes(lines.join('\n'))
  return codes.map((entry, index) => {
    const codeLineIndex = lines.findIndex((line) => line.toUpperCase().includes(entry.code))
    const pickupPointText = findPointText(lines, codeLineIndex >= 0 ? codeLineIndex : 0)
    const countContext = codes.length === 1 ? lines.join('\n') : (lines[codeLineIndex] || '')
    const count = parsePackageCount(countContext, codes.length, countContext)
    const warnings = []
    if (count.warning) warnings.push(count.warning)
    const confidence = Math.min(0.99, 0.62 + (pickupPointText ? 0.2 : 0) + (count.warning ? 0 : 0.08))
    return {
      id: `ocr_candidate_${context.sourceImageIndex || 1}_${index + 1}`,
      pickupCode: entry.code,
      pickupPointText,
      parcelSize: null,
      packageCount: count.packageCount,
      confidence,
      warnings,
      sourceImageIndex: Number(context.sourceImageIndex) || 1
    }
  })
}

module.exports = { parsePickupCandidates, extractCodes }
