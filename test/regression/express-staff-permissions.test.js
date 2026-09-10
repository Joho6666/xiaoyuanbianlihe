const assert = require('assert')
const { STAFF_PERMISSIONS } = require('../../shared/domain/staff')
const { createExpressFixture } = require('../helpers/express-fixture')
async function run() {
  const { express, staff } = createExpressFixture()
  assert.strictEqual((await express.staffGetExpressOrders('oid-student', {})).statusCode, 403)
  assert.strictEqual((await staff.ownerDisableExpressStaff('oid-owner', { staffId: 'staff_staff-id' })).code, 0)
  assert.strictEqual((await express.staffGetExpressOrders('oid-staff', {})).statusCode, 403)
  assert.strictEqual((await staff.requirePermission('oid-staff', STAFF_PERMISSIONS.EXPRESS_ORDER_READ)).statusCode, 403)
  console.log('PASS Express staff permissions: normal user, disabled staff, server-side recheck')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
