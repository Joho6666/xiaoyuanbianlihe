/**
 * Cross-platform CloudBase CLI wrapper.
 * Prefer CLOUD_ENV_ID, then the ignored local cloudbaserc.json.
 */
const { spawnSync } = require('child_process')
const path = require('path')
const resolveEnvId = require('./resolve-env-id')

const root = path.resolve(__dirname, '..')
const envId = resolveEnvId()

const cliArgs = process.argv.slice(2)
if (!cliArgs.includes('-e') && !cliArgs.includes('--env')) cliArgs.push('-e', envId)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, ['-p', '@cloudbase/cli@latest', 'tcb', ...cliArgs], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true
})
if (result.error) throw result.error
process.exit(result.status == null ? 1 : result.status)
