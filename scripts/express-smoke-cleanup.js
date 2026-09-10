#!/usr/bin/env node
// Run-scoped cleanup for Express staging smoke data. Never uses an unbounded query.
const { isProductionEnv, normalizeEnvId } = require('./cloudbase-target')
const args = process.argv.slice(2)
const envIndex = args.indexOf('--env')
const runIndex = args.indexOf('--run-id')
const envId = envIndex >= 0 ? normalizeEnvId(args[envIndex + 1]) : ''
const runId = runIndex >= 0 ? String(args[runIndex + 1] || '').trim() : ''

if (!envId || !runId || !/^[-a-zA-Z0-9_]{8,100}$/.test(runId)) {
  console.error('Usage: node scripts/express-smoke-cleanup.js --env <INDEPENDENT_ENV_ID> --run-id <RUN_ID>')
  process.exitCode = 1
} else if (isProductionEnv(envId)) {
  console.error('REFUSED: smoke cleanup cannot target the production environment.')
  process.exitCode = 1
} else if (!process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY) {
  console.log('NOT RUN: TCB_SECRET_ID and TCB_SECRET_KEY are required for staging cleanup.')
} else {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: envId, secretId: process.env.TCB_SECRET_ID, secretKey: process.env.TCB_SECRET_KEY })
  const db = cloud.database()
  const names = ['express_orders', 'express_exports', 'express_settings', 'express_delivery_profiles']
  Promise.resolve().then(async () => {
    let removed = 0
    const exports = await db.collection('express_exports').where({ smokeRunId: runId }).get()
    const files = (exports.data || []).map((row) => row.fileId).filter(Boolean)
    if (files.length) await cloud.deleteFile({ fileList: files })
    for (const name of names) {
      const result = await db.collection(name).where({ smokeRunId: runId }).remove()
      removed += Number(result.stats && result.stats.removed) || 0
    }
    console.log(`PASS: cleaned ${removed} records and ${files.length} files for run ${runId}`)
  }).catch((error) => { console.error(`FAIL: ${error.message || error}`); process.exitCode = 1 })
}
