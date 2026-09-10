// Express staff authorization is shared by the Mini Program and dbOperations.
const STAFF_PERMISSIONS = Object.freeze({
  EXPRESS_ORDER_READ: 'express.orders.read',
  EXPRESS_ORDER_UPDATE: 'express.orders.update',
  EXPRESS_ORDER_EXPORT: 'express.orders.export',
  EXPRESS_SETTINGS_MANAGE: 'express.settings.manage',
  EXPRESS_STAFF_MANAGE: 'express.staff.manage'
})

const STAFF_ORDER_PERMISSIONS = Object.freeze([
  STAFF_PERMISSIONS.EXPRESS_ORDER_READ,
  STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE,
  STAFF_PERMISSIONS.EXPRESS_ORDER_EXPORT
])

const OWNER_PERMISSIONS = Object.freeze([
  ...STAFF_ORDER_PERMISSIONS,
  STAFF_PERMISSIONS.EXPRESS_SETTINGS_MANAGE,
  STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE
])

function normalizePermissions(values) {
  const allowed = new Set(Object.values(STAFF_PERMISSIONS))
  return Array.from(new Set((Array.isArray(values) ? values : []).filter((value) => allowed.has(value))))
}

function hasStaffPermission(capabilities, permission) {
  return !!(capabilities && Array.isArray(capabilities.permissions) && capabilities.permissions.includes(permission))
}

module.exports = {
  STAFF_PERMISSIONS,
  STAFF_ORDER_PERMISSIONS,
  OWNER_PERMISSIONS,
  normalizePermissions,
  hasStaffPermission
}
