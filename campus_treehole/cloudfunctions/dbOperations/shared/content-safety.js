function createContentValidator({ checkBannedWords, wxTextCheck, wxImageBatchCheck }) {
  return async function validateUserContent({ openid, text = '', images = [] }) {
    if (!openid || typeof text !== 'string' || !Array.isArray(images)) return { pass: false, reason: '内容参数不合法', code: -2 }
    try {
      const local = checkBannedWords(text)
      if (!local || local.pass !== true) return { pass: false, reason: '内容未通过安全审核', code: -2 }
      if (text.trim()) {
        const result = await wxTextCheck(openid, text)
        if (!result || result.pass !== true) return { pass: false, reason: '内容未通过安全审核', code: -2 }
      }
      if (images.length) {
        const result = await wxImageBatchCheck(openid, images)
        if (!result || result.pass !== true) return { pass: false, reason: '图片未通过安全审核', code: -2 }
      }
      return { pass: true, reason: '', code: 0 }
    } catch (_) {
      return { pass: false, reason: '安全审核暂不可用，请稍后重试', code: -2 }
    }
  }
}
module.exports = { createContentValidator }
