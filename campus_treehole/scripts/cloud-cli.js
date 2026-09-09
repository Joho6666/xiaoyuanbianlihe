// scripts/cloud-cli.js - 自动注入环境参数的 CloudBase CLI 包装器
const { execSync } = require('child_process')
const path = require('path')
const { getEnvId } = require('./env')

const args = process.argv.slice(2)
const envId = getEnvId()

const hasEnv = args.some((a) => a === '-e' || a === '--env')
const isEnvironmentLoginCommand = args[0] === 'env' && args[1] === 'login'
if (!hasEnv && !envId && !isEnvironmentLoginCommand) {
  console.error('CLOUDBASE_ENV_ID is required. Refusing to fall back to cloudbaserc.json or any default environment.')
  process.exit(1)
}
const envArgs = hasEnv || !envId ? '' : `-e ${envId}`

const cmd = `npx -p @cloudbase/cli@latest tcb ${args.join(' ')} ${envArgs}`.trim()
console.log(`[CloudBase] 正在执行: ${cmd}`)
try {
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), shell: true })
} catch (err) {
  process.exit(err.status || 1)
}
