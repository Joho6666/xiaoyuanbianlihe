// Payment boundary for Express. The test adapter is the only enabled adapter
// until a separately configured WeChat merchant integration is supplied.
function createPaymentAdapter({ testEnabled = false } = {}) {
  return {
    name: testEnabled ? 'TestPaymentAdapter' : 'WechatPayAdapter',
    async createPayment() {
      if (!testEnabled) return { code: -1, statusCode: 403, msg: '真实微信支付尚未配置' }
      return { code: -1, statusCode: 403, msg: '测试支付请使用独立环境测试动作' }
    },
    async queryPayment() { return { code: -1, statusCode: 501, msg: '支付查询适配器尚未配置' } },
    async handlePaymentNotification() { return { code: -1, statusCode: 501, msg: '支付通知适配器尚未配置' } }
  }
}

module.exports = { createPaymentAdapter }
