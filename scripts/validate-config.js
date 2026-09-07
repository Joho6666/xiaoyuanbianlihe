// scripts/validate-config.js - 小程序配置与分包路径校验器
const fs = require('fs')
const path = require('path')

console.log('📋 开始校验小程序配置与分包完整性...')

const projectRoot = path.join(__dirname, '..')
const miniprogramRoot = path.join(projectRoot, 'campus_treehole')
const appJsonPath = path.join(miniprogramRoot, 'app.json')
const projectConfigPath = path.join(projectRoot, 'project.config.json')

let errors = 0

// 1. 检查 project.config.json
try {
  const pcfg = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
  if (!pcfg.miniprogramRoot) {
    console.error('❌ project.config.json 缺少 miniprogramRoot')
    errors++
  }
} catch (err) {
  console.error('❌ 无法解析 project.config.json:', err.message)
  errors++
}

// 2. 检查 app.json
try {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))

  // 校验主包页面
  const mainPages = appJson.pages || []
  console.log(`主包页面数: ${mainPages.length}`)
  for (const p of mainPages) {
    const jsPath = path.join(miniprogramRoot, `${p}.js`)
    const wxmlPath = path.join(miniprogramRoot, `${p}.wxml`)
    if (!fs.existsSync(jsPath)) {
      console.error(`❌ 主包页面缺失对应 .js 文件: ${p}`)
      errors++
    }
    if (!fs.existsSync(wxmlPath)) {
      console.error(`❌ 主包页面缺失对应 .wxml 文件: ${p}`)
      errors++
    }
  }

  // 校验分包页面
  const subpackages = appJson.subpackages || []
  console.log(`分包数量: ${subpackages.length}`)
  for (const sp of subpackages) {
    const root = sp.root
    const pages = sp.pages || []
    console.log(`  - 分包 [${root}] 页面数: ${pages.length}`)
    for (const p of pages) {
      const jsPath = path.join(miniprogramRoot, root, `${p}.js`)
      const wxmlPath = path.join(miniprogramRoot, root, `${p}.wxml`)
      if (!fs.existsSync(jsPath)) {
        console.error(`❌ 分包 [${root}] 页面缺失 .js 文件: ${p} (查找路径: ${jsPath})`)
        errors++
      }
      if (!fs.existsSync(wxmlPath)) {
        console.error(`❌ 分包 [${root}] 页面缺失 .wxml 文件: ${p} (查找路径: ${wxmlPath})`)
        errors++
      }
    }
  }

  // 校验 TabBar
  if (appJson.tabBar && appJson.tabBar.list) {
    for (const tab of appJson.tabBar.list) {
      if (!mainPages.includes(tab.pagePath)) {
        console.error(`❌ TabBar 项必须属于主包: ${tab.pagePath}`)
        errors++
      }
    }
  }

} catch (err) {
  console.error('❌ 无法解析 app.json:', err.message)
  errors++
}

console.log(`\n配置校验完成：共发现 ${errors} 处配置/文件引用异常`)

if (errors > 0) {
  process.exit(1)
} else {
  console.log('✅ 小程序页面与分包路由 100% 存在且配置有效！')
}
