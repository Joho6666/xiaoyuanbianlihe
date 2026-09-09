// Real CloudBase smoke: independent environment only, with cleanup on every path.
const assert = require('assert')
const crypto = require('crypto')

const envId = process.env.TCB_ENV_ID || process.env.WX_CLOUD_ENV_ID
const secretId = process.env.TCB_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY
const required = process.argv.includes('--required')
const productionEnv = 'xyblh-5gb26qrnf9d30feb'

function notRun(reason, failure = false) {
  console.log(`NOT RUN: ${reason}`)
  process.exitCode = failure ? 1 : 0
}

if (!envId || !secretId || !secretKey) {
  notRun('Missing Test Environment Credentials', required)
  process.exit()
}
if (envId === productionEnv) {
  notRun('Production environment is never eligible for automatic smoke writes', required)
  process.exit()
}

const cloud = require('../../campus_treehole/cloudfunctions/dbOperations/node_modules/wx-server-sdk')
const createHeart = require('../../campus_treehole/cloudfunctions/dbOperations/modules/heart')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')
const createSafety = require('../../campus_treehole/cloudfunctions/dbOperations/modules/safety')
const { publicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/public-data')

cloud.init({ env: envId, secretId, secretKey })
const db = cloud.database()
const _ = db.command
const runId = `heart_smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
const created = new Map()
const track = (collection, id) => { if (!created.has(collection)) created.set(collection, new Set()); created.get(collection).add(id); return id }
const smokeUserIds = []

async function cleanup() {
  for (const [collection, ids] of created) {
    for (const id of ids) {
      try { await db.collection(collection).doc(id).remove() } catch (_) {}
    }
  }
  for (const userId of smokeUserIds) {
    for (const [collection, field] of [['heart_events', 'userId'], ['fate_card_history', 'userId'], ['fate_card_usage', 'userId']]) {
      try {
        const rows = (await db.collection(collection).where({ [field]: userId }).limit(100).get()).data || []
        for (const row of rows) await db.collection(collection).doc(row._id).remove()
      } catch (_) {}
    }
  }
}

async function main() {
  let clock = Date.UTC(2026, 8, 9, 4)
  const users = {}
  const makeUser = async (name, gender) => {
    const openid = `${runId}_${name}`
    const userId = publicId(openid)
    const user = { _id: track('users', `smoke_${name}_${runId}`), _openid: openid, internalUserId: userId, nickName: `Smoke ${name}`, status: 'active', campusId: 'guit-hangtian', lastLoginTime: new Date() }
    users[openid] = user
    smokeUserIds.push(userId)
    await db.collection('users').doc(user._id).set({ data: user })
    return { ...user, gender }
  }
  const helpers = {
    getUserForAction: async openid => users[openid], conversationBlocked: async () => false,
    findAuthorsHiddenByBlockRelation: async () => new Set(), checkBannedWords: () => ({ pass: true }),
    wxTextCheck: async () => ({ pass: true }), wxImageBatchCheck: async () => ({ pass: true })
  }
  const heart = createHeart({ db, _, cloud, helpers, now: () => clock })
  const messages = createMessages({ db, _, cloud, helpers: { ...helpers, getUsersByOpenids: async () => [], checkRateLimit: async () => true, wxImageCheck: async () => ({ pass: true }), triggerSubscribeNotify: async () => {}, trimSnippet: value => value, safeUserBlocksQuery: async run => run(), USER_BLOCKS: 'user_blocks', checkAdmin: async () => false, publicId } })
  const safety = createSafety({ db, _, cloud, helpers: { ...helpers, getUsersByOpenids: async () => [], isCollectionNotExistError: () => false, isUserBlocksUnavailableError: () => false, checkAdmin: async () => true } })
  const profile = user => ({ enabled: true, adultDeclared: true, gender: user.gender, interestedIn: ['male', 'female', 'other'], photos: [`cloud://${envId}.tcb/heart/${user.internalUserId}/smoke.jpg`], bio: 'CloudBase smoke profile', interestIds: ['摄影'], lookingFor: '测试', grade: '大二', allowFateCard: true })
  const a = await makeUser('a', 'male')
  const b = await makeUser('b', 'female')
  const c = await makeUser('c', 'female')
  const d = await makeUser('d', 'female')
  const e = await makeUser('e', 'female')
  const f = await makeUser('f', 'female')
  const g = await makeUser('g', 'female')
  for (const user of [a, b, c, d, e, f, g]) {
    const result = await heart.updateHeartProfile(user._openid, profile(user))
    assert.equal(result.code, 0, 'profile save')
    track('heart_profiles', user.internalUserId)
  }
  const discover = await heart.getHeartDiscover(a._openid)
  assert(discover.data.rows.some(row => row.userId === b.internalUserId), 'A discovers B')
  assert.equal((await heart.likeHeartProfile(a._openid, { targetUserId: b.internalUserId })).data.status, 'WAITING')
  assert.equal((await heart.likeHeartProfile(b._openid, { targetUserId: a.internalUserId })).data.status, 'MATCHED')
  track('heart_likes', require('../../campus_treehole/cloudfunctions/dbOperations/shared/id').makeDeterministicId('heartlike', a.internalUserId, b.internalUserId))
  track('heart_likes', require('../../campus_treehole/cloudfunctions/dbOperations/shared/id').makeDeterministicId('heartlike', b.internalUserId, a.internalUserId))
  track('heart_matches', require('../../campus_treehole/cloudfunctions/dbOperations/shared/heart').pairId(a.internalUserId, b.internalUserId))
  const chat = await heart.startHeartChat(a._openid, { targetUserId: b.internalUserId })
  assert.equal(chat.code, 0)
  const sent = await messages.sendMessage(a._openid, { targetOpenid: b._openid, type: 'text', content: 'CloudBase smoke hello' })
  assert.equal(sent.code, 0)
  track('messages', sent.data._id)
  const free = await heart.drawFateCard(a._openid)
  assert.equal(free.data.remaining, 0)
  assert.notEqual((await heart.drawFateCard(a._openid)).code, 0)
  const originalEnv = process.env.APP_ENV
  const originalIds = process.env.HEART_PREMIUM_TEST_USER_IDS
  try {
    process.env.APP_ENV = 'development'
    process.env.HEART_PREMIUM_TEST_USER_IDS = a.internalUserId
    clock += 86400000
    for (const expected of [2, 1, 0]) assert.equal((await heart.drawFateCard(a._openid)).data.remaining, expected)
    assert.notEqual((await heart.drawFateCard(a._openid)).code, 0)
  } finally {
    if (originalEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = originalEnv
    if (originalIds === undefined) delete process.env.HEART_PREMIUM_TEST_USER_IDS; else process.env.HEART_PREMIUM_TEST_USER_IDS = originalIds
  }
  assert.equal((await safety.toggleUserBlock(a._openid, b._openid)).data.blocked, true)
  const blockRows = (await db.collection('user_blocks').where({ blockerOpenid: a._openid, blockedOpenid: b._openid }).limit(5).get()).data || []
  blockRows.forEach(row => track('user_blocks', row._id))
  track('heart_block_fences', require('../../campus_treehole/cloudfunctions/dbOperations/shared/heart').pairId(a.internalUserId, b.internalUserId))
  assert.equal((await heart.getHeartMatches(a._openid)).data.length, 0)
  assert.notEqual((await heart.startHeartChat(a._openid, { targetUserId: b.internalUserId })).code, 0)
  assert.equal((await heart.disableHeartProfile(c._openid)).data.enabled, false)
  console.log('PASS: real CloudBase Heart storage/transaction smoke completed; cleanup starting')
}

main().catch(error => { console.error('FAIL: CloudBase smoke', error && error.message ? error.message : error); process.exitCode = 1 }).finally(cleanup)
