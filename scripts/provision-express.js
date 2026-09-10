#!/usr/bin/env node
// Idempotent Express collection provisioning. Dry-run is the default and
// this script never deletes documents, collections, or indexes.
const { spawnSync } = require('child_process')
const { isProductionEnv, normalizeEnvId } = require('./cloudbase-target')

const args = process.argv.slice(2)
const envIndex = args.indexOf('--env')
const envId = envIndex >= 0 ? normalizeEnvId(args[envIndex + 1]) : ''
const apply = args.includes('--apply')
const collections = ['express_orders', 'express_settings', 'staff_accounts', 'staff_audit_logs', 'express_exports', 'express_delivery_profiles']
const indexes = [
  'express_orders: userId ASC, createdAt DESC',
  'express_orders: deliveryCampus ASC, orderStatus ASC, createdAt DESC',
  'express_orders: paymentStatus ASC, orderStatus ASC',
  'express_orders: deliveryProfileId ASC, createdAt DESC',
  'express_settings: campusId ASC',
  'staff_accounts: userId ASC, status ASC',
  'staff_audit_logs: actorUserId ASC, createdAt DESC',
  'staff_audit_logs: resourceType ASC, resourceId ASC, createdAt DESC',
  'express_exports: actorUserId ASC, createdAt DESC',
  'express_exports: expiresAt ASC',
  'express_delivery_profiles: ownerUserId ASC, status ASC, updatedAt DESC',
  'express_delivery_profiles: ownerUserId ASC, status ASC, isDefault ASC'
]

if (!envId) {
  console.error('Usage: node scripts/provision-express.js --env <INDEPENDENT_ENV_ID> [--apply]')
  process.exit(1)
}
if (isProductionEnv(envId)) {
  console.error('REFUSED: Express provisioning cannot target the production environment.')
  process.exit(1)
}
if (!apply) {
  console.log(`DRY RUN: would provision ${collections.join(', ')} in ${envId}`)
  console.log('No collection, document, index, or permission was changed.')
  console.log('Re-run with --apply to create missing collections only.')
  console.log('\nManual Index and Permission Checklist')
  indexes.forEach((item) => console.log(`- ${item}`))
  console.log('- Set all Express collections to server-side access only; deny Mini Program client read/write.')
  console.log('- Verify staff_accounts, staff_audit_logs, and express_exports do not expose OpenID or public URLs.')
  console.log('- pickupPoints.aliases is optional display configuration; no OCR collection or express_order_items collection is created.')
  console.log('- Manually verify tmp/express-import/<internalUserId>/<requestId>/ storage access and cleanup behavior in the console.')
  process.exit(0)
}

let failed = false
for (const collection of collections) {
  console.log(`Ensuring collection: ${collection}`)
  const run = spawnSync('npx', ['-p', '@cloudbase/cli@latest', 'tcb', 'db', 'collection', 'create', collection, '-e', envId], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  const output = `${run.stdout || ''}${run.stderr || ''}`
  if (run.status === 0 || /already exists|已存在/i.test(output)) continue
  failed = true
  console.warn(`Collection could not be confirmed automatically: ${collection}`)
  console.warn(output.trim())
}
console.log('\nManual Index and Permission Checklist')
indexes.forEach((item) => console.log(`- ${item}`))
console.log('- Set all Express collections to server-side access only; deny Mini Program client read/write.')
console.log('- Index and permission creation is not claimed by this CLI run; verify in CloudBase Console.')
console.log('- No new OCR collection or express_order_items collection is provisioned; pickup point aliases remain in express_settings.')
console.log('- Verify temporary screenshot path access and delete behavior manually in CloudBase Console.')
if (failed) process.exitCode = 1
