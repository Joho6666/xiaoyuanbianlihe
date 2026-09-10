// scripts/run-tests.js - 全局测试执行器
const path = require('path')

console.log('====================================================')
console.log('🚀 校园便利盒 · 统一底座自动化测试套件')
console.log('====================================================')

const testFiles = [
  path.join(__dirname, '..', 'test', 'regression', 'feed-interactions.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-safety.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'beta-access.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-profile.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-like.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'fate-card.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-privacy.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'chat-context.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-reaction-transition.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-feature-flag.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-storage.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'heart-ban.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'cloudbase-safety.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'contact-grants.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'staff-permissions.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-orders.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-order-state.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-address.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-pricing.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-staff-permissions.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-migration.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-export.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-security-contract.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'express-ui.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'phase2-ui.test.js'),

  path.join(__dirname, '..', 'test', 'regression', 'school-isolation.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'campus-now-and-expiry.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'public-data.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'schools.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'content-safety.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'landing.test.js'),
  path.join(__dirname, '..', 'test', 'unit', 'domain.test.js'),
  path.join(__dirname, '..', 'test', 'unit', 'i18n.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'cloudfunctions.test.js')
]

let passed = 0
let failed = 0

for (const file of testFiles) {
  try {
    const result = require('child_process').spawnSync(process.execPath, [file], {stdio:'inherit'})
    if (result.status !== 0) throw new Error('Test process failed: ' + file)
  } catch (err) {
    console.error(`\n[FATAL] 执行测试套件异常: ${file}`)
    console.error(err)
    failed++
    process.exitCode = 1
  }
}

process.on('exit', (code) => {
  if (code !== 0 || failed > 0) {
    console.log('\n❌ 测试失败，请检查报错')
  } else {
    console.log('\n====================================================')
    console.log('✅ 所有单元测试与云函数回归测试全部通过！')
    console.log('====================================================\n')
  }
})
