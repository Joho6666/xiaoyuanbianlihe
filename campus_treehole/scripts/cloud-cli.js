// scripts/cloud-cli.js - 自动注入环境参数的 CloudBase CLI 包装器
const { execSync } = require('child_process')
const path = require('path')
const { getEnvId } = require('./env')

const args = process.argv.slice(2)
const envId = getEnvId()

const hasEnv = args.some((a) => a === '-e' || a === '--env')
const envArgs = hasEnv ? '' : `-e ${envId}`

const cmd = `npx -p @cloudbase/cli@latest tcb ${args.join(' ')} ${envArgs}`.trim()
console.log(`[CloudBase] 正在执行: ${cmd}`)
try {
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..'), shell: true })
} catch (err) {
  process.exit(err.status || 1)
}
