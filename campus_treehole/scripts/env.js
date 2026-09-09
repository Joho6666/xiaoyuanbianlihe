// scripts/env.js - 环境配置提取与平滑回退
const path = require('path')

function getEnvId() {
  if (process.env.CLOUDBASE_ENV_ID) return process.env.CLOUDBASE_ENV_ID.trim()
  return ''
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
