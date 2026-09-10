const assert = require('assert')
const createStaffModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/staff')
const createExpressModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')
const { EXPRESS_ORDER_STATUS } = require('../../shared/domain/express')
const { createExpressMock } = require('../helpers/express-mock')

async function run() {
  process.env.TCB_ENV_ID = 'express-test-env'
  process.env.EXPRESS_TEST_PAYMENT_ENV_ID = 'express-test-env'
  process.env.EXPRESS_TEST_PAYMENT_ALLOWED = 'true'
  const users = [
    { _id: 'owner', _openid: 'oid-owner', internalUserId: 'owner-id', role: 'admin', status: 'active', campusId: 'guit-hangtian', nickName: 'Owner' },
    { _id: 'staff', _openid: 'oid-staff', internalUserId: 'staff-id', role: 'user', status: 'active', campusId: 'guit-hangtian', nickName: 'Staff' },
    { _id: 'student', _openid: 'oid-student', internalUserId: 'student-id', role: 'user', status: 'active', campusId: 'guit-hangtian', nickName: 'Student' }
  ]
  const { db, _, cloud, store } = createExpressMock({ users })
  store.staff_accounts = []
  store.staff_audit_logs = []
  store.staff_accounts.push({ _id: 'staff_staff-id', userId: 'staff-id', status: 'active', campusIds: ['guit-hangtian'], permissions: Object.values(STAFF_PERMISSIONS).slice(0, 3), displayName: 'Staff' })
  const getUserForAction = async (openid) => store.users.find((user) => user._openid === openid)
  const staff = createStaffModule({ db, _, helpers: { getUserForAction, checkAdmin: async (openid) => openid === 'oid-owner' } })
  const express = createExpressModule({ db, _, cloud, helpers: { staff, getUserForAction, resolveCampusIdForRead: (value) => value, makeDeterministicId: (scope, value) => `${scope}_${String(value).replace(/[^a-z0-9-]/gi, '')}` } })

  assert.strictEqual((await express.ownerUpdateExpressSettings('oid-owner', { campusId: 'guit-hangtian', acceptingOrders: true, basePriceCents: 300, pickupPoints: [{ id: 'south', name: '菜鸟驿站（南区）' }] })).code, 0)
  const created = await express.createExpressOrder('oid-student', { pickupPointId: 'south', pickupCode: '2-3-4587', packageCount: 2, dormBuilding: '南区6号楼', roomNumber: '613', phone: '13800001234' })
  assert.strictEqual(created.code, 0)
  assert.strictEqual(created.data.paymentStatus, 'UNPAID')
  const orderId = created.data._id
  assert.strictEqual((await express.staffUpdateExpressOrderStatus('oid-staff', { orderId, status: EXPRESS_ORDER_STATUS.DELIVERING })).code, -1)
  assert.strictEqual((await express.createExpressTestPayment('oid-student', { orderId })).code, 0)
  assert.strictEqual((await express.staffUpdateExpressOrderStatus('oid-staff', { orderId, status: EXPRESS_ORDER_STATUS.DELIVERING })).code, 0)
  assert.strictEqual((await express.staffUpdateExpressOrderStatus('oid-staff', { orderId, status: EXPRESS_ORDER_STATUS.COMPLETED })).code, 0)
  assert.strictEqual((await express.staffUpdateExpressOrderStatus('oid-staff', { orderId, status: EXPRESS_ORDER_STATUS.WAIT_PICKUP })).code, -1)
  const otherStaff = { _id: 'other', _openid: 'oid-other', internalUserId: 'other-id', status: 'active', campusId: 'other-campus' }
  store.users.push(otherStaff)
  store.staff_accounts.push({ _id: 'staff_other-id', userId: 'other-id', status: 'active', campusIds: ['other-campus'], permissions: Object.values(STAFF_PERMISSIONS).slice(0, 3) })
  assert.strictEqual((await express.staffGetExpressOrders('oid-other', { campusId: 'guit-hangtian' })).statusCode, 403)
  const own = await express.getMyExpressOrder('oid-student', { orderId })
  assert.strictEqual(own.data.phone, '13800001234')
  assert.strictEqual((await express.getMyExpressOrder('oid-other', { orderId })).statusCode, 404)
  console.log('PASS Express orders: unpaid gate, test payment, lifecycle, ownership and campus isolation')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
