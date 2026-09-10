const assert = require('assert')
const { normalizeLegacyExpressOrder } = require('../../shared/domain/express')
const legacyUnpaid = { _id: 'legacy-unpaid', paymentStatus: 'UNPAID', orderStatus: 'WAIT_PICKUP' }
const legacyPaid = { _id: 'legacy-paid', paymentStatus: 'PAID', orderStatus: 'WAIT_PICKUP' }
assert.strictEqual(normalizeLegacyExpressOrder(legacyUnpaid).orderStatus, 'WAIT_PAYMENT')
assert.strictEqual(normalizeLegacyExpressOrder(normalizeLegacyExpressOrder(legacyUnpaid)).orderStatus, 'WAIT_PAYMENT')
assert.strictEqual(normalizeLegacyExpressOrder(legacyPaid).orderStatus, 'WAIT_PICKUP')
console.log('PASS Express migration: legacy unpaid normalization is idempotent and paid orders stay unchanged')
