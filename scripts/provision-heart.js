#!/usr/bin/env node
// Idempotent Heart collection provisioning. It never deletes data.
const { spawnSync } = require('child_process')

const args = process.argv.slice(2)
const envIndex = args.indexOf('--env')
const envId = envIndex >= 0 ? String(args[envIndex + 1] || '').trim() : ''
const apply = args.includes('--apply')
const collections = ['heart_profiles', 'heart_likes', 'heart_matches', 'fate_card_usage', 'fate_card_history', 'heart_events', 'heart_block_fences']
const indexes = [
  'heart_profiles: enabled ASC, schoolId ASC, userId ASC',
  'heart_matches: userIds (array membership)',
  'fate_card_history: userId ASC, createdAt DESC',
  'heart_events: userId ASC, createdAt DESC'
]

if (!envId) {
  console.error('Usage: node scripts/provision-heart.js --env <ENV_ID> [--apply]')
  process.exitCode = 1
  process.exit()
}
if (!apply) {
  console.log(`DRY RUN: would provision ${collections.join(', ')} in ${envId}`)
  console.log('No collection or index was changed. Re-run with --apply to create missing collections.')
  process.exit(0)
}
if (/^xyblh-5gb26qrnf9d30feb$/i.test(envId)) {
  console.error('REFUSED: provisioning production requires a manual CloudBase Console change review.')
  process.exitCode = 1
  process.exit()
}

let collectionCreationFailed = false
for (const collection of collections) {
  console.log(`Ensuring collection: ${collection}`)
  const run = spawnSync('npx', ['-p', '@cloudbase/cli@latest', 'tcb', 'db', 'collection', 'create', collection, '-e', envId], { encoding: 'utf8', shell: process.platform === 'win32' })
  const output = `${run.stdout || ''}${run.stderr || ''}`
  if (run.status === 0 || /already exists|已存在/i.test(output)) continue
  collectionCreationFailed = true
  console.warn(`Collection could not be confirmed automatically: ${collection}`)
  console.warn(output.trim())
}
console.log('\nManual Index Checklist')
indexes.forEach(item => console.log(`- ${item}`))
console.log('Index automation is intentionally not claimed: verify CloudBase CLI/API support, then create the listed indexes in the Console.')
if (collectionCreationFailed) process.exitCode = 1
