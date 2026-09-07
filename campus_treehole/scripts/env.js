// scripts/env.js - 环境配置提取与平滑回退
const path = require('path')
const fs = require('fs')

function getEnvId() {
  if (process.env.CLOUDBASE_ENV_ID) return process.env.CLOUDBASE_ENV_ID.trim()
  try {
    const rcPath = path.join(__dirname, '..', 'cloudbaserc.json')
    if (fs.existsSync(rcPath)) {
      const cfg = JSON.parse(fs.readFileSync(rcPath, 'utf8'))
      if (cfg && cfg.envId) return cfg.envId.trim()
    }
  } catch (e) {}
  return 'xyblh-5gb26qrnf9d30feb'
}

function getAdminSourcePath() {
  if (process.env.ADMIN_SOURCE_PATH) return process.env.ADMIN_SOURCE_PATH.trim()
  return path.join(process.env.USERPROFILE || '', 'Desktop', 'admin后台')
}

module.exports = {
  getEnvId,
  getAdminSourcePath
}

if (require.main === module) {
  console.log(`CloudBase Env ID: ${getEnvId()}`)
  console.log(`Admin Source Path: ${getAdminSourcePath()}`)
}
