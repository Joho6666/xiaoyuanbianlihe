const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')

async function setup() {
  const fixture = createExpressFixture()
  const { express } = fixture
  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pricingMode: 'PER_PACKAGE',
    baseOrderPriceCents: 0,
    perPackagePriceCents: 300,
    extraPickupPointPriceCents: 0,
    pickupPoints: [
      { id: 'cainiao', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' },
      { id: 'sf', name: '顺丰服务点', deliveryCampus: 'south' },
      { id: 'jd', name: '京东派配送点', deliveryCampus: 'south' },
      { id: 'north', name: '北区快递点', deliveryCampus: 'north' },
      { id: 'disabled', name: '停用点', deliveryCampus: 'south', enabled: false }
    ],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼', enabled: true }] }] }]
  })
  const profile = await express.createExpressDeliveryProfile('oid-student', { campusId: 'guit-hangtian', label: '我的宿舍', isSelf: true, recipientName: 'Student', contactPhone: '13800001234', deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '613' })
  return { ...fixture, profile: profile.data }
}

async function run() {
  const { express, profile } = await setup()
  const quote = await express.getExpressQuote('oid-student', {
    campusId: 'guit-hangtian',
    pickupItems: [
      { pickupPointId: 'cainiao', pickupCode: '2-3-4587', packageCount: 1 },
      { pickupPointId: 'cainiao', pickupCode: '4-1-6532', packageCount: 1 },
      { pickupPointId: 'sf', pickupCode: 'SF2831', packageCount: 1 }
    ]
  })
  assert.equal(quote.code, 0)
  assert.deepStrictEqual({ totalPackageCount: quote.data.totalPackageCount, pickupItemCount: quote.data.pickupItemCount, pickupPointCount: quote.data.pickupPointCount }, { totalPackageCount: 3, pickupItemCount: 3, pickupPointCount: 2 })
  assert.equal(quote.data.totalPriceCents, 900)

  const orderData = {
    campusId: 'guit-hangtian',
    deliveryProfileId: profile._id,
    pickupItems: [
      { id: 'client-one', pickupPointId: 'cainiao', pickupPointNameSnapshot: '假的快递站', pickupCode: '2-3-4587', packageCount: 1 },
      { id: 'client-two', pickupPointId: 'cainiao', pickupCode: '4-1-6532', packageCount: 1 },
      { id: 'client-three', pickupPointId: 'sf', pickupCode: 'SF2831', packageCount: 1 }
    ],
    amountCents: 1,
    clientRequestId: 'multi-pickup-order'
  }
  const order = await express.createExpressOrder('oid-student', orderData)
  assert.equal(order.code, 0)
  assert.equal(order.data.pickupItems.length, 3)
  assert.equal(order.data.pickupItems[0].pickupPointNameSnapshot, '菜鸟驿站（南校区）')
  assert.equal(order.data.totalPackageCount, 3)
  assert.equal(order.data.pickupPointCount, 2)
  assert.equal(order.data.amountCents, 900)

  const duplicate = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'duplicate-item', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'same', packageCount: 1 }, { pickupPointId: 'cainiao', pickupCode: 'SAME', packageCount: 1 }] })
  assert.equal(duplicate.code, -1)
  const empty = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'empty-items', pickupItems: [] })
  assert.equal(empty.code, -1)
  const disabled = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'disabled-point', pickupItems: [{ pickupPointId: 'disabled', pickupCode: 'x', packageCount: 1 }] })
  assert.equal(disabled.code, -1)
  const mismatch = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'campus-mismatch', pickupItems: [{ pickupPointId: 'north', pickupCode: 'x', packageCount: 1 }], deliveryProfileId: profile._id })
  assert.equal(mismatch.code, -1)

  const tooMany = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'too-many-items', pickupItems: Array.from({ length: 11 }, (_, index) => ({ pickupPointId: 'cainiao', pickupCode: `code-${index}`, packageCount: 1 })) })
  assert.equal(tooMany.code, -1)
  const tooManyPackages = await express.createExpressOrder('oid-student', { ...orderData, clientRequestId: 'too-many-packages', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'x', packageCount: 20 }, { pickupPointId: 'sf', pickupCode: 'y', packageCount: 11 }] })
  assert.equal(tooManyPackages.code, -1)

  const retry = await express.createExpressOrder('oid-student', orderData)
  assert.equal(retry.code, 0)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.data._id, order.data._id)

  const legacy = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', pickupPointId: 'cainiao', pickupCode: 'legacy', packageCount: 2, deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '613', phone: '13800001234', clientRequestId: 'legacy-single-item' })
  assert.equal(legacy.code, 0)
  assert.equal(legacy.data.pickupItems.length, 1)
  assert.equal(legacy.data.totalPackageCount, 2)

  console.log('PASS Express multi-pickup: grouped items, limits, server snapshots, idempotency and legacy API')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
