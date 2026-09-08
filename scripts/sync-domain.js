// scripts/sync-domain.js - 自动同步 shared/domain 领域模型至小程序端与云函数
const fs = require('fs')
const path = require('path')

const SOURCE_DIR = path.join(__dirname, '..', 'shared', 'domain')
const TARGET_MINIPROGRAM_DIR = path.join(__dirname, '..', 'campus_treehole', 'utils', 'domain')
const TARGET_CLOUDFUNCTION_DIR = path.join(__dirname, '..', 'campus_treehole', 'cloudfunctions', 'dbOperations', 'domain')

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`❌ 源目录不存在: ${SOURCE_DIR}`)
  process.exit(1)
}

[TARGET_MINIPROGRAM_DIR, TARGET_CLOUDFUNCTION_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.js'))
let synced = 0

for (const file of files) {
  const srcFile = path.join(SOURCE_DIR, file)
  const content = fs.readFileSync(srcFile, 'utf8')

  fs.writeFileSync(path.join(TARGET_MINIPROGRAM_DIR, file), content, 'utf8')
  fs.writeFileSync(path.join(TARGET_CLOUDFUNCTION_DIR, file), content, 'utf8')
  synced++
  console.log(`  ✓ 同步: shared/domain/${file} -> 小程序端 & 云函数 dbOperations/domain`)
}

console.log(`\n✅ 成功同步 ${synced} 个领域模型文件！`)
