function createMockOCRAdapter(responses = {}) {
  return {
    async recognize({ sourceImageIndex }) {
      const response = responses[sourceImageIndex] || responses[String(sourceImageIndex)]
      if (response instanceof Error) throw response
      if (typeof response === 'string') return { text: response }
      return response || { text: '' }
    }
  }
}

function createTencentOCRAdapter({ secretId, secretKey, region = 'ap-guangzhou' } = {}) {
  if (!secretId || !secretKey) throw new Error('OCR credentials are not configured')
  const tencentcloud = require('tencentcloud-sdk-nodejs-ocr')
  const OcrClient = tencentcloud.ocr.v20181119.Client
  const client = new OcrClient({ credential: { secretId, secretKey }, region, profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } } })
  return {
    async recognize({ buffer }) {
      const result = await client.GeneralBasicOCR({ ImageBase64: Buffer.from(buffer).toString('base64') })
      return { text: (result.TextDetections || []).map((item) => item.DetectedText).filter(Boolean).join('\n') }
    }
  }
}

function createConfiguredOCRAdapter(env = process.env) {
  const provider = String(env.EXPRESS_OCR_PROVIDER || '').trim().toLowerCase()
  if (provider === 'mock') {
    if (env.APP_ENV === 'production' || env.EXPRESS_OCR_MOCK_ALLOWED !== 'true') return null
    return createMockOCRAdapter()
  }
  if (provider === 'tencent') {
    if (env.APP_ENV === 'production' || !env.TCB_ENV_ID || !env.EXPRESS_OCR_TEST_ENV_ID || env.TCB_ENV_ID !== env.EXPRESS_OCR_TEST_ENV_ID || !env.TENCENT_OCR_SECRET_ID || !env.TENCENT_OCR_SECRET_KEY) return null
    return createTencentOCRAdapter({ secretId: env.TENCENT_OCR_SECRET_ID, secretKey: env.TENCENT_OCR_SECRET_KEY, region: env.TENCENT_OCR_REGION })
  }
  return null
}

module.exports = { createMockOCRAdapter, createTencentOCRAdapter, createConfiguredOCRAdapter }
