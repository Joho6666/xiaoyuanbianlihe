#!/usr/bin/env node
// Normalize legacy UNPAID + WAIT_PICKUP orders. Dry-run is the default.
// This script is deliberately environment-gated and never targets production.
const { isProductionEnv, normalizeEnvId } = require('../cloudbase-target')
const { normalizeLegacyExpressOrder } = require('../../shared/domain/express')

const args = process.argv.slice(2)
const envIndex = args.indexOf('--env')
const envId = envIndex >= 0 ? normalizeEnvId(args[envIndex + 1]) : ''
const apply = process.env.CONFIRM_WRITE === 'true' && process.env.DRY_RUN !== 'true'

if (!envId) {
  console.error('Usage: node scripts/migrations/migrate-express-order-status.js --env <INDEPENDENT_ENV_ID>')
  process.exitCode = 1
} else if (isProductionEnv(envId)) {
  console.error('REFUSED: Express order migration cannot target the production environment.')
  process.exitCode = 1
} else {
  console.log(`${apply ? 'WRITE' : 'DRY RUN'}: normalize express_orders UNPAID + WAIT_PICKUP -> WAIT_PAYMENT in ${envId}`)
  if (!apply) {
    console.log('No database writes. Set DRY_RUN=false and CONFIRM_WRITE=true to apply explicitly.')
    process.exit(0)
  }
  const secretId = process.env.TCB_SECRET_ID
  const secretKey = process.env.TCB_SECRET_KEY
  if (!secretId || !secretKey) {
    console.error('NOT RUN: TCB_SECRET_ID and TCB_SECRET_KEY are required for --apply.')
    process.exitCode = 1
  } else {
    const cloud = require('wx-server-sdk')
    cloud.init({ env: envId, secretId, secretKey })
    const db = cloud.database()
    db.collection('express_orders').where({ paymentStatus: 'UNPAID', orderStatus: 'WAIT_PICKUP' }).get().then(async (result) => {
      const rows = result.data || []
      for (const row of rows) {
        const normalized = normalizeLegacyExpressOrder(row)
        await db.collection('express_orders').doc(row._id).update({ data: { orderStatus: normalized.orderStatus, updatedAt: db.serverDate() } })
      }
      console.log(`PASS: normalized ${rows.length} legacy express orders`)
    }).catch((error) => {
      console.error(`FAIL: ${error.message || error}`)
      process.exitCode = 1
    })
  }
}
