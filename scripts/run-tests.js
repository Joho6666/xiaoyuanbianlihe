// scripts/run-tests.js - 全局测试执行器
const path = require('path')

console.log('====================================================')
console.log('🚀 校园便利盒 · 统一底座自动化测试套件')
console.log('====================================================')

const testFiles = [
  path.join(__dirname, '..', 'test', 'unit', 'domain.test.js'),
  path.join(__dirname, '..', 'test', 'unit', 'i18n.test.js'),
  path.join(__dirname, '..', 'test', 'regression', 'cloudfunctions.test.js')
]

let passed = 0
let failed = 0

for (const file of testFiles) {
  try {
    require(file)
  } catch (err) {
    console.error(`\n[FATAL] 执行测试套件异常: ${file}`)
    console.error(err)
    failed++
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
