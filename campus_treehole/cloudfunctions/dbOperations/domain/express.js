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

function normalizeLegacyExpressOrder(order) {
  if (!order || typeof order !== 'object') return order
  if (order.paymentStatus === EXPRESS_PAYMENT_STATUS.UNPAID && order.orderStatus === 'WAIT_PICKUP') {
    return { ...order, orderStatus: EXPRESS_ORDER_STATUS.WAIT_PAYMENT }
  }
  return order
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
  EXPRESS_STATUS_TRANSITIONS,
  canTransitionExpressOrder,
  normalizeExpressOrderStatus,
  normalizeExpressPaymentStatus,
  normalizeExpressDeliveryProfileStatus,
  normalizeLegacyExpressOrder
}
