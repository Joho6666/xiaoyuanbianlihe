const assert = require('assert')
const createStaffModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/staff')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')
const { createExpressMock } = require('../helpers/express-mock')

async function run() {
  const owner = { _id: 'owner-doc', _openid: 'openid-owner', internalUserId: 'owner-public', role: 'admin', status: 'active', nickName: 'Owner', campusId: 'guit-hangtian' }
  const staffUser = { _id: 'staff-doc', _openid: 'openid-staff', internalUserId: 'staff-public', role: 'user', status: 'active', nickName: '工作人员', campusId: 'guit-hangtian' }
  const normal = { _id: 'normal-doc', _openid: 'openid-normal', internalUserId: 'normal-public', role: 'user', status: 'active', nickName: '普通同学', campusId: 'guit-hangtian' }
  const { db, _, store } = createExpressMock({ users: [owner, staffUser, normal] })
  store.staff_accounts = []
  store.staff_audit_logs = []
  store.staff_accounts.push({ _id: 'staff_staff-public', userId: 'staff-public', status: 'active', campusIds: ['guit-hangtian'], permissions: [STAFF_PERMISSIONS.EXPRESS_ORDER_READ, STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE, STAFF_PERMISSIONS.EXPRESS_ORDER_EXPORT], displayName: '工作人员' })
  const staff = createStaffModule({ db, _, helpers: { getUserForAction: async (openid) => store.users.find((user) => user._openid === openid), checkAdmin: async (openid) => openid === 'openid-owner' } })

  const normalCaps = await staff.getMyStaffCapabilities('openid-normal')
  assert.strictEqual(normalCaps.data.isStaff, false)
  assert.strictEqual((await staff.requirePermission('openid-normal', STAFF_PERMISSIONS.EXPRESS_ORDER_READ)).statusCode, 403)
  const staffCaps = await staff.getMyStaffCapabilities('openid-staff')
  assert.strictEqual(staffCaps.data.isStaff, true)
  assert.strictEqual(staffCaps.data.isOwner, false)
  assert.strictEqual((await staff.requirePermission('openid-staff', STAFF_PERMISSIONS.EXPRESS_PERMISSIONS_MANAGE || STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE)).statusCode, 403)
  const ownerCaps = await staff.getMyStaffCapabilities('openid-owner')
  assert.strictEqual(ownerCaps.data.isOwner, true)
  assert.ok(ownerCaps.data.permissions.includes(STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE))

  const added = await staff.ownerAddExpressStaff('openid-owner', { targetUserId: 'normal-public' })
  assert.strictEqual(added.code, 0)
  const elevated = await staff.ownerUpdateExpressStaffPermissions('openid-owner', { staffId: added.data.staffId, permissions: [STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, STAFF_PERMISSIONS.EXPRESS_ORDER_READ] })
  assert.deepStrictEqual(elevated.data.permissions, [STAFF_PERMISSIONS.EXPRESS_ORDER_READ])
  assert.strictEqual(store.staff_accounts.length, 2)
  assert.strictEqual(store.staff_accounts[1]._openid, undefined)
  assert.strictEqual((await staff.ownerDisableExpressStaff('openid-owner', { staffId: added.data.staffId })).data.status, 'disabled')
  assert.strictEqual((await staff.getMyStaffCapabilities('openid-normal')).data.isStaff, false)
  assert.strictEqual((await staff.ownerAddExpressStaff('openid-staff', { targetUserId: 'normal-public' })).statusCode, 403)
  assert.strictEqual((await staff.ownerUpdateExpressStaffPermissions('openid-staff', { staffId: 'staff_staff-public', permissions: [STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE] })).statusCode, 403)
  assert.ok(store.staff_audit_logs.every((row) => !JSON.stringify(row).includes('openid-')))
  console.log('PASS Staff permissions: normal hidden, server-side Staff/Owner matrix, disable and audit redaction')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
