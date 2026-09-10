const assert = require('assert')
const { createExpress37Fixture } = require('../helpers/express-37-fixture')

async function run() {
  const { express, profile } = await createExpress37Fixture()
  await express.ownerUpdateExpressSettings('oid-owner', { acceptingOrders: true, basePriceCents: 300, pricingMode: 'PER_PACKAGE', baseOrderPriceCents: 100, perPackagePriceCents: 200, extraPickupPointPriceCents: 50, pickupPoints: [{ id: 'cainiao', name: '菜鸟', deliveryCampus: 'south' }, { id: 'sf', name: '顺丰', deliveryCampus: 'south' }], deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼', enabled: true }] }] }] })
  const pickupItems = [{ pickupPointId: 'cainiao', pickupCode: 'a', packageCount: 2 }, { pickupPointId: 'sf', pickupCode: 'b', packageCount: 1 }]
  const quote = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', pickupItems })
  assert.equal(quote.code, 0)
  assert.equal(quote.data.totalPackageCount, 3)
  assert.equal(quote.data.pickupPointCount, 2)
  assert.equal(quote.data.subtotal, 700)
  assert.equal(quote.data.extraPickupPointFee, 50)
  assert.equal(quote.data.totalPriceCents, 750)
  const order = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', deliveryProfileId: profile._id, pickupItems, totalPriceCents: 1, amountCents: 1, clientRequestId: 'multi-price' })
  assert.equal(order.code, 0)
  assert.equal(order.data.amountCents, 750)
  console.log('PASS Express multi-pickup pricing: server quote fields and client amount ignored')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
