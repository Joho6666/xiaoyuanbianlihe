const assert = require('assert')
const { createExpress37Fixture } = require('../helpers/express-37-fixture')

async function run() {
  const { express, profile } = await createExpress37Fixture()
  const order = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', deliveryProfileId: profile._id, pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'one', packageCount: 1 }, { pickupPointId: 'cainiao', pickupCode: 'two', packageCount: 1 }, { pickupPointId: 'sf', pickupCode: 'three', packageCount: 1 }], clientRequestId: 'multi-staff' })
  await express.createExpressTestPayment('oid-student', { orderId: order.data._id })
  const rows = await express.staffGetExpressOrders('oid-staff', { campusId: 'guit-hangtian', status: 'WAIT_PICKUP' })
  assert.equal(rows.code, 0)
  assert.equal(rows.data[0].pickupItems.length, 3)
  assert.equal(rows.data[0].totalPackageCount, 3)
  assert.equal(rows.data[0].pickupPointCount, 2)
  assert.equal((await express.staffGetExpressDashboard('oid-staff', { campusId: 'guit-hangtian' })).data.counts.totalPackageCount, 3)
  console.log('PASS Express multi-pickup staff: item payload and dashboard package/item/point counts')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
