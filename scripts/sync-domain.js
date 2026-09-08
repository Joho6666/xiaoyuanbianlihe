// scripts/sync-domain.js - 自动同步 shared/domain 领域模型至小程序目录
const fs = require('fs')
const path = require('path')

const SOURCE_DIR = path.join(__dirname, '..', 'shared', 'domain')
const TARGET_DIR = path.join(__dirname, '..', 'campus_treehole', 'utils', 'domain')

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`❌ 源目录不存在: ${SOURCE_DIR}`)
  process.exit(1)
}

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true })
}

const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.js'))
let synced = 0

for (const file of files) {
  const srcFile = path.join(SOURCE_DIR, file)
  const tgtFile = path.join(TARGET_DIR, file)
  const content = fs.readFileSync(srcFile, 'utf8')
  fs.writeFileSync(tgtFile, content, 'utf8')
  synced++
  console.log(`  ✓ 同步: shared/domain/${file} -> campus_treehole/utils/domain/${file}`)
}

console.log(`\n✅ 成功同步 ${synced} 个领域模型文件！`)
