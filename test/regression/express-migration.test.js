const assert = require('assert')
const { normalizeLegacyExpressOrder } = require('../../shared/domain/express')
const legacyUnpaid = { _id: 'legacy-unpaid', paymentStatus: 'UNPAID', orderStatus: 'WAIT_PICKUP' }
const legacyPaid = { _id: 'legacy-paid', paymentStatus: 'PAID', orderStatus: 'WAIT_PICKUP' }
const normalizedUnpaid = normalizeLegacyExpressOrder({ ...legacyUnpaid, pickupPointId: 'point', pickupPointName: '驿站', pickupCode: 'A-1', packageCount: 2 })
assert.strictEqual(normalizedUnpaid.orderStatus, 'WAIT_PAYMENT')
assert.deepStrictEqual(normalizedUnpaid.pickupItems, [{ id: 'pickup_item_1', pickupPointId: 'point', pickupPointNameSnapshot: '驿站', pickupCode: 'A-1', packageCount: 2 }])
assert.strictEqual(normalizedUnpaid.totalPackageCount, 2)
assert.strictEqual(normalizedUnpaid.pickupItemCount, 1)
assert.strictEqual(normalizedUnpaid.pickupPointCount, 1)
assert.deepStrictEqual(normalizeLegacyExpressOrder(normalizedUnpaid).pickupItems, normalizedUnpaid.pickupItems)
assert.strictEqual(normalizeLegacyExpressOrder(legacyPaid).orderStatus, 'WAIT_PICKUP')
console.log('PASS Express migration: legacy unpaid normalization is idempotent and paid orders stay unchanged')
