#!/usr/bin/env node
// Explicit, independent-environment deployment verification for dbOperations.
const assert = require('assert')
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { isProductionEnv, normalizeEnvId } = require('../cloudbase-target')

const args = process.argv.slice(2)
const required = args.includes('--required')
const apply = args.includes('--apply')
const envId = normalizeEnvId(process.env.TCB_ENV_ID)
const root = path.resolve(__dirname, '..', '..')
const cloudRoot = path.join(root, 'campus_treehole')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function stop(message, code = required ? 1 : 0) {
  console.log(`${code === 0 ? 'NOT RUN' : 'REFUSED'}: ${message}`)
  process.exitCode = code
}

function runCli(cliArgs) {
  const result = spawnSync(npx, ['-p', '@cloudbase/cli@latest', 'tcb', ...cliArgs], {
    cwd: cloudRoot,
    encoding: 'utf8',
    shell: false
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0) throw new Error(output.trim() || `CloudBase CLI exited ${result.status}`)
  return output
}

if (!envId) {
  stop('Missing TCB_ENV_ID for independent test deployment')
} else if (isProductionEnv(envId)) {
  stop('Production environment is never eligible for automatic deployment verification', 1)
} else if (!apply) {
  console.log('DRY RUN: would deploy dbOperations and invoke its public health endpoint in the independent test environment')
} else {
  let inputPath = ''
  try {
    runCli(['fn', 'deploy', 'dbOperations', '-e', envId, '--force'])
    inputPath = path.join(os.tmpdir(), `dboperations-health-${crypto.randomUUID()}.json`)
    fs.writeFileSync(inputPath, JSON.stringify({ action: 'health' }), 'utf8')
    const output = runCli(['fn', 'invoke', 'dbOperations', '-e', envId, '-d', `@${inputPath}`, '--json'])
    assert.match(output, /"code"\s*:\s*0/)
    assert.match(output, /"service"\s*:\s*"dbOperations"/)
    console.log('PASS: independent test dbOperations deployment and public health invocation completed')
  } catch (error) {
    console.error(`FAIL: independent test dbOperations deployment verification: ${error.message}`)
    process.exitCode = 1
  } finally {
    if (inputPath) {
      try { fs.unlinkSync(inputPath) } catch (_) {}
    }
  }
}
