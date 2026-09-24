// scripts/lint.js - 快速语法与静态校验检查器
const fs = require('fs')
const path = require('path')
const vm = require('vm')

console.log('🔍 开始执行全项目 JavaScript 语法校验...')

const TARGET_DIRS = [
  path.join(__dirname, '..', 'shared'),
  path.join(__dirname, '..', 'test'),
  path.join(__dirname, '..', 'scripts'),
  path.join(__dirname, '..', 'campus_treehole', 'utils'),
  path.join(__dirname, '..', 'campus_treehole', 'locales'),
  path.join(__dirname, '..', 'campus_treehole', 'custom-tab-bar'),
  path.join(__dirname, '..', 'campus_treehole', 'pages'),
  path.join(__dirname, '..', 'campus_treehole', 'packageMarket'),
  path.join(__dirname, '..', 'campus_treehole', 'packageEvents'),
  path.join(__dirname, '..', 'campus_treehole', 'packageBuddy'),
  path.join(__dirname, '..', 'campus_treehole', 'packageBridge'),
  path.join(__dirname, '..', 'campus_treehole', 'packageMutual'),
  path.join(__dirname, '..', 'campus_treehole', 'packageRide'),
  path.join(__dirname, '..', 'campus_treehole', 'cloudfunctions')
]

function scanJsFiles(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'cookbook'].includes(entry.name)) continue
      results = results.concat(scanJsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath)
    }
  }
  return results
}

let checked = 0
let errors = 0

for (const targetDir of TARGET_DIRS) {
  const files = scanJsFiles(targetDir)
  for (const file of files) {
    checked++
    try {
      const code = fs.readFileSync(file, 'utf8')
      new vm.Script(code, { filename: file })
    } catch (err) {
      console.error(`❌ 语法错误: ${file}`)
      console.error(err.message)
      errors++
    }
  }
}

console.log(`\n语法校验完成：共检查 ${checked} 个文件，发现 ${errors} 处语法错误`)

if (errors > 0) {
  process.exit(1)
} else {
  console.log('✅ 100% JavaScript 代码语法无误！')
}
