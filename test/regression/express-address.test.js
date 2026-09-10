const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')
async function run() {
  const { express } = createExpressFixture()
  await express.ownerUpdateExpressSettings('oid-owner', { acceptingOrders: true, basePriceCents: 300, pickupPoints: [{ id: 'point', name: '南区驿站' }], deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'area', name: '天和苑', buildings: [{ id: 'b6', name: '6号楼', enabled: true }, { id: 'disabled', name: '停用楼', enabled: false }] }] }] })
  const base = { pickupPointId: 'point', pickupCode: 'A-1', packageCount: 1, roomNumber: '613', phone: '13800001234' }
  assert.strictEqual((await express.createExpressOrder('oid-student', { ...base, deliveryCampus: 'north', dormArea: 'area', dormBuildingId: 'b6' })).code, -1)
  assert.strictEqual((await express.createExpressOrder('oid-student', { ...base, deliveryCampus: 'south', dormArea: 'missing', dormBuildingId: 'b6' })).code, -1)
  assert.strictEqual((await express.createExpressOrder('oid-student', { ...base, deliveryCampus: 'south', dormArea: 'area', dormBuildingId: 'disabled' })).code, -1)
  const ok = await express.createExpressOrder('oid-student', { ...base, clientRequestId: 'address-ok', deliveryCampus: 'south', dormArea: 'area', dormBuildingId: 'b6' })
  assert.strictEqual(ok.data.deliveryCampusNameSnapshot, '南校区')
  assert.strictEqual(ok.data.dormAreaNameSnapshot, '天和苑')
  assert.strictEqual(ok.data.dormBuildingNameSnapshot, '6号楼')
  console.log('PASS Express address: delivery campus, dorm area/building validation and snapshots')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
