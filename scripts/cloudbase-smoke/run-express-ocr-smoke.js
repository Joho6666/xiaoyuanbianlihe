// Real Express OCR smoke. Independent CloudBase only; no production writes.
const assert = require('assert')
const fs = require('fs')
const crypto = require('crypto')
const { isProductionEnv, normalizeEnvId } = require('../cloudbase-target')
const { publicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/public-data')
const { createExpressImportModule } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-import')
const { createConfiguredOCRAdapter } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-ocr')

const required = process.argv.includes('--required')
const envId = normalizeEnvId(process.env.TCB_ENV_ID)
const imagePath = String(process.env.EXPRESS_OCR_SMOKE_IMAGE || '').trim()
const missing = !envId || !process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY || !process.env.EXPRESS_OCR_TEST_ENV_ID || process.env.EXPRESS_OCR_TEST_ENV_ID !== envId || process.env.EXPRESS_OCR_PROVIDER !== 'tencent' || !process.env.TENCENT_OCR_SECRET_ID || !process.env.TENCENT_OCR_SECRET_KEY || !imagePath

function notRun(reason) {
  console.log(`NOT RUN: ${reason}`)
  process.exitCode = required ? 1 : 0
}

if (missing) notRun('independent CloudBase env, OCR credentials, EXPRESS_OCR_PROVIDER=tencent and EXPRESS_OCR_SMOKE_IMAGE are required')
else if (isProductionEnv(envId)) notRun('Production environment is never eligible for OCR smoke writes')
else if (!fs.existsSync(imagePath)) notRun('EXPRESS_OCR_SMOKE_IMAGE does not exist')
else {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: envId, secretId: process.env.TCB_SECRET_ID, secretKey: process.env.TCB_SECRET_KEY })
  const db = cloud.database()
  const runId = `express_ocr_smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  const userOpenid = `${runId}_user`
  const userId = publicId(userOpenid)
  const imageFileIds = []
  const adapter = createConfiguredOCRAdapter()
  const user = { _id: `smoke_user_${runId}`, _openid: userOpenid, internalUserId: userId, status: 'active', role: 'user', campusId: runId, smokeRunId: runId }
  const settings = { _id: runId, schoolId: 'guat', campusId: runId, acceptingOrders: true, pickupPoints: [{ id: 'smoke-sf', name: '顺丰服务点', shortName: '顺丰', aliases: ['SF'], deliveryCampus: 'south', enabled: true }], smokeRunId: runId }
  const importer = createExpressImportModule({ cloud, ocrAdapter: adapter, getUserForAction: async (openid) => openid === userOpenid ? user : null, readSettings: async () => settings })

  ;(async () => {
    let failure = null
    try {
      await db.collection('users').doc(user._id).set({ data: user })
      await db.collection('express_settings').doc(settings._id).set({ data: settings })
      const cloudPath = `tmp/express-import/${userId}/${runId}/11111111-1111-4111-8111-111111111111.jpg`
      const upload = await cloud.uploadFile({ cloudPath, filePath: imagePath })
      imageFileIds.push(upload.fileID)
      const result = await importer.recognizeExpressScreenshots(userOpenid, { requestId: runId, imageFileIds, deliveryCampus: 'south' })
      assert.equal(result.code, 0)
      assert(result.data.candidates.length > 0, 'OCR returned no pickup candidates')
      assert(result.data.candidates.some((candidate) => candidate.pickupPointId === 'smoke-sf'), 'OCR candidate did not match configured pickup point')
      console.log('PASS: real Express OCR parse, point matching, response sanitization and temporary cleanup')
    } catch (error) { failure = error; console.error(`FAIL: Express OCR smoke: ${error.message || error}`) }
    try {
      await db.collection('users').doc(user._id).remove()
      await db.collection('express_settings').doc(settings._id).remove()
      if (imageFileIds.length) await cloud.deleteFile({ fileList: imageFileIds })
    } catch (error) { failure = failure || error; console.error(`FAIL: Express OCR smoke cleanup: ${error.message || error}`) }
    if (failure) process.exitCode = 1
  })()
}
