// scripts/check-domain.js - 校验 shared/domain 与 campus_treehole/utils/domain 一致性
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SOURCE_DIR = path.join(__dirname, '..', 'shared', 'domain')
const TARGET_DIR = path.join(__dirname, '..', 'campus_treehole', 'utils', 'domain')

function getHash(filePath) {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

if (!fs.existsSync(SOURCE_DIR) || !fs.existsSync(TARGET_DIR)) {
  console.error('❌ 领域模型目录不存在，请检查路径')
  process.exit(1)
}

const srcFiles = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.js')).sort()
const tgtFiles = fs.readdirSync(TARGET_DIR).filter((f) => f.endsWith('.js')).sort()

let errors = 0

// 检查文件集合是否完全一致
const allFiles = Array.from(new Set([...srcFiles, ...tgtFiles]))
for (const file of allFiles) {
  const srcPath = path.join(SOURCE_DIR, file)
  const tgtPath = path.join(TARGET_DIR, file)

  const srcHash = getHash(srcPath)
  const tgtHash = getHash(tgtPath)

  if (!srcHash) {
    console.error(`❌ 文件仅在小程序中存在，缺少权威定义: shared/domain/${file}`)
    errors++
  } else if (!tgtHash) {
    console.error(`❌ 文件未同步至小程序目录: campus_treehole/utils/domain/${file}`)
    errors++
  } else if (srcHash !== tgtHash) {
    console.error(`❌ 内容哈希不一致: ${file}`)
    console.error(`   shared/domain:              ${srcHash.slice(0, 16)}...`)
    console.error(`   campus_treehole/utils/domain: ${tgtHash.slice(0, 16)}...`)
    errors++
  } else {
    console.log(`  ✓ 校验一致: ${file}`)
  }
}

if (errors > 0) {
  console.error(`\n❌ 发现 ${errors} 处领域模型不一致！`)
  console.error('👉 请运行 "npm run sync:domain" 自动同步，严禁手工维护两份副本！')
  process.exit(1)
} else {
  console.log('\n✅ 领域模型单一 Source of Truth 校验通过！')
}
