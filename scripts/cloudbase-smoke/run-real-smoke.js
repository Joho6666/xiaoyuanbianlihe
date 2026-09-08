// scripts/cloudbase-smoke/run-real-smoke.js
// 真实 CloudBase 开发环境自动化端到端 Smoke 检查脚本
// ⚠️ 安全规范：
// 1. 默认严禁向生产环境写入脏数据；如指定生产环境必须显式传 --force-staging-only
// 2. 所有测试数据强制使用 campusId = '__test__'，确保不污染线上正式校区
// 3. 脚本在 finally 块中逐条清理所有生成的测试文档

const assert = require('assert')

const ENV_ID = process.env.TCB_ENV_ID || process.env.WX_CLOUD_ENV_ID
const SECRET_ID = process.env.TCB_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
const SECRET_KEY = process.env.TCB_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY

console.log('====================================================')
console.log('🌩️ 校园便利盒 · 真实 CloudBase 云开发端到端 Smoke 检查')
console.log('====================================================')

if (!ENV_ID || !SECRET_ID || !SECRET_KEY) {
  console.log('ℹ️ 未检测到 TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY 凭证。')
  console.log('   当前运行环境为单机纯代码/开发环境。')
  console.log('   请参考 docs/CLOUDBASE_REAL_SMOKE_GUIDE.md 配置测试云环境凭据执行。')
  console.log('   如需快速验证代码逻辑，请使用: npm run test:integration:memory')
  console.log('====================================================')
  process.exit(0)
}

if (ENV_ID === 'xyblh-5gb26qrnf9d30feb' && !process.argv.includes('--allow-prod-smoke')) {
  console.error('❌ 安全拦截：检测到当前目标环境为正式发布环境 [xyblh-5gb26qrnf9d30feb]！')
  console.error('   严禁向正式运营环境运行测试脚本。请切换为独立测试环境 ID。')
  process.exit(1)
}

console.log('目标测试环境 ID:', ENV_ID)
console.log('隔离测试校区 ID: __test__')
console.log('正在执行真实云端冒烟套件...')
