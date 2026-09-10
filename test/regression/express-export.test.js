const assert = require('assert')
const ExcelJS = require('exceljs')
const createStaffModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/staff')
const createExpressModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')
const { createExpressMock } = require('../helpers/express-mock')

async function run() {
  process.env.TCB_ENV_ID = 'express-export-test'
  process.env.EXPRESS_TEST_PAYMENT_ENV_ID = 'express-export-test'
  process.env.EXPRESS_TEST_PAYMENT_ALLOWED = 'true'
  const users = [
    { _id: 'owner', _openid: 'oid-owner', internalUserId: 'owner-id', role: 'admin', status: 'active', campusId: 'guit-hangtian' },
    { _id: 'staff', _openid: 'oid-staff', internalUserId: 'staff-id', role: 'user', status: 'active', campusId: 'guit-hangtian' },
    { _id: 'student', _openid: 'oid-student', internalUserId: 'student-id', role: 'user', status: 'active', campusId: 'guit-hangtian' }
  ]
  const { db, _, cloud, store } = createExpressMock({ users })
  store.staff_accounts = []
  store.staff_audit_logs = []
  store.staff_accounts.push({ _id: 'staff_staff-id', userId: 'staff-id', status: 'active', campusIds: ['guit-hangtian'], permissions: Object.values(STAFF_PERMISSIONS).slice(0, 3) })
  const getUserForAction = async (openid) => store.users.find((user) => user._openid === openid)
  const staff = createStaffModule({ db, _, helpers: { getUserForAction, checkAdmin: async (openid) => openid === 'oid-owner' } })
  const express = createExpressModule({ db, _, cloud, helpers: { staff, getUserForAction, resolveCampusIdForRead: (value) => value, makeDeterministicId: (scope, value) => `${scope}_${String(value).replace(/[^a-z0-9-]/gi, '')}` } })
  await express.ownerUpdateExpressSettings('oid-owner', { acceptingOrders: true, basePriceCents: 300, pickupPoints: [{ id: 'south', name: '南区驿站' }] })
  const order = await express.createExpressOrder('oid-student', { pickupPointId: 'south', pickupCode: '9-9-0001', packageCount: 1, dormBuilding: '南区6号楼', roomNumber: '613', phone: '13800001234', note: '门口联系' })
  await express.createExpressTestPayment('oid-student', { orderId: order.data._id })
  const exported = await express.staffExportExpressOrders('oid-staff', { status: 'WAIT_PICKUP' })
  assert.strictEqual(exported.code, 0)
  assert.match(cloud.uploads[0].cloudPath, /^exports\/express\/\d{4}-\d{2}-\d{2}\/[a-f0-9]+\.xlsx$/)
  assert.strictEqual(cloud.uploads[0].cloudPath.includes('openid'), false)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(cloud.uploads[0].fileContent)
  assert.deepStrictEqual(workbook.worksheets.map((sheet) => sheet.name), ['取件清单', '配送清单'])
  assert.strictEqual(workbook.getWorksheet('取件清单').getRow(2).getCell(3).value, '9-9-0001')
  assert.strictEqual(workbook.getWorksheet('配送清单').getRow(2).getCell(6).value, '未填写')
  assert.strictEqual(workbook.getWorksheet('配送清单').getRow(2).getCell(7).value, '13800001234')
  assert.strictEqual(workbook.getWorksheet('配送清单').getRow(2).getCell(2).value, '南校区')
  assert.strictEqual(workbook.getWorksheet('配送清单').views[0].state, 'frozen')
  assert.ok(store.staff_audit_logs.every((row) => !JSON.stringify(row).includes('13800001234') && !JSON.stringify(row).includes('openid')))
  assert.strictEqual((await express.staffExportExpressOrders('oid-staff', { campusId: 'other-campus' })).statusCode, 403)
  console.log('PASS Express export: private path, two sheets, sorting/filter, cross-campus and audit redaction')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
