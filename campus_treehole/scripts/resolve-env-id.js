const fs = require('fs')
const path = require('path')

module.exports = function resolveEnvId() {
  let envId = String(process.env.CLOUD_ENV_ID || '').trim()
  if (!envId) {
    const configPath = path.resolve(__dirname, '..', 'cloudbaserc.json')
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      envId = String(config.envId || '').trim()
    }
  }
  if (!envId || /^(YOUR_CLOUD_ENV_ID|你的云环境ID)$/i.test(envId)) {
    throw new Error('请先设置 CLOUD_ENV_ID，或在 campus_treehole/cloudbaserc.json 配置 envId')
  }
  return envId
}
