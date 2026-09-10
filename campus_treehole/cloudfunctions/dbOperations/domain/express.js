const EXPRESS_DEFAULT_SCHOOL_ID = 'guat'
const EXPRESS_DEFAULT_CAMPUS_ID = 'guit-hangtian'

const EXPRESS_ORDER_STATUS = Object.freeze({
  WAIT_PAYMENT: 'WAIT_PAYMENT',
  WAIT_PICKUP: 'WAIT_PICKUP',
  DELIVERING: 'DELIVERING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
})

const EXPRESS_PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED'
})

const EXPRESS_DELIVERY_PROFILE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
})

const EXPRESS_PICKUP_ITEM_LIMIT = 10
const EXPRESS_PICKUP_ITEM_PACKAGE_LIMIT = 20
const EXPRESS_ORDER_PACKAGE_LIMIT = 30

const EXPRESS_STATUS_TRANSITIONS = Object.freeze({
  WAIT_PAYMENT: [EXPRESS_ORDER_STATUS.CANCELLED],
  WAIT_PICKUP: [EXPRESS_ORDER_STATUS.DELIVERING, EXPRESS_ORDER_STATUS.CANCELLED],
  DELIVERING: [EXPRESS_ORDER_STATUS.COMPLETED, EXPRESS_ORDER_STATUS.CANCELLED],
  COMPLETED: [],
  CANCELLED: []
})

function canTransitionExpressOrder(from, to, { owner = false } = {}) {
  if (!from || !to || from === to) return false
  if (to === EXPRESS_ORDER_STATUS.CANCELLED) return !!owner && from !== EXPRESS_ORDER_STATUS.COMPLETED
  return (EXPRESS_STATUS_TRANSITIONS[from] || []).includes(to) && to !== EXPRESS_ORDER_STATUS.CANCELLED
}

function normalizeExpressOrderStatus(value) {
  return Object.values(EXPRESS_ORDER_STATUS).includes(value) ? value : null
}

function normalizeExpressPickupItems(order) {
  if (!order || typeof order !== 'object') return []
  const source = Array.isArray(order.pickupItems) && order.pickupItems.length
    ? order.pickupItems
    : [{
        id: 'pickup_item_1',
        pickupPointId: order.pickupPointId,
        pickupPointNameSnapshot: order.pickupPointNameSnapshot || order.pickupPointName || '',
        pickupCode: order.pickupCode || '',
        packageCount: order.packageCount
      }]
  return source.map((item, index) => ({
    id: String(item.id || `pickup_item_${index + 1}`),
    pickupPointId: String(item.pickupPointId || '').trim(),
    pickupPointNameSnapshot: String(item.pickupPointNameSnapshot || item.pickupPointName || '').trim(),
    pickupCode: String(item.pickupCode || '').trim(),
    packageCount: Number(item.packageCount) || 0
  }))
}

function normalizeLegacyExpressOrder(order) {
  if (!order || typeof order !== 'object') return order
  const pickupItems = normalizeExpressPickupItems(order)
  const totalPackageCount = pickupItems.reduce((sum, item) => sum + item.packageCount, 0)
  const pickupPointCount = new Set(pickupItems.map((item) => item.pickupPointId).filter(Boolean)).size
  const normalized = {
    ...order,
    pickupItems,
    totalPackageCount: Number(order.totalPackageCount) || totalPackageCount,
    pickupItemCount: Number(order.pickupItemCount) || pickupItems.length,
    pickupPointCount: Number(order.pickupPointCount) || pickupPointCount,
    packageCount: Number(order.packageCount) || totalPackageCount,
    pickupPointId: order.pickupPointId || (pickupItems[0] && pickupItems[0].pickupPointId),
    pickupCode: order.pickupCode || (pickupItems[0] && pickupItems[0].pickupCode),
    pickupPointNameSnapshot: order.pickupPointNameSnapshot || (pickupItems[0] && pickupItems[0].pickupPointNameSnapshot)
  }
  if (order.paymentStatus === EXPRESS_PAYMENT_STATUS.UNPAID && order.orderStatus === 'WAIT_PICKUP') normalized.orderStatus = EXPRESS_ORDER_STATUS.WAIT_PAYMENT
  return normalized
}

function normalizeExpressPaymentStatus(value) {
  return Object.values(EXPRESS_PAYMENT_STATUS).includes(value) ? value : null
}

function normalizeExpressDeliveryProfileStatus(value) {
  return Object.values(EXPRESS_DELIVERY_PROFILE_STATUS).includes(value) ? value : null
}

module.exports = {
  EXPRESS_DEFAULT_SCHOOL_ID,
  EXPRESS_DEFAULT_CAMPUS_ID,
  EXPRESS_ORDER_STATUS,
  EXPRESS_PAYMENT_STATUS,
  EXPRESS_DELIVERY_PROFILE_STATUS,
  EXPRESS_PICKUP_ITEM_LIMIT,
  EXPRESS_PICKUP_ITEM_PACKAGE_LIMIT,
  EXPRESS_ORDER_PACKAGE_LIMIT,
  EXPRESS_STATUS_TRANSITIONS,
  canTransitionExpressOrder,
  normalizeExpressOrderStatus,
  normalizeExpressPaymentStatus,
  normalizeExpressDeliveryProfileStatus,
  normalizeExpressPickupItems,
  normalizeLegacyExpressOrder
}
