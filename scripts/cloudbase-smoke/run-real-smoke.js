// Real Campus smoke: independent CloudBase only, with run-scoped cleanup.
const assert = require('assert')
const crypto = require('crypto')
const { isProductionEnv, normalizeEnvId } = require('../cloudbase-target')

const envId = normalizeEnvId(process.env.TCB_ENV_ID)
const secretId = String(process.env.TCB_SECRET_ID || '').trim()
const secretKey = String(process.env.TCB_SECRET_KEY || '').trim()
const required = process.argv.includes('--required')

function notRun(reason, failure = required) {
  console.log(`NOT RUN: ${reason}`)
  process.exitCode = failure ? 1 : 0
}

if (!envId || !secretId || !secretKey) {
  notRun('Missing Test Environment Credentials')
  process.exit()
}
if (isProductionEnv(envId)) {
  notRun('Production environment is never eligible for automatic smoke writes')
  process.exit()
}

// The smoke runner deliberately consumes the root development dependency.
// Production dbOperations keeps using its independently packaged runtime SDK.
const cloud = require('wx-server-sdk')
const createHeart = require('../../campus_treehole/cloudfunctions/dbOperations/modules/heart')
const createMessages = require('../../campus_treehole/cloudfunctions/dbOperations/modules/messages')
const createContacts = require('../../campus_treehole/cloudfunctions/dbOperations/modules/contacts')
const createSafety = require('../../campus_treehole/cloudfunctions/dbOperations/modules/safety')
const createStaff = require('../../campus_treehole/cloudfunctions/dbOperations/modules/staff')
const createExpress = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')
const { publicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/public-data')
const { makeDeterministicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/id')
const { pairId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/heart')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')

// A valid, tiny JPEG. It is uploaded to exercise the real Storage namespace.
const SMOKE_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64')

cloud.init({ env: envId, secretId, secretKey })
const db = cloud.database()
const _ = db.command
const runId = `campus_smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
const created = new Map()
const smokeUserIds = []
const uploadedFiles = new Set()
function step(number, label) {
  console.log(`[${number}/10] ${label}`)
}
const track = (collection, id) => {
  if (!created.has(collection)) created.set(collection, new Set())
  created.get(collection).add(id)
  return id
}

async function uploadSmokePhoto(userId) {
  const cloudPath = `heart/${userId}/${crypto.randomUUID()}.jpg`
  const result = await cloud.uploadFile({ cloudPath, fileContent: SMOKE_JPEG })
  assert.match(result.fileID, new RegExp(`/heart/${userId}/[^/]+\\.jpg$`))
  uploadedFiles.add(result.fileID)
  return result.fileID
}

async function assertRemovedFromStorage(fileId) {
  const result = await cloud.getTempFileURL({ fileList: [fileId] })
  const entry = (result.fileList || [])[0] || {}
  assert.notEqual(entry.status, 0, 'removed Heart photo must not resolve to a temporary URL')
}

async function cleanup() {
  const failures = []
  for (const [collection, ids] of created) {
    for (const id of ids) {
      try { await db.collection(collection).doc(id).remove() } catch (error) { failures.push(`${collection}/${id}: ${error.message || error}`) }
    }
  }
  for (const userId of smokeUserIds) {
    for (const [collection, field] of [['heart_events', 'userId'], ['fate_card_history', 'userId'], ['fate_card_usage', 'userId'], ['express_orders', 'userId'], ['express_delivery_profiles', 'ownerUserId']]) {
      try {
        const rows = (await db.collection(collection).where({ [field]: userId }).limit(100).get()).data || []
        for (const row of rows) await db.collection(collection).doc(row._id).remove()
      } catch (error) {
        failures.push(`${collection}/${userId}: ${error.message || error}`)
      }
    }
  }
  for (const [collection, field] of [['express_orders', 'smokeRunId'], ['express_exports', 'smokeRunId'], ['express_settings', 'smokeRunId'], ['staff_accounts', 'smokeRunId'], ['express_delivery_profiles', 'smokeRunId']]) {
    try {
      const rows = (await db.collection(collection).where({ [field]: runId }).limit(100).get()).data || []
      for (const row of rows) await db.collection(collection).doc(row._id).remove()
    } catch (error) {
      failures.push(`${collection}/${runId}: ${error.message || error}`)
    }
  }
  for (const actorUserId of smokeUserIds) {
    for (const [collection, field] of [['staff_audit_logs', 'actorUserId']]) {
      try {
        const rows = (await db.collection(collection).where({ [field]: actorUserId }).limit(100).get()).data || []
        for (const row of rows) await db.collection(collection).doc(row._id).remove()
      } catch (error) {
        failures.push(`${collection}/${actorUserId}: ${error.message || error}`)
      }
    }
  }
  if (uploadedFiles.size) {
    try {
      const result = await cloud.deleteFile({ fileList: [...uploadedFiles] })
      const failed = (result.fileList || []).filter(item => item.status !== 0)
      if (failed.length) failures.push(`storage: ${failed.map(item => item.errMsg || item.fileID).join(', ')}`)
    } catch (error) {
      failures.push(`storage: ${error.message || error}`)
    }
  }
  if (failures.length) throw new Error(`Cleanup incomplete for run ${runId}: ${failures.join('; ')}`)
}

async function main() {
  console.log('Real Image Content Security API: NOT RUN (this independent Smoke uses the existing mocked moderator)')
  step(1, 'Creating run-scoped independent-environment identities')
  let clock = Date.UTC(2026, 8, 9, 4)
  const users = {}
  const makeUser = async (name, gender, role = 'user') => {
    const openid = `${runId}_${name}`
    const userId = publicId(openid)
    const user = {
      _id: track('users', `smoke_${name}_${runId}`),
      _openid: openid,
      internalUserId: userId,
      nickName: `Smoke ${name}`,
      role,
      status: 'active',
      // A valid configured campus is required to exercise the Heart feature flag.
      campusId: 'guit-hangtian',
      lastLoginTime: new Date(),
      smokeRunId: runId
    }
    users[openid] = user
    smokeUserIds.push(userId)
    await db.collection('users').doc(user._id).set({ data: user })
    return { ...user, gender }
  }
  const helpers = {
    getUserForAction: async openid => users[openid],
    conversationBlocked: async () => false,
    findAuthorsHiddenByBlockRelation: async () => new Set(),
    checkBannedWords: () => ({ pass: true }),
    wxTextCheck: async () => ({ pass: true }),
    wxImageBatchCheck: async () => ({ pass: true }),
    checkAdmin: async (openid) => !!(users[openid] && users[openid].role === 'admin')
  }
  const contacts = createContacts({
    db,
    _,
    helpers: { getUserForAction: helpers.getUserForAction, conversationBlocked: helpers.conversationBlocked }
  })
  const heart = createHeart({ db, _, cloud, helpers: { ...helpers, createContactGrant: contacts.grantForOpenids }, now: () => clock, random: () => 0 })
  const messages = createMessages({
    db, _, cloud,
    helpers: {
      ...helpers,
      getUsersByOpenids: async () => [],
      checkRateLimit: async () => true,
      wxImageCheck: async () => ({ pass: true }),
      triggerSubscribeNotify: async () => {},
      trimSnippet: value => value,
      safeUserBlocksQuery: async run => run(),
      USER_BLOCKS: 'user_blocks',
      checkAdmin: async () => false,
      contactAllowed: contacts.ensureContact,
      publicId
    }
  })
  const safety = createSafety({
    db, _, cloud,
    helpers: {
      ...helpers,
      getUsersByOpenids: async () => [],
      isCollectionNotExistError: () => false,
      isUserBlocksUnavailableError: () => false,
      checkAdmin: async () => true
    }
  })
  const staff = createStaff({
    db, _,
    helpers: {
      getUserForAction: helpers.getUserForAction,
      checkAdmin: helpers.checkAdmin,
      makeDeterministicId,
      isCollectionNotExistError: () => false
    }
  })
  const express = createExpress({
    db, _, cloud,
    helpers: {
      staff,
      getUserForAction: helpers.getUserForAction,
      resolveCampusIdForRead: value => value,
      makeDeterministicId,
      isCollectionNotExistError: () => false
    }
  })
  const profile = (user, photos) => ({
    enabled: true,
    adultDeclared: true,
    gender: user.gender,
    interestedIn: ['male', 'female', 'other'],
    photos,
    bio: 'CloudBase smoke profile',
    interestIds: ['摄影'],
    lookingFor: '测试',
    grade: '大二',
    allowFateCard: true,
    smokeRunId: runId
  })
  const usersToCreate = []
  const owner = await makeUser('owner', 'other', 'admin')
  const staffUser = await makeUser('staff', 'other', 'user')
  const staffAccountId = makeDeterministicId('staff', staffUser.internalUserId)
  await db.collection('staff_accounts').doc(staffAccountId).set({ data: {
    _id: staffAccountId,
    userId: staffUser.internalUserId,
    status: 'active',
    permissions: [STAFF_PERMISSIONS.EXPRESS_ORDER_READ, STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE, STAFF_PERMISSIONS.EXPRESS_ORDER_EXPORT],
    campusIds: ['guit-hangtian'],
    displayName: 'Smoke Staff',
    createdBy: owner.internalUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    smokeRunId: runId
  } })
  track('staff_accounts', staffAccountId)
  for (const [name, gender] of [['a', 'male'], ['b', 'female'], ['c', 'female'], ['d', 'female'], ['e', 'female'], ['f', 'female'], ['g', 'female']]) {
    usersToCreate.push(await makeUser(name, gender))
  }
  const [a, b, c, d, e, f, g] = usersToCreate
  const photos = new Map()
  step(2, 'Uploading owned Heart photos and saving profiles')
  for (const user of usersToCreate) {
    const fileId = await uploadSmokePhoto(user.internalUserId)
    photos.set(user.internalUserId, fileId)
    const result = await heart.updateHeartProfile(user._openid, profile(user, [fileId]))
    assert.equal(result.code, 0, 'profile save')
    track('heart_profiles', user.internalUserId)
  }

  const foreignPhoto = photos.get(a.internalUserId)
  step(3, 'Checking photo ownership and removed-photo storage cleanup')
  assert.notEqual((await heart.updateHeartProfile(b._openid, profile(b, [foreignPhoto]))).code, 0, 'another user cannot claim a Heart photo')
  const oldBPhoto = photos.get(b.internalUserId)
  const replacementBPhoto = await uploadSmokePhoto(b.internalUserId)
  assert.equal((await heart.updateHeartProfile(b._openid, profile(b, [replacementBPhoto]))).code, 0, 'owned replacement photo saves')
  await assertRemovedFromStorage(oldBPhoto)
  uploadedFiles.delete(oldBPhoto)

  step(4, 'Checking Heart discovery eligibility')
  const discover = await heart.getHeartDiscover(a._openid)
  assert(discover.data.rows.some(row => row.userId === b.internalUserId), 'A discovers B')
  assert.equal((await heart.likeHeartProfile(a._openid, { targetUserId: b.internalUserId })).data.status, 'WAITING')
  assert.equal((await heart.likeHeartProfile(b._openid, { targetUserId: a.internalUserId })).data.status, 'MATCHED')
  track('heart_likes', makeDeterministicId('heartlike', a.internalUserId, b.internalUserId))
  track('heart_likes', makeDeterministicId('heartlike', b.internalUserId, a.internalUserId))
  track('heart_matches', pairId(a.internalUserId, b.internalUserId))
  step(5, 'Checking mutual-like match and Heart chat authorization')
  assert.equal((await heart.startHeartChat(a._openid, { targetUserId: b.internalUserId })).code, 0)
  track('contact_grants', makeDeterministicId('contact', 'HEART', pairId(a.internalUserId, b.internalUserId), ...[a.internalUserId, b.internalUserId].sort()))
  step(6, 'Checking generic message delivery after authorized Heart chat')
  const sent = await messages.sendMessage(a._openid, { targetOpenid: b._openid, type: 'text', content: 'CloudBase smoke hello' })
  assert.equal(sent.code, 0)
  track('messages', sent.data._id)

  step(7, 'Checking Free, Premium Test, and concurrent Fate quotas')
  assert.equal((await heart.drawFateCard(a._openid)).data.remaining, 0, 'Free fate card consumes its only daily draw')
  assert.notEqual((await heart.drawFateCard(a._openid)).code, 0, 'second Free fate draw is rejected')
  const concurrentFree = await Promise.all([heart.drawFateCard(d._openid), heart.drawFateCard(d._openid)])
  assert.equal(concurrentFree.filter(result => result.code === 0).length, 1, 'only one concurrent Free draw succeeds')
  assert.equal((await heart.getFateCardQuota(d._openid)).data.remaining, 0)

  const originalEnv = process.env.APP_ENV
  const originalIds = process.env.HEART_PREMIUM_TEST_USER_IDS
  try {
    process.env.APP_ENV = 'development'
    process.env.HEART_PREMIUM_TEST_USER_IDS = a.internalUserId
    clock += 86400000
    for (const expected of [2, 1, 0]) assert.equal((await heart.drawFateCard(a._openid)).data.remaining, expected, 'Premium Test quota')
    assert.notEqual((await heart.drawFateCard(a._openid)).code, 0, 'fourth Premium Test fate draw is rejected')
  } finally {
    if (originalEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = originalEnv
    if (originalIds === undefined) delete process.env.HEART_PREMIUM_TEST_USER_IDS; else process.env.HEART_PREMIUM_TEST_USER_IDS = originalIds
  }

  step(8, 'Checking Express settings, delivery profiles, order lifecycle, and private export')
  process.env.EXPRESS_TEST_PAYMENT_ALLOWED = 'true'
  process.env.EXPRESS_TEST_PAYMENT_ENV_ID = envId
  const expressSettings = await express.ownerUpdateExpressSettings(owner._openid, {
    campusId: 'guit-hangtian',
    acceptingOrders: true,
    basePriceCents: 300,
    pickupPoints: [{ id: 'south', name: '菜鸟驿站（南区）' }],
    deliveryCampuses: [{ id: 'south', name: '南校区', enabled: true, dormAreas: [{ id: 'tianheyuan', name: '天和苑', enabled: true, buildings: [{ id: 'south-6', name: '6号楼', enabled: true }] }] }],
    notice: 'Smoke-only independent environment',
    smokeRunId: runId
  })
  assert.equal(expressSettings.code, 0)
  track('express_settings', 'guit-hangtian')
  const deliveryProfile = await express.createExpressDeliveryProfile(f._openid, {
    campusId: 'guit-hangtian',
    label: 'Smoke Recipient',
    isSelf: false,
    recipientName: 'Smoke Recipient',
    contactPhone: '13800001234',
    deliveryCampus: 'south',
    dormArea: 'tianheyuan',
    dormBuildingId: 'south-6',
    roomNumber: '613'
  })
  assert.equal(deliveryProfile.code, 0)
  assert.equal(deliveryProfile.data.isDefault, true)
  track('express_delivery_profiles', deliveryProfile.data._id)
  const expressOrder = await express.createExpressOrder(f._openid, {
    pickupPointId: 'south',
    pickupCode: 'smoke-2-3-4587',
    packageCount: 1,
    deliveryProfileId: deliveryProfile.data._id,
    smokeRunId: runId
  })
  assert.equal(expressOrder.code, 0)
  assert.equal(expressOrder.data.recipientNameSnapshot, 'Smoke Recipient')
  assert.equal(expressOrder.data.recipientPhoneSnapshot, '13800001234')
  track('express_orders', expressOrder.data._id)
  assert.notEqual((await express.staffUpdateExpressOrderStatus(staffUser._openid, { orderId: expressOrder.data._id, status: 'DELIVERING' })).code, 0)
  assert.equal((await express.createExpressTestPayment(f._openid, { orderId: expressOrder.data._id })).code, 0)
  assert.equal((await express.staffUpdateExpressOrderStatus(staffUser._openid, { orderId: expressOrder.data._id, status: 'DELIVERING' })).code, 0)
  assert.equal((await express.staffUpdateExpressOrderStatus(staffUser._openid, { orderId: expressOrder.data._id, status: 'COMPLETED' })).code, 0)
  const exported = await express.staffExportExpressOrders(staffUser._openid, { campusId: 'guit-hangtian', smokeRunId: runId })
  assert.equal(exported.code, 0)
  track('express_exports', exported.data.fileId.replace(/^cloud:\/\//, '').split('/').pop().replace(/\.xlsx$/, ''))
  uploadedFiles.add(exported.data.fileId)

  step(9, 'Checking block fences, disabled profiles, and Heart exposure')
  const gDiscover = await heart.getHeartDiscover(g._openid)
  const blockedTarget = gDiscover.data.rows[0]
  assert(blockedTarget, 'G has a candidate to block')
  const targetUser = Object.values(users).find(user => user.internalUserId === blockedTarget.userId)
  assert(targetUser, 'blocked profile has a test user')
  assert.equal((await safety.toggleUserBlock(g._openid, targetUser._openid)).data.blocked, true)
  const blockRows = (await db.collection('user_blocks').where({ blockerOpenid: g._openid, blockedOpenid: targetUser._openid }).limit(5).get()).data || []
  blockRows.forEach(row => track('user_blocks', row._id))
  track('heart_block_fences', pairId(g.internalUserId, blockedTarget.userId))
  assert(!(await heart.getHeartDiscover(g._openid)).data.rows.some(row => row.userId === blockedTarget.userId), 'blocked profile is absent from Discover')
  const gFate = await heart.drawFateCard(g._openid)
  assert.equal(gFate.code, 0)
  assert.notEqual(gFate.data.card.userId, blockedTarget.userId, 'blocked profile is absent from Fate')

  assert.equal((await safety.toggleUserBlock(a._openid, b._openid)).data.blocked, true)
  const matchedBlockRows = (await db.collection('user_blocks').where({ blockerOpenid: a._openid, blockedOpenid: b._openid }).limit(5).get()).data || []
  matchedBlockRows.forEach(row => track('user_blocks', row._id))
  track('heart_block_fences', pairId(a.internalUserId, b.internalUserId))
  assert.equal((await heart.getHeartMatches(a._openid)).data.length, 0)
  assert.notEqual((await heart.startHeartChat(a._openid, { targetUserId: b.internalUserId })).code, 0)

  assert.equal((await heart.disableHeartProfile(c._openid)).data.enabled, false)
  assert(!(await heart.getHeartDiscover(a._openid)).data.rows.some(row => row.userId === c.internalUserId), 'disabled profile is no longer exposed')
}

;(async () => {
  let failure = null
  try {
    await main()
  } catch (error) {
    failure = error
  }
  try {
    step(10, 'Removing only run-scoped database records and Storage objects')
    await cleanup()
  } catch (error) {
    failure = failure || error
    console.error(`FAIL: CloudBase smoke cleanup: ${error.message || error}`)
  }
  if (failure) {
    console.error(`FAIL: CloudBase smoke: ${failure.message || failure}`)
    process.exitCode = 1
    return
  }
  console.log('PASS: real CloudBase Heart storage, transaction, block, and cleanup smoke completed')
})()
