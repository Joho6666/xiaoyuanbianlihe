const assert = require('assert')
const path = require('path')
const { spawnSync } = require('child_process')
const { PRODUCTION_ENV_ID, isProductionEnv } = require('../../scripts/cloudbase-target')

const root = path.resolve(__dirname, '..', '..')
const run = (script, args = [], env = {}) => spawnSync(process.execPath, [path.join(root, script), ...args], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TCB_ENV_ID: '', TCB_SECRET_ID: '', TCB_SECRET_KEY: '', ...env }
})
const output = result => `${result.stdout || ''}${result.stderr || ''}`

assert.equal(isProductionEnv(PRODUCTION_ENV_ID.toUpperCase()), true)
assert.equal(isProductionEnv('independent-test-env'), false)

let result = run('scripts/cloudbase-smoke/run-real-smoke.js')
assert.equal(result.status, 0)
assert.match(output(result), /NOT RUN: Missing Test Environment Credentials/)

result = run('scripts/cloudbase-smoke/run-real-smoke.js', ['--required'])
assert.equal(result.status, 1)
assert.match(output(result), /NOT RUN: Missing Test Environment Credentials/)

result = run('scripts/cloudbase-smoke/run-real-smoke.js', ['--required'], {
  TCB_ENV_ID: PRODUCTION_ENV_ID,
  TCB_SECRET_ID: 'test-only-id',
  TCB_SECRET_KEY: 'test-only-key'
})
assert.equal(result.status, 1)
assert.match(output(result), /Production environment is never eligible/)

result = run('scripts/provision-heart.js', ['--env', PRODUCTION_ENV_ID, '--apply'])
assert.equal(result.status, 1)
assert.match(output(result), /REFUSED: provisioning production/)

result = run('scripts/cloudbase-smoke/deploy-test-dboperations.js', [], { TCB_ENV_ID: 'independent-test-env' })
assert.equal(result.status, 0)
assert.match(output(result), /DRY RUN/)

result = run('scripts/cloudbase-smoke/deploy-test-dboperations.js', ['--apply'], { TCB_ENV_ID: PRODUCTION_ENV_ID })
assert.equal(result.status, 1)
assert.match(output(result), /Production environment is never eligible/)

result = spawnSync(process.execPath, ['scripts/cloud-cli.js', 'fn', 'deploy', 'dbOperations'], {
  cwd: path.join(root, 'campus_treehole'),
  encoding: 'utf8',
  env: { ...process.env, CLOUDBASE_ENV_ID: '' }
})
assert.equal(result.status, 1)
assert.match(output(result), /CLOUDBASE_ENV_ID is required/)

result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/deploy-cloud-functions.ps1'], {
  cwd: path.join(root, 'campus_treehole'),
  encoding: 'utf8',
  env: { ...process.env, CLOUDBASE_ENV_ID: '' }
})
assert.notEqual(result.status, 0)
assert.match(output(result), /CLOUDBASE_ENV_ID is required/)

console.log('PASS CloudBase safety: credential boundaries, production rejection, and explicit deployment target')
