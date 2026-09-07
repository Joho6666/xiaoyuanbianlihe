// shared/escape.js - 正则表达式安全转义
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  escapeRegExp
}
