const crypto = require('crypto')
const { parsePickupCandidates } = require('./express-pickup-parser')
const { matchPickupPoint, deduplicatePickupCandidates } = require('./express-pickup-matcher')
const { createConfiguredOCRAdapter } = require('./express-ocr')

const MAX_IMAGES = 9
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_BATCH_BYTES = 30 * 1024 * 1024

function fail(message, statusCode = 400) { return { code: -1, statusCode, msg: message } }

function validateTemporaryImageReference(fileId, userId, requestId) {
  if (typeof fileId !== 'string' || !/^cloud:\/\/[^\s]+$/.test(fileId)) throw new Error('仅支持 CloudBase fileID')
  const escapedUser = String(userId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedRequest = String(requestId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`/tmp/express-import/${escapedUser}/${escapedRequest}/[0-9a-f-]{8,64}\\.(?:jpg|jpeg|png)$`, 'i')
  if (!pattern.test(fileId)) throw new Error('临时截图路径不属于当前请求')
  return fileId
}

function sanitizeCandidate(candidate) {
  return {
    id: String(candidate.id || `ocr_${crypto.randomBytes(4).toString('hex')}`),
    pickupCode: String(candidate.pickupCode || '').trim().slice(0, 40),
    pickupPointId: String(candidate.pickupPointId || ''),
    pickupPointName: String(candidate.pickupPointName || '').slice(0, 40),
    packageCount: Number(candidate.packageCount) || 1,
    confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0)),
    matchStatus: candidate.matchStatus === 'MATCHED' ? 'MATCHED' : 'NEEDS_REVIEW',
    warnings: Array.from(new Set((Array.isArray(candidate.warnings) ? candidate.warnings : []).filter((item) => /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(String(item))).map(String))).slice(0, 8),
    sourceImageIndex: Number(candidate.sourceImageIndex) || 1
  }
}

function sanitizeOcrResult(result = {}) {
  return {
    requestId: result.requestId,
    candidates: (result.candidates || []).map(sanitizeCandidate),
    failedImages: (result.failedImages || []).map((item) => ({ sourceImageIndex: Number(item.sourceImageIndex) || 1, reasonCode: String(item.reasonCode || 'OCR_FAILED').slice(0, 40), message: '该截图识别失败，请重试' })),
    summary: { imageCount: Number(result.summary && result.summary.imageCount) || 0, successImageCount: Number(result.summary && result.summary.successImageCount) || 0, candidateCount: Number(result.summary && result.summary.candidateCount) || 0, duplicateCount: Number(result.summary && result.summary.duplicateCount) || 0 }
  }
}

function reasonCodeFor(error) {
  const code = String(error && error.message || '').toUpperCase()
  if (['EMPTY_IMAGE', 'IMAGE_TOO_LARGE', 'BATCH_TOO_LARGE'].includes(code)) return code
  return code === 'OCR_NOT_CONFIGURED' ? 'OCR_NOT_CONFIGURED' : 'OCR_FAILED'
}

function guessMimeType(buffer) {
  if (Buffer.isBuffer(buffer) && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (Buffer.isBuffer(buffer) && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  return 'image/jpeg'
}

function mergeImportedCandidates({ pickupGroups = [], candidates = [], pickupPoints = [] } = {}) {
  const mergedItems = pickupGroups.flatMap((group) => (Array.isArray(group.items) ? group.items : []).map((item) => ({ pickupPointId: group.pickupPointId, pickupCode: String(item.pickupCode || '').trim(), packageCount: Number(item.packageCount) || 1 }))).filter((item) => item.pickupPointId && item.pickupCode)
  let skipped = 0
  for (const candidate of candidates) {
    if (!candidate || candidate.matchStatus !== 'MATCHED' || !candidate.pickupPointId || !String(candidate.pickupCode || '').trim()) continue
    const pickupCode = String(candidate.pickupCode).trim()
    if (mergedItems.some((item) => item.pickupPointId === candidate.pickupPointId && item.pickupCode.toUpperCase() === pickupCode.toUpperCase())) { skipped += 1; continue }
    mergedItems.push({ pickupPointId: candidate.pickupPointId, pickupCode, packageCount: Math.min(20, Math.max(1, Number(candidate.packageCount) || 1)) })
  }
  if (mergedItems.length > 10) return { error: '一个订单最多添加 10 个取件码' }
  if (mergedItems.reduce((sum, item) => sum + item.packageCount, 0) > 30) return { error: '一个订单最多 30 件包裹' }
  const groups = []
  mergedItems.forEach((item, index) => {
    let group = groups.find((entry) => entry.pickupPointId === item.pickupPointId)
    if (!group) {
      const pointIndex = pickupPoints.findIndex((point) => point.id === item.pickupPointId)
      const point = pickupPoints[pointIndex]
      group = { pickupPointId: item.pickupPointId, pickupPointName: point ? point.name : '', pointIndex, items: [] }
      groups.push(group)
    }
    group.items.push({ id: `imported_pickup_item_${index + 1}`, pickupCode: item.pickupCode, packageCount: item.packageCount, focus: false })
  })
  return { pickupGroups: groups.length ? groups : [{ pickupPointId: '', pickupPointName: '', pointIndex: -1, items: [{ id: 'pickup_item_empty', pickupCode: '', packageCount: 1, focus: true }] }], skipped }
}

async function cleanupTemporaryFiles(cloud, fileIds) {
  if (!fileIds.length) return null
  if (!cloud || typeof cloud.deleteFile !== 'function') return new Error('CLEANUP_UNAVAILABLE')
  try {
    const result = await cloud.deleteFile({ fileList: fileIds })
    const failed = (result && result.fileList || []).filter((item) => item && item.status != null && item.status !== 0)
    return failed.length ? new Error('CLEANUP_FAILED') : null
  } catch (_) { return new Error('CLEANUP_FAILED') }
}

function createExpressImportModule({ cloud, getUserForAction, readSettings, ocrAdapter = createConfiguredOCRAdapter(), now = () => new Date() }) {
  async function recognizeExpressScreenshots(openid, data = {}) {
    let user
    try { user = await getUserForAction(openid, { requireActive: true }) } catch (_) { return fail('请先登录', 401) }
    if (!user || user.status !== 'active') return fail('账号不可用', 403)
    const userId = String(user.internalUserId || '').trim()
    const requestId = String(data.requestId || '').trim()
    const fileIds = Array.isArray(data.imageFileIds) ? data.imageFileIds : []
    if (!userId) return fail('账号缺少内部用户标识', 403)
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) return fail('截图导入请求无效')
    if (fileIds.length < 1 || fileIds.length > MAX_IMAGES) return fail(`请选择 1-${MAX_IMAGES} 张截图`)
    const validatedFileIds = []
    let referenceError = null
    fileIds.forEach((fileId) => {
      try { validateTemporaryImageReference(fileId, userId, requestId); validatedFileIds.push(fileId) } catch (error) { referenceError = referenceError || error }
    })
    if (referenceError) {
      const cleanupError = await cleanupTemporaryFiles(cloud, validatedFileIds)
      if (cleanupError) return fail('临时截图清理失败，请重试', 503)
      return fail(referenceError.message)
    }
    const candidates = []
    const failedImages = []
    let totalBytes = 0
    let successImageCount = 0
    let cleanupError = null
    let response
    try {
      if (new Set(fileIds).size !== fileIds.length) throw new Error('DUPLICATE_FILE')
      if (!ocrAdapter || typeof ocrAdapter.recognize !== 'function') throw new Error('OCR_NOT_CONFIGURED')
      const settings = await readSettings(data.campusId || user.campusId)
      const pickupPoints = settings && Array.isArray(settings.pickupPoints) ? settings.pickupPoints : []
      if (!pickupPoints.length) throw new Error('PICKUP_POINT_NOT_CONFIGURED')
      for (let index = 0; index < fileIds.length; index += 1) {
        const sourceImageIndex = index + 1
        try {
          const downloadedFile = await cloud.downloadFile({ fileID: fileIds[index] })
          const buffer = downloadedFile && downloadedFile.fileContent
          if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('EMPTY_IMAGE')
          if (buffer.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE')
          totalBytes += buffer.length
          if (totalBytes > MAX_BATCH_BYTES) throw new Error('BATCH_TOO_LARGE')
          const recognized = await ocrAdapter.recognize({ buffer, mimeType: guessMimeType(buffer), sourceImageIndex, now })
          const parsed = parsePickupCandidates(recognized && recognized.text, { sourceImageIndex })
          parsed.forEach((candidate) => candidates.push(matchPickupPoint(candidate, pickupPoints, { deliveryCampus: data.deliveryCampus })))
          successImageCount += 1
        } catch (error) {
          failedImages.push({ sourceImageIndex, reasonCode: reasonCodeFor(error) })
        }
      }
      const deduped = deduplicatePickupCandidates(candidates)
      response = { code: 0, data: sanitizeOcrResult({ requestId, candidates: deduped, failedImages, summary: { imageCount: fileIds.length, successImageCount, candidateCount: deduped.length, duplicateCount: deduped.duplicateCount || 0 } }) }
    } catch (error) {
      response = fail('截图识别失败，请重试')
    } finally {
      cleanupError = await cleanupTemporaryFiles(cloud, fileIds)
      if (cleanupError) console.warn('[express-import] temporary cleanup failed', { requestId, imageCount: fileIds.length })
    }
    if (cleanupError) return fail('临时截图清理失败，请重试', 503)
    return response || fail('截图识别失败，请重试')
  }

  return { recognizeExpressScreenshots }
}

module.exports = { createExpressImportModule, validateTemporaryImageReference, sanitizeOcrResult, guessMimeType, mergeImportedCandidates, cleanupTemporaryFiles, MAX_IMAGES, MAX_IMAGE_BYTES, MAX_BATCH_BYTES }
