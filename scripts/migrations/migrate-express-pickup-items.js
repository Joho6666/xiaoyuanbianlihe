#!/usr/bin/env node
// Backfill embedded pickupItems and aggregate counters without deleting legacy fields.
// Dry-run is the default and production is never eligible.
const { isProductionEnv, normalizeEnvId } = require('../cloudbase-target')
const { normalizeLegacyExpressOrder } = require('../../shared/domain/express')

const args = process.argv.slice(2)
const envIndex = args.indexOf('--env')
const envId = envIndex >= 0 ? normalizeEnvId(args[envIndex + 1]) : ''
const apply = args.includes('--apply')

if (!envId) {
  console.error('Usage: node scripts/migrations/migrate-express-pickup-items.js --env <INDEPENDENT_ENV_ID> [--apply]')
  process.exitCode = 1
} else if (isProductionEnv(envId)) {
  console.error('REFUSED: Express pickup item migration cannot target the production environment.')
  process.exitCode = 1
} else if (!apply) {
  console.log(`DRY RUN: would backfill pickupItems and aggregate counters in express_orders for ${envId}`)
  console.log('No database writes. Re-run with --apply to write only missing normalized fields.')
} else if (!process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY) {
  console.log('NOT RUN: TCB_SECRET_ID and TCB_SECRET_KEY are required for --apply.')
  process.exitCode = 1
} else {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: envId, secretId: process.env.TCB_SECRET_ID, secretKey: process.env.TCB_SECRET_KEY })
  const db = cloud.database()
  Promise.resolve().then(async () => {
    const rows = (await db.collection('express_orders').limit(1000).get()).data || []
    let updated = 0
    for (const row of rows) {
      const normalized = normalizeLegacyExpressOrder(row)
      const needsUpdate = !Array.isArray(row.pickupItems) || row.totalPackageCount == null || row.pickupItemCount == null || row.pickupPointCount == null
      if (!needsUpdate) continue
      await db.collection('express_orders').doc(row._id).update({ data: { pickupItems: normalized.pickupItems, totalPackageCount: normalized.totalPackageCount, pickupItemCount: normalized.pickupItemCount, pickupPointCount: normalized.pickupPointCount, updatedAt: db.serverDate() } })
      updated += 1
    }
    console.log(`PASS: normalized ${updated} of ${rows.length} express orders; legacy fields preserved`)
  }).catch((error) => { console.error(`FAIL: ${error.message || error}`); process.exitCode = 1 })
}
