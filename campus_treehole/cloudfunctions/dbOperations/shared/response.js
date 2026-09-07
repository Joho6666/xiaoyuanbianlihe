// shared/response.js - 统一响应封装
function success(data = null, msg = 'ok') {
  return {
    code: 0,
    msg,
    data
  }
}

function error(msg = '操作失败', code = -1, extra = {}) {
  return {
    code,
    msg,
    ...extra
  }
}

module.exports = {
  success,
  error
}
