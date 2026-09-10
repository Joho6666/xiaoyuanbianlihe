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

const EXPRESS_PARCEL_SIZE = Object.freeze({
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE'
})

const EXPRESS_DEFAULT_PARCEL_SIZE_PRICING = Object.freeze({
  SMALL: Object.freeze({ enabled: true, priceCents: 100, label: '小件', description: '文件、小袋、轻小包裹' }),
  MEDIUM: Object.freeze({ enabled: true, priceCents: 300, label: '中件', description: '鞋盒、衣物箱、普通纸箱' }),
  LARGE: Object.freeze({ enabled: true, priceCents: 600, label: '大件', description: '较重或体积较大的包裹' })
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
  return source.map((item, index) => {
    const normalized = {
    id: String(item.id || `pickup_item_${index + 1}`),
    pickupPointId: String(item.pickupPointId || '').trim(),
    pickupPointNameSnapshot: String(item.pickupPointNameSnapshot || item.pickupPointName || '').trim(),
    pickupCode: String(item.pickupCode || '').trim(),
    packageCount: Number(item.packageCount) || 0
    }
    if (item.parcelSize !== undefined) normalized.parcelSize = normalizeExpressParcelSize(item.parcelSize)
    if (item.parcelPriceCents !== undefined) normalized.parcelPriceCents = Number.isFinite(Number(item.parcelPriceCents)) ? Number(item.parcelPriceCents) : null
    if (item.parcelSizeMismatch === true) {
      normalized.parcelSizeMismatch = true
      normalized.expectedParcelSize = normalizeExpressParcelSize(item.expectedParcelSize)
      normalized.actualParcelSize = normalizeExpressParcelSize(item.actualParcelSize)
      normalized.mismatchStaffUserId = item.mismatchStaffUserId || null
      normalized.mismatchCheckedAt = item.mismatchCheckedAt || null
    }
    return normalized
  })
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

function normalizeExpressParcelSize(value) {
  return Object.values(EXPRESS_PARCEL_SIZE).includes(value) ? value : null
}

function normalizeExpressParcelSizePricing(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(Object.values(EXPRESS_PARCEL_SIZE).map((size) => {
    const defaults = EXPRESS_DEFAULT_PARCEL_SIZE_PRICING[size]
    const item = source[size] && typeof source[size] === 'object' ? source[size] : {}
    return [size, {
      enabled: item.enabled !== false,
      priceCents: Math.min(10000, Math.max(0, Number.isFinite(Number(item.priceCents)) ? Number(item.priceCents) : defaults.priceCents)),
      label: String(item.label || defaults.label).trim().slice(0, 12),
      description: String(item.description || defaults.description).trim().slice(0, 60)
    }]
  }))
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
  EXPRESS_PARCEL_SIZE,
  EXPRESS_DEFAULT_PARCEL_SIZE_PRICING,
  normalizeExpressParcelSize,
  normalizeExpressParcelSizePricing,
  normalizeExpressDeliveryProfileStatus,
  normalizeExpressPickupItems,
  normalizeLegacyExpressOrder
}
