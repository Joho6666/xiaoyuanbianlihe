const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')
async function run() {
  const { express } = createExpressFixture()
  await express.ownerUpdateExpressSettings('oid-owner', { acceptingOrders: true, basePriceCents: 300, pickupPoints: [{ id: 'point', name: '驿站' }] })
  const quote = await express.getExpressQuote('oid-student', { pickupPointId: 'point', packageCount: 3 })
  assert.strictEqual(quote.data.totalPriceCents, 900)
  const order = await express.createExpressOrder('oid-student', { clientRequestId: 'quote-order', pickupPointId: 'point', pickupCode: 'A', packageCount: 3, dormBuilding: '6号楼', roomNumber: '613', phone: '13800001234', amountCents: 1 })
  assert.strictEqual(order.data.amountCents, 900)
  console.log('PASS Express pricing: server quote and client amount ignored')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
