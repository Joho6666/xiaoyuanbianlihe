// scripts/check-domain.js - 校验 shared/domain 与小程序及云函数副本的一致性
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SOURCE_DIR = path.join(__dirname, '..', 'shared', 'domain')
const TARGET_MINIPROGRAM_DIR = path.join(__dirname, '..', 'campus_treehole', 'utils', 'domain')
const TARGET_CLOUDFUNCTION_DIR = path.join(__dirname, '..', 'campus_treehole', 'cloudfunctions', 'dbOperations', 'domain')

function getHash(filePath) {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

if (!fs.existsSync(SOURCE_DIR) || !fs.existsSync(TARGET_MINIPROGRAM_DIR) || !fs.existsSync(TARGET_CLOUDFUNCTION_DIR)) {
  console.error('❌ 领域模型目录缺失，请先运行 npm run sync:domain')
  process.exit(1)
}

const srcFiles = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.js')).sort()
let errors = 0

for (const file of srcFiles) {
  const srcHash = getHash(path.join(SOURCE_DIR, file))
  const miniHash = getHash(path.join(TARGET_MINIPROGRAM_DIR, file))
  const cfHash = getHash(path.join(TARGET_CLOUDFUNCTION_DIR, file))

  if (!miniHash) {
    console.error(`❌ 小程序端缺失: campus_treehole/utils/domain/${file}`)
    errors++
  } else if (srcHash !== miniHash) {
    console.error(`❌ 小程序端与 shared/domain 不一致: ${file}`)
    errors++
  }

  if (!cfHash) {
    console.error(`❌ 云函数端缺失: campus_treehole/cloudfunctions/dbOperations/domain/${file}`)
    errors++
  } else if (srcHash !== cfHash) {
    console.error(`❌ 云函数端与 shared/domain 不一致: ${file}`)
    errors++
  }

  if (miniHash === srcHash && cfHash === srcHash) {
    console.log(`  ✓ 校验一致 (双向同步): ${file}`)
  }
}

if (errors > 0) {
  console.error(`\n❌ 发现 ${errors} 处领域模型不一致！`)
  console.error('👉 请运行 "npm run sync:domain" 自动同步，严禁手工维护！')
  process.exit(1)
} else {
  console.log('\n✅ 领域模型单一 Source of Truth 校验通过！')
}
