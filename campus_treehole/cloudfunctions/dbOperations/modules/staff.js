// Express staff capabilities. OpenID is used only inside this module and is
// never included in a response or persisted in staff_accounts/audit records.
const { publicId } = require('../shared/public-data')
const {
  EXPRESS_DEFAULT_CAMPUS_ID
} = require('../domain/express')
const {
  STAFF_PERMISSIONS,
  STAFF_ORDER_PERMISSIONS,
  OWNER_PERMISSIONS,
  normalizePermissions,
  hasStaffPermission
} = require('../domain/staff')

const STAFF_ACCOUNTS = 'staff_accounts'
const AUDIT_LOGS = 'staff_audit_logs'

function createStaffModule({ db, _, helpers = {} }) {
  const {
    getUserForAction,
    checkAdmin,
    makeDeterministicId = (scope, value) => `${scope}_${String(value || '').replace(/[^a-z0-9_-]/gi, '')}`,
    isCollectionNotExistError = () => false
  } = helpers

  const now = () => (typeof db.serverDate === 'function' ? db.serverDate() : new Date())

  async function findUser(identifier) {
    const value = typeof identifier === 'string' ? identifier.trim() : ''
    if (!value) return null
    const fields = ['internalUserId', 'userId', '_id']
    for (const field of fields) {
      const result = await db.collection('users').where({ [field]: value }).limit(1).get()
      if (result.data && result.data[0]) return result.data[0]
    }
    try {
      const result = await db.collection('users').doc(value).get()
      return result && result.data ? result.data : null
    } catch (_) {
      return null
    }
  }

  function userIdOf(user) {
    return user && (user.internalUserId || publicId(user._openid || user._id))
  }

  function sanitizeUser(user) {
    if (!user) return null
    return {
      userId: userIdOf(user),
      nickName: user.nickName || user.nickname || '同学',
      avatarUrl: user.avatarUrl || user.avatar || '/images/avatar_default.png',
      schoolId: user.schoolId || 'guat',
      campusId: user.campusId || EXPRESS_DEFAULT_CAMPUS_ID,
      campusName: user.campusName || user.college || ''
    }
  }

  async function readStaffAccount(userId) {
    try {
      const result = await db.collection(STAFF_ACCOUNTS).where({ userId }).limit(1).get()
      return result.data && result.data[0] ? result.data[0] : null
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  async function getCapabilities(openid) {
    const user = await getUserForAction(openid, { requireActive: true })
    const userId = userIdOf(user)
    const owner = (await checkAdmin(openid)) === true
    const account = owner ? null : await readStaffAccount(userId)
    const activeStaff = !!(account && account.status === 'active')
    if (!owner && !activeStaff) {
      return {
        isStaff: false,
        isOwner: false,
        userId,
        permissions: [],
        campusIds: []
      }
    }
    const permissions = owner ? OWNER_PERMISSIONS.slice() : normalizePermissions(account.permissions)
    return {
      isStaff: true,
      isOwner: owner,
      userId,
      displayName: owner ? (user.nickName || 'Owner') : (account.displayName || user.nickName || '工作人员'),
      permissions,
      campusIds: owner
        ? ['*']
        : Array.from(new Set((Array.isArray(account.campusIds) ? account.campusIds : [user.campusId || EXPRESS_DEFAULT_CAMPUS_ID]).filter(Boolean))),
      staffId: account && account._id ? account._id : '',
      status: owner ? 'active' : account.status
    }
  }

  async function requirePermission(openid, permission, { ownerOnly = false } = {}) {
    const capabilities = await getCapabilities(openid)
    if (!capabilities.isStaff || (ownerOnly && !capabilities.isOwner) || !hasStaffPermission(capabilities, permission)) {
      return { code: -1, statusCode: 403, msg: '无权执行该工作人员操作' }
    }
    return { code: 0, capabilities }
  }

  async function writeAudit({ actorUserId, action, resourceType, resourceId, metadata = {} }) {
    const safeMetadata = {}
    for (const key of ['from', 'to', 'orderCount', 'campusId', 'staffUserId', 'status']) {
      if (metadata[key] !== undefined) safeMetadata[key] = metadata[key]
    }
    await db.collection(AUDIT_LOGS).add({
      data: {
        actorUserId,
        action,
        resourceType,
        resourceId: String(resourceId || ''),
        metadata: safeMetadata,
        createdAt: now()
      }
    })
  }

  async function getMyStaffCapabilities(openid) {
    const capabilities = await getCapabilities(openid)
    return { code: 0, data: capabilities }
  }

  async function ownerResolveCandidate(openid, data = {}) {
    const auth = await requirePermission(openid, STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, { ownerOnly: true })
    if (auth.code !== 0) return auth
    const user = await findUser(data.targetUserId || data.userId)
    if (!user || user.status !== 'active') return { code: -1, statusCode: 404, msg: '找不到可授权的有效用户' }
    return { code: 0, data: sanitizeUser(user) }
  }

  async function ownerAddExpressStaff(openid, data = {}) {
    const auth = await requirePermission(openid, STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, { ownerOnly: true })
    if (auth.code !== 0) return auth
    const user = await findUser(data.targetUserId || data.userId)
    if (!user || user.status !== 'active') return { code: -1, statusCode: 404, msg: '找不到可授权的有效用户' }
    const targetUserId = userIdOf(user)
    const permissions = normalizePermissions(data.permissions && data.permissions.length ? data.permissions : STAFF_ORDER_PERMISSIONS)
      .filter((permission) => STAFF_ORDER_PERMISSIONS.includes(permission))
    const campusIds = Array.from(new Set((Array.isArray(data.campusIds) && data.campusIds.length ? data.campusIds : [user.campusId || EXPRESS_DEFAULT_CAMPUS_ID]).filter(Boolean)))
    const staffId = makeDeterministicId('staff', targetUserId)
    const payload = {
      userId: targetUserId,
      status: 'active',
      permissions,
      campusIds,
      displayName: String(data.displayName || user.nickName || '工作人员').trim().slice(0, 40),
      createdBy: auth.capabilities.userId,
      createdAt: now(),
      updatedAt: now(),
      disabledAt: null
    }
    await db.collection(STAFF_ACCOUNTS).doc(staffId).set({ data: payload })
    await writeAudit({
      actorUserId: auth.capabilities.userId,
      action: 'STAFF_ADDED',
      resourceType: 'staff_account',
      resourceId: staffId,
      metadata: { staffUserId: targetUserId, status: 'active' }
    })
    return { code: 0, data: { staffId, ...sanitizeUser(user), permissions, campusIds } }
  }

  async function findStaff(data = {}) {
    if (data.staffId) {
      const result = await db.collection(STAFF_ACCOUNTS).doc(String(data.staffId)).get()
      return result && result.data ? result.data : null
    }
    return readStaffAccount(String(data.targetUserId || data.userId || ''))
  }

  async function ownerDisableExpressStaff(openid, data = {}) {
    const auth = await requirePermission(openid, STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, { ownerOnly: true })
    if (auth.code !== 0) return auth
    const staff = await findStaff(data)
    if (!staff) return { code: -1, statusCode: 404, msg: '工作人员不存在' }
    await db.collection(STAFF_ACCOUNTS).doc(staff._id).update({ data: { status: 'disabled', disabledAt: now(), updatedAt: now() } })
    await writeAudit({
      actorUserId: auth.capabilities.userId,
      action: 'STAFF_DISABLED',
      resourceType: 'staff_account',
      resourceId: staff._id,
      metadata: { staffUserId: staff.userId, status: 'disabled' }
    })
    return { code: 0, data: { staffId: staff._id, status: 'disabled' } }
  }

  async function ownerUpdateExpressStaffPermissions(openid, data = {}) {
    const auth = await requirePermission(openid, STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, { ownerOnly: true })
    if (auth.code !== 0) return auth
    const staff = await findStaff(data)
    if (!staff) return { code: -1, statusCode: 404, msg: '工作人员不存在' }
    const permissions = normalizePermissions(data.permissions)
      .filter((permission) => STAFF_ORDER_PERMISSIONS.includes(permission))
    await db.collection(STAFF_ACCOUNTS).doc(staff._id).update({ data: { permissions, updatedAt: now() } })
    await writeAudit({ actorUserId: auth.capabilities.userId, action: 'STAFF_PERMISSIONS_UPDATED', resourceType: 'staff_account', resourceId: staff._id, metadata: { staffUserId: staff.userId } })
    return { code: 0, data: { staffId: staff._id, permissions } }
  }

  async function ownerGetExpressStaff(openid) {
    const auth = await requirePermission(openid, STAFF_PERMISSIONS.EXPRESS_STAFF_MANAGE, { ownerOnly: true })
    if (auth.code !== 0) return auth
    const result = await db.collection(STAFF_ACCOUNTS).get()
    const rows = result.data || []
    const users = await Promise.all(rows.map((row) => findUser(row.userId)))
    return {
      code: 0,
      data: rows.map((row, index) => ({
        staffId: row._id,
        userId: row.userId,
        displayName: row.displayName || (users[index] && users[index].nickName) || '工作人员',
        avatarUrl: users[index] && (users[index].avatarUrl || users[index].avatar) || '/images/avatar_default.png',
        campusIds: Array.isArray(row.campusIds) ? row.campusIds : [],
        status: row.status,
        permissions: normalizePermissions(row.permissions),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    }
  }

  return {
    STAFF_ACCOUNTS,
    AUDIT_LOGS,
    getCapabilities,
    requirePermission,
    writeAudit,
    getMyStaffCapabilities,
    ownerResolveExpressStaffCandidate: ownerResolveCandidate,
    ownerResolveCandidate,
    ownerAddExpressStaff,
    ownerDisableExpressStaff,
    ownerUpdateExpressStaffPermissions,
    ownerGetExpressStaff
  }
}

module.exports = createStaffModule
