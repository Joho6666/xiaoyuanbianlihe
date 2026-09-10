// Express student orders, staff fulfillment, and owner settings.
// Sensitive data stays behind dbOperations; only this module resolves OpenID.
const crypto = require('crypto')
const ExcelJS = require('exceljs')
const { publicId } = require('../shared/public-data')
const {
  EXPRESS_DEFAULT_SCHOOL_ID,
  EXPRESS_DEFAULT_CAMPUS_ID,
  EXPRESS_ORDER_STATUS,
  EXPRESS_PAYMENT_STATUS,
  canTransitionExpressOrder
} = require('../domain/express')
const { STAFF_PERMISSIONS } = require('../domain/staff')

const ORDERS = 'express_orders'
const SETTINGS = 'express_settings'
const EXPORTS = 'express_exports'

function createExpressModule({ db, _, cloud, helpers = {} }) {
  const {
    staff,
    getUserForAction,
    resolveCampusIdForRead = (value) => (typeof value === 'string' ? value.trim() : null),
    makeDeterministicId = (scope, value) => `${scope}_${String(value || '').replace(/[^a-z0-9_-]/gi, '')}`,
    isCollectionNotExistError = () => false
  } = helpers

  const now = () => (typeof db.serverDate === 'function' ? db.serverDate() : new Date())
  const testPaymentEnabled = () => process.env.EXPRESS_TEST_PAYMENT_ALLOWED === 'true' &&
    !!process.env.EXPRESS_TEST_PAYMENT_ENV_ID &&
    !!process.env.TCB_ENV_ID &&
    process.env.EXPRESS_TEST_PAYMENT_ENV_ID === process.env.TCB_ENV_ID

  function fail(message, statusCode = 400) {
    return { code: -1, statusCode, msg: message }
  }

  async function readSettings(campusId) {
    try {
      const result = await db.collection(SETTINGS).doc(campusId).get()
      return result && result.data ? result.data : null
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  function publicSettings(settings, campusId) {
    const row = settings || {}
    const points = Array.isArray(row.pickupPoints) ? row.pickupPoints.map((point) => ({
      id: point.id,
      name: point.name,
      address: point.address || '',
      openingHours: point.openingHours || ''
    })) : []
    return {
      campusId,
      schoolId: row.schoolId || EXPRESS_DEFAULT_SCHOOL_ID,
      acceptingOrders: row.acceptingOrders === true,
      cutoffTime: row.cutoffTime || '',
      deliveryWindow: row.deliveryWindow || '',
      basePriceCents: Number(row.basePriceCents) || 0,
      pickupPoints: points,
      notice: row.notice || '',
      testPaymentAvailable: testPaymentEnabled()
    }
  }

  function userIdOf(user) {
    return user && (user.internalUserId || publicId(user._openid || user._id))
  }

  function resolveCampus(user, requested) {
    const requestedCampus = resolveCampusIdForRead(requested || (user && user.campusId))
    return requestedCampus || (user && user.campusId) || EXPRESS_DEFAULT_CAMPUS_ID
  }

  async function getServiceConfig(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const campusId = resolveCampus(user, data.campusId)
    const settings = await readSettings(campusId)
    return { code: 0, data: publicSettings(settings, campusId) }
  }

  async function readOrder(orderId) {
    if (!orderId) return null
    const result = await db.collection(ORDERS).doc(String(orderId)).get()
    return result && result.data ? result.data : null
  }

  function publicOwnOrder(order) {
    if (!order) return null
    return {
      _id: order._id,
      orderNo: order.orderNo,
      campusId: order.campusId,
      pickupPointId: order.pickupPointId,
      pickupPointName: order.pickupPointName,
      packageCount: order.packageCount,
      dormBuilding: order.dormBuilding,
      roomNumber: order.roomNumber,
      phone: order.phone,
      note: order.note || '',
      amountCents: order.amountCents,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt || null,
      completedAt: order.completedAt || null
    }
  }

  function staffOrder(order) {
    if (!order) return null
    return {
      _id: order._id,
      orderNo: order.orderNo,
      campusId: order.campusId,
      pickupPointId: order.pickupPointId,
      pickupPointName: order.pickupPointName,
      pickupCode: order.pickupCode,
      packageCount: order.packageCount,
      dormBuilding: order.dormBuilding,
      roomNumber: order.roomNumber,
      phone: order.phone,
      note: order.note || '',
      amountCents: order.amountCents,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      userId: order.userId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt || null,
      completedAt: order.completedAt || null
    }
  }

  async function createExpressOrder(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const campusId = resolveCampus(user, data.campusId)
    if (campusId !== (user.campusId || campusId)) return fail('只能为当前校区下单', 403)
    const settings = await readSettings(campusId)
    if (!settings || settings.acceptingOrders !== true) return fail('当前校区暂未开放快递代拿')
    const point = (settings.pickupPoints || []).find((item) => item.id === data.pickupPointId)
    if (!point) return fail('请选择有效的快递点')
    const pickupCode = String(data.pickupCode || '').trim()
    const packageCount = Number(data.packageCount)
    const dormBuilding = String(data.dormBuilding || '').trim()
    const roomNumber = String(data.roomNumber || '').trim()
    const phone = String(data.phone || '').trim()
    if (!pickupCode || pickupCode.length > 40) return fail('请填写有效取件码')
    if (!Number.isInteger(packageCount) || packageCount < 1 || packageCount > 20) return fail('包裹数量需为 1-20 件')
    if (!dormBuilding || dormBuilding.length > 40 || !roomNumber || roomNumber.length > 20) return fail('请填写宿舍楼和房间号')
    if (!/^1\d{10}$/.test(phone)) return fail('请填写有效手机号')
    const orderNo = `EXP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    const orderId = makeDeterministicId('express_order', `${userIdOf(user)}:${orderNo}`)
    const amountCents = Math.max(0, Number(settings.basePriceCents) || 0) * packageCount
    const order = {
      _id: orderId,
      orderNo,
      userId: userIdOf(user),
      schoolId: settings.schoolId || EXPRESS_DEFAULT_SCHOOL_ID,
      campusId,
      pickupPointId: point.id,
      pickupPointName: point.name,
      pickupCode,
      packageCount,
      dormBuilding,
      roomNumber,
      phone,
      note: String(data.note || '').trim().slice(0, 100),
      amountCents,
      paymentStatus: EXPRESS_PAYMENT_STATUS.UNPAID,
      orderStatus: EXPRESS_ORDER_STATUS.WAIT_PICKUP,
      createdAt: now(),
      updatedAt: now(),
      paidAt: null,
      completedAt: null,
      updatedByUserId: null,
      smokeRunId: data.smokeRunId || null
    }
    await db.collection(ORDERS).doc(orderId).set({ data: order })
    return { code: 0, data: publicOwnOrder(order) }
  }

  async function getMyExpressOrders(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const userId = userIdOf(user)
    const result = await db.collection(ORDERS).where({ userId }).orderBy('createdAt', 'desc').limit(Math.min(50, Math.max(1, Number(data.pageSize) || 20))).get()
    return { code: 0, data: (result.data || []).map(publicOwnOrder) }
  }

  async function getMyExpressOrder(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const order = await readOrder(data.orderId)
    if (!order || order.userId !== userIdOf(user)) return fail('订单不存在', 404)
    return { code: 0, data: publicOwnOrder(order) }
  }

  async function createExpressTestPayment(openid, data = {}) {
    if (!testPaymentEnabled()) return fail('测试支付仅在独立测试环境开启', 403)
    const user = await getUserForAction(openid, { requireActive: true })
    const order = await readOrder(data.orderId)
    if (!order || order.userId !== userIdOf(user)) return fail('订单不存在', 404)
    if (order.paymentStatus !== EXPRESS_PAYMENT_STATUS.UNPAID || order.orderStatus !== EXPRESS_ORDER_STATUS.WAIT_PICKUP) return fail('订单当前不可支付')
    const patch = { paymentStatus: EXPRESS_PAYMENT_STATUS.PAID, paidAt: now(), updatedAt: now() }
    await db.collection(ORDERS).doc(order._id).update({ data: patch })
    return { code: 0, data: publicOwnOrder({ ...order, ...patch }) }
  }

  async function scopeFor(capabilities, requestedCampus) {
    const campusId = resolveCampusIdForRead(requestedCampus || EXPRESS_DEFAULT_CAMPUS_ID) || EXPRESS_DEFAULT_CAMPUS_ID
    if (capabilities.isOwner || capabilities.campusIds.includes('*')) return campusId
    return capabilities.campusIds.includes(campusId) ? campusId : null
  }

  async function requireStaff(openid, permission, data = {}) {
    const auth = await staff.requirePermission(openid, permission)
    if (auth.code !== 0) return auth
    const campusId = await scopeFor(auth.capabilities, data.campusId)
    if (!campusId) return fail('无权访问该校区订单', 403)
    return { code: 0, capabilities: auth.capabilities, campusId }
  }

  async function listScopedOrders(campusId, data = {}) {
    const result = await db.collection(ORDERS).where({ campusId }).orderBy('createdAt', 'desc').limit(200).get()
    let rows = result.data || []
    if (data.status && Object.values(EXPRESS_ORDER_STATUS).includes(data.status)) rows = rows.filter((row) => row.orderStatus === data.status)
    if (data.pickupPointId) rows = rows.filter((row) => row.pickupPointId === data.pickupPointId)
    if (data.paymentStatus) rows = rows.filter((row) => row.paymentStatus === data.paymentStatus)
    const keyword = String(data.keyword || '').trim().toLowerCase()
    if (keyword) rows = rows.filter((row) => [row.orderNo, row.pickupCode, row.phone, row.roomNumber].some((value) => String(value || '').toLowerCase().includes(keyword)))
    return rows
  }

  async function staffGetExpressDashboard(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_READ, data)
    if (auth.code !== 0) return auth
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const rows = (await listScopedOrders(auth.campusId, data)).filter((row) => row.paymentStatus === EXPRESS_PAYMENT_STATUS.PAID && (!row.createdAt || new Date(row.createdAt).getTime() >= dayStart.getTime()))
    const counts = { all: rows.length, waitPickup: 0, delivering: 0, completed: 0, cancelled: 0 }
    rows.forEach((row) => {
      if (row.orderStatus === EXPRESS_ORDER_STATUS.WAIT_PICKUP) counts.waitPickup++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.DELIVERING) counts.delivering++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.COMPLETED) counts.completed++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.CANCELLED) counts.cancelled++
    })
    return { code: 0, data: { campusId: auth.campusId, counts, acceptingOrders: (await readSettings(auth.campusId))?.acceptingOrders === true } }
  }

  async function staffGetExpressOrders(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_READ, data)
    if (auth.code !== 0) return auth
    const rows = await listScopedOrders(auth.campusId, data)
    return { code: 0, data: rows.filter((row) => row.paymentStatus === EXPRESS_PAYMENT_STATUS.PAID).map(staffOrder) }
  }

  async function staffGetExpressOrderDetail(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_READ, data)
    if (auth.code !== 0) return auth
    const order = await readOrder(data.orderId)
    if (!order || order.campusId !== auth.campusId) return fail('订单不存在', 404)
    return { code: 0, data: staffOrder(order) }
  }

  async function staffUpdateExpressOrderStatus(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE, data)
    if (auth.code !== 0) return auth
    const order = await readOrder(data.orderId)
    if (!order || order.campusId !== auth.campusId) return fail('订单不存在', 404)
    if (order.paymentStatus !== EXPRESS_PAYMENT_STATUS.PAID && data.status !== EXPRESS_ORDER_STATUS.CANCELLED) return fail('订单尚未支付，不能进入履约流程')
    const owner = auth.capabilities.isOwner === true
    if (!canTransitionExpressOrder(order.orderStatus, data.status, { owner })) return fail('订单状态不能这样变更')
    const patch = { orderStatus: data.status, updatedAt: now(), updatedByUserId: auth.capabilities.userId }
    if (data.status === EXPRESS_ORDER_STATUS.COMPLETED) patch.completedAt = now()
    await db.collection(ORDERS).doc(order._id).update({ data: patch })
    await staff.writeAudit({ actorUserId: auth.capabilities.userId, action: 'EXPRESS_ORDER_STATUS_CHANGED', resourceType: 'express_order', resourceId: order._id, metadata: { from: order.orderStatus, to: data.status, campusId: order.campusId, status: data.status } })
    return { code: 0, data: staffOrder({ ...order, ...patch }) }
  }

  async function staffBatchUpdateExpressOrderStatus(openid, data = {}) {
    const ids = Array.isArray(data.orderIds) ? Array.from(new Set(data.orderIds.map(String))).slice(0, 50) : []
    if (!ids.length) return fail('请选择订单')
    const results = []
    for (const orderId of ids) {
      results.push({ orderId, result: await staffUpdateExpressOrderStatus(openid, { ...data, orderId }) })
    }
    const failed = results.filter((item) => item.result.code !== 0)
    return { code: failed.length ? -1 : 0, data: { results }, msg: failed.length ? '部分订单未更新' : '订单状态已更新' }
  }

  async function pruneExpiredExports() {
    try {
      const result = await db.collection(EXPORTS).get()
      const expired = (result.data || []).filter((row) => row.expiresAt && new Date(row.expiresAt).getTime() < Date.now())
      for (const row of expired) {
        if (row.fileId && cloud && typeof cloud.deleteFile === 'function') await cloud.deleteFile({ fileList: [row.fileId] })
        await db.collection(EXPORTS).doc(row._id).remove()
      }
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
    }
  }

  function sortForExport(rows) {
    const by = (a, b) => String(a || '').localeCompare(String(b || ''), 'zh-CN')
    const pickup = rows.slice().sort((a, b) => by(a.pickupPointName, b.pickupPointName) || by(a.pickupCode, b.pickupCode))
    const delivery = rows.slice().sort((a, b) => by(a.dormBuilding, b.dormBuilding) || by(a.roomNumber, b.roomNumber))
    return { pickup, delivery }
  }

  async function staffExportExpressOrders(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_EXPORT, data)
    if (auth.code !== 0) return auth
    const rows = (await listScopedOrders(auth.campusId, data)).filter((row) => row.paymentStatus === EXPRESS_PAYMENT_STATUS.PAID && row.orderStatus !== EXPRESS_ORDER_STATUS.CANCELLED)
    const { pickup, delivery } = sortForExport(rows)
    const workbook = new ExcelJS.Workbook()
    const pickupSheet = workbook.addWorksheet('取件清单')
    pickupSheet.columns = [
      { header: '序号', key: 'index', width: 8 },
      { header: '快递点', key: 'pickupPointName', width: 20 },
      { header: '取件码', key: 'pickupCode', width: 18 },
      { header: '件数', key: 'packageCount', width: 8 },
      { header: '订单号', key: 'orderNo', width: 24 },
      { header: '备注', key: 'note', width: 30 }
    ]
    pickup.forEach((row, index) => pickupSheet.addRow({ index: index + 1, pickupPointName: row.pickupPointName, pickupCode: row.pickupCode, packageCount: row.packageCount, orderNo: row.orderNo, note: row.note || '' }))
    const deliverySheet = workbook.addWorksheet('配送清单')
    deliverySheet.columns = [
      { header: '序号', key: 'index', width: 8 },
      { header: '校区', key: 'campusId', width: 18 },
      { header: '宿舍楼', key: 'dormBuilding', width: 18 },
      { header: '房间', key: 'roomNumber', width: 12 },
      { header: '手机号', key: 'phone', width: 16 },
      { header: '件数', key: 'packageCount', width: 8 },
      { header: '订单号', key: 'orderNo', width: 24 },
      { header: '状态', key: 'orderStatus', width: 14 }
    ]
    delivery.forEach((row, index) => deliverySheet.addRow({ index: index + 1, campusId: row.campusId, dormBuilding: row.dormBuilding, roomNumber: row.roomNumber, phone: row.phone, packageCount: row.packageCount, orderNo: row.orderNo, orderStatus: row.orderStatus }))
    const content = await workbook.xlsx.writeBuffer()
    const runId = crypto.randomBytes(8).toString('hex')
    const date = new Date().toISOString().slice(0, 10)
    const cloudPath = `exports/express/${date}/${runId}.xlsx`
    if (!cloud || typeof cloud.uploadFile !== 'function') return fail('当前环境不支持私有导出')
    const upload = await cloud.uploadFile({ cloudPath, fileContent: Buffer.from(content) })
    const fileId = upload.fileID || upload.fileId
    if (!fileId) return fail('导出文件写入失败')
    await db.collection(EXPORTS).doc(runId).set({ data: { _id: runId, actorUserId: auth.capabilities.userId, campusId: auth.campusId, fileId, cloudPath, orderCount: rows.length, createdAt: now(), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), smokeRunId: data.smokeRunId || null } })
    await staff.writeAudit({ actorUserId: auth.capabilities.userId, action: 'EXPRESS_EXPORT_CREATED', resourceType: 'express_export', resourceId: runId, metadata: { orderCount: rows.length, campusId: auth.campusId } })
    await pruneExpiredExports()
    return { code: 0, data: { fileId, orderCount: rows.length, expiresInDays: 7 } }
  }

  async function ownerUpdateExpressSettings(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_SETTINGS_MANAGE, data)
    if (auth.code !== 0 || !auth.capabilities.isOwner) return auth.code === 0 ? fail('仅 Owner 可修改快递设置', 403) : auth
    const campusId = auth.campusId
    const basePriceCents = Number(data.basePriceCents)
    if (!Number.isInteger(basePriceCents) || basePriceCents < 0 || basePriceCents > 10000) return fail('基础价格无效')
    const pickupPoints = Array.isArray(data.pickupPoints) ? data.pickupPoints.slice(0, 20).map((point, index) => ({
      id: String(point.id || `point_${index + 1}`).trim().slice(0, 40),
      name: String(point.name || '').trim().slice(0, 40),
      address: String(point.address || '').trim().slice(0, 100),
      openingHours: String(point.openingHours || '').trim().slice(0, 50)
    })).filter((point) => point.name) : []
    if (data.acceptingOrders === true && pickupPoints.length === 0) return fail('接单前至少配置一个快递点')
    const settings = {
      _id: campusId,
      schoolId: EXPRESS_DEFAULT_SCHOOL_ID,
      campusId,
      acceptingOrders: data.acceptingOrders === true,
      cutoffTime: String(data.cutoffTime || '').trim().slice(0, 20),
      deliveryWindow: String(data.deliveryWindow || '').trim().slice(0, 60),
      basePriceCents,
      pickupPoints,
      notice: String(data.notice || '').trim().slice(0, 200),
      updatedByUserId: auth.capabilities.userId,
      updatedAt: now(),
      smokeRunId: data.smokeRunId || null
    }
    await db.collection(SETTINGS).doc(campusId).set({ data: settings })
    await staff.writeAudit({ actorUserId: auth.capabilities.userId, action: 'EXPRESS_SETTINGS_UPDATED', resourceType: 'express_settings', resourceId: campusId, metadata: { campusId } })
    return { code: 0, data: publicSettings(settings, campusId) }
  }

  return {
    ORDERS,
    SETTINGS,
    EXPORTS,
    getServiceConfig,
    createExpressOrder,
    getMyExpressOrders,
    getMyExpressOrder,
    createExpressTestPayment,
    staffGetExpressDashboard,
    staffGetExpressOrders,
    staffGetExpressOrderDetail,
    staffUpdateExpressOrderStatus,
    staffBatchUpdateExpressOrderStatus,
    staffExportExpressOrders,
    ownerUpdateExpressSettings
  }
}

module.exports = createExpressModule
