// shared/id.js - 确定性 ID 与 UUID 工具
const crypto = require('crypto')

// 生成确定性 _id，配合 doc().get/set 实现幂等写入，防止并发重复
function makeDeterministicId(scope, ...parts) {
  const raw = [scope, ...parts.map((p) => String(p == null ? '' : p))].join('|')
  return `${scope}_${crypto.createHash('md5').update(raw).digest('hex')}`
}

module.exports = {
  makeDeterministicId
}
