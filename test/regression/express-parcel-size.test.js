const assert = require('assert')
const { createExpress37Fixture } = require('../helpers/express-37-fixture')
const { normalizeLegacyExpressOrder } = require('../../shared/domain/express')
const { parsePickupCandidates } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-pickup-parser')

async function run() {
  const fixture = await createExpress37Fixture()
  const { express, profile } = fixture
  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pricingMode: 'PARCEL_SIZE',
    parcelSizePricing: {
      SMALL: { enabled: true, priceCents: 100, label: '小件', description: '文件、小袋、轻小包裹' },
      MEDIUM: { enabled: true, priceCents: 300, label: '中件', description: '鞋盒、衣物箱' },
      LARGE: { enabled: true, priceCents: 600, label: '大件', description: '较重纸箱' }
    },
    pickupPoints: [{ id: 'cainiao', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' }, { id: 'sf', name: '顺丰服务点', deliveryCampus: 'south' }],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼' }] }] }]
  })

  // Individual parcel size pricing assertions
  const quoteSmall = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', deliveryCampus: 'south', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 's-1', parcelSize: 'SMALL', packageCount: 1 }] })
  assert.strictEqual(quoteSmall.code, 0)
  assert.strictEqual(quoteSmall.data.totalPriceCents, 100, 'SMALL 1x must be 100 cents (¥1)')

  const quoteMedium = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', deliveryCampus: 'south', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'm-1', parcelSize: 'MEDIUM', packageCount: 1 }] })
  assert.strictEqual(quoteMedium.code, 0)
  assert.strictEqual(quoteMedium.data.totalPriceCents, 300, 'MEDIUM 1x must be 300 cents (¥3)')

  const quoteLarge = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', deliveryCampus: 'south', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'l-1', parcelSize: 'LARGE', packageCount: 1 }] })
  assert.strictEqual(quoteLarge.code, 0)
  assert.strictEqual(quoteLarge.data.totalPriceCents, 600, 'LARGE 1x must be 600 cents (¥6)')

  const pickupItems = [
    { pickupPointId: 'cainiao', pickupCode: 'small-1', parcelSize: 'SMALL', packageCount: 2 },
    { pickupPointId: 'cainiao', pickupCode: 'medium-1', parcelSize: 'MEDIUM', packageCount: 1 },
    { pickupPointId: 'sf', pickupCode: 'large-1', parcelSize: 'LARGE', packageCount: 1 }
  ]
  const quote = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', deliveryCampus: 'south', pickupItems })
  assert.strictEqual(quote.code, 0)
  assert.strictEqual(quote.data.totalPriceCents, 1100, 'SMALLx2 + MEDIUMx1 + LARGEx1 must be 1100 cents (¥11)')
  assert.deepStrictEqual(quote.data.sizeBreakdown.SMALL, { count: 2, unitPriceCents: 100, subtotalCents: 200 })
  assert.deepStrictEqual(quote.data.sizeBreakdown.MEDIUM, { count: 1, unitPriceCents: 300, subtotalCents: 300 })
  assert.deepStrictEqual(quote.data.sizeBreakdown.LARGE, { count: 1, unitPriceCents: 600, subtotalCents: 600 })
  assert.strictEqual(quote.data.parcelSubtotalCents, 1100)
  assert.strictEqual(quote.data.additionalFeeCents, 0)

  const order = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', deliveryProfileId: profile._id, deliveryCampus: 'south', pickupItems, amountCents: 1, clientPriceCents: 1, clientRequestId: 'parcel-size-order' })
  assert.strictEqual(order.code, 0)
  assert.strictEqual(order.data.amountCents, 1100)
  assert.strictEqual(order.data.pickupItems[0].parcelSize, 'SMALL')

  // Staff verification: Staff can see parcelSize and record mismatch
  await express.createExpressTestPayment('oid-student', { orderId: order.data._id })
  const staffDetail = await express.staffGetExpressOrderDetail('oid-staff', { orderId: order.data._id })
  assert.strictEqual(staffDetail.code, 0)
  assert.strictEqual(staffDetail.data.pickupItems[0].parcelSize, 'SMALL')
  assert.strictEqual(staffDetail.data.pickupItems[1].parcelSize, 'MEDIUM')
  assert.strictEqual(staffDetail.data.pickupItems[2].parcelSize, 'LARGE')

  const mismatchRes = await express.staffRecordExpressParcelMismatch('oid-staff', {
    orderId: order.data._id,
    expectedParcelSize: 'SMALL',
    actualParcelSize: 'LARGE',
    note: '实际为整箱饮料'
  })
  assert.strictEqual(mismatchRes.code, 0)
  assert.strictEqual(mismatchRes.data.parcelSizeMismatch, true)
  assert.strictEqual(mismatchRes.data.actualParcelSize, 'LARGE')
  assert.strictEqual(mismatchRes.data.expectedParcelSize, 'SMALL')

  // Student view reflects mismatch
  const ownOrder = await express.getMyExpressOrder('oid-student', { orderId: order.data._id })
  assert.strictEqual(ownOrder.data.parcelSizeMismatch, true)
  assert.strictEqual(ownOrder.data.actualParcelSize, 'LARGE')

  // Audit log was written
  const mismatchAudit = (fixture.store.staff_audit_logs || []).find((a) => a.action === 'EXPRESS_PARCEL_SIZE_MISMATCH_RECORDED')
  assert.ok(mismatchAudit, 'Staff mismatch audit log must be recorded')
  assert.strictEqual(mismatchAudit.resourceId, order.data._id)

  const invalid = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', deliveryProfileId: profile._id, pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'invalid', parcelSize: 'HUGE', packageCount: 1 }], clientRequestId: 'parcel-invalid' })
  assert.notStrictEqual(invalid.code, 0)

  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pricingMode: 'PARCEL_SIZE',
    parcelSizePricing: { SMALL: { enabled: false, priceCents: 100 }, MEDIUM: { enabled: true, priceCents: 300 }, LARGE: { enabled: true, priceCents: 600 } },
    pickupPoints: [{ id: 'cainiao', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' }],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼' }] }] }]
  })
  const disabled = await express.getExpressQuote('oid-student', { campusId: 'guit-hangtian', deliveryCampus: 'south', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'disabled', parcelSize: 'SMALL', packageCount: 1 }] })
  assert.notStrictEqual(disabled.code, 0)

  const legacy = normalizeLegacyExpressOrder({ _id: 'legacy', amountCents: 900, pickupPointId: 'cainiao', pickupCode: 'legacy', packageCount: 3 })
  assert.strictEqual(legacy.amountCents, 900)
  assert.strictEqual(legacy.pickupItems[0].parcelSize == null, true)
  assert.strictEqual(legacy.pickupItems[0].packageCount, 3)
  assert.strictEqual(parsePickupCandidates('顺丰服务点\n取件码：SF2831')[0].parcelSize, undefined)
  console.log('PASS Express parcel size: 1/3/6 pricing, server recalculation, disabled/invalid guards and legacy compatibility')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
