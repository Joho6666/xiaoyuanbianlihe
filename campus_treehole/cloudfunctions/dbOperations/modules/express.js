// Express student orders, staff fulfillment, and owner settings.
// Sensitive data stays behind dbOperations; only this module resolves OpenID.
const crypto = require('crypto')
const ExcelJS = require('exceljs')
const { createExpressImportModule } = require('./express-import')
const { createConfiguredOCRAdapter } = require('./express-ocr')
const { publicId } = require('../shared/public-data')
const {
  EXPRESS_DEFAULT_SCHOOL_ID,
  EXPRESS_DEFAULT_CAMPUS_ID,
  EXPRESS_ORDER_STATUS,
  EXPRESS_PAYMENT_STATUS,
  EXPRESS_DELIVERY_PROFILE_STATUS,
  EXPRESS_PICKUP_ITEM_LIMIT,
  EXPRESS_PICKUP_ITEM_PACKAGE_LIMIT,
  EXPRESS_ORDER_PACKAGE_LIMIT,
  EXPRESS_PARCEL_SIZE,
  canTransitionExpressOrder,
  normalizeLegacyExpressOrder,
  normalizeExpressPickupItems,
  normalizeExpressParcelSize,
  normalizeExpressParcelSizePricing
} = require('../domain/express')
const { STAFF_PERMISSIONS } = require('../domain/staff')

const ORDERS = 'express_orders'
const SETTINGS = 'express_settings'
const EXPORTS = 'express_exports'
const DELIVERY_PROFILES = 'express_delivery_profiles'

const DEFAULT_DELIVERY_CAMPUSES = [
  { id: 'south', name: '南校区', enabled: true, dormAreas: [
    { id: 'tianheyuan', name: '天和苑', enabled: true, buildings: Array.from({ length: 12 }, (_, i) => ({ id: `south-${i + 1}`, name: `${i + 1}号楼`, enabled: true, sortOrder: i + 1 })) },
    { id: 'tianze', name: '天泽楼', enabled: true, buildings: Array.from({ length: 12 }, (_, i) => ({ id: `tianze-${i + 1}`, name: `${i + 1}号楼`, enabled: true, sortOrder: i + 1 })) }
  ] },
  { id: 'north', name: '北校区', enabled: true, dormAreas: [
    { id: 'boyayuan', name: '博雅苑', enabled: true, buildings: Array.from({ length: 12 }, (_, i) => ({ id: `north-${i + 1}`, name: `${i + 1}号楼`, enabled: true, sortOrder: i + 1 })) }
  ] }
]

function cloneDeliveryCampuses(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_DELIVERY_CAMPUSES
  return source.map((campus) => ({
    id: String(campus.id || '').trim(), name: String(campus.name || campus.id || '').trim(), enabled: campus.enabled !== false,
    dormAreas: Array.isArray(campus.dormAreas) ? campus.dormAreas.map((area) => ({
      id: String(area.id || '').trim(), name: String(area.name || area.id || '').trim(), enabled: area.enabled !== false,
      buildings: Array.isArray(area.buildings) ? area.buildings.map((building, index) => ({ id: String(building.id || `${area.id}-${index + 1}`), name: String(building.name || '').trim(), enabled: building.enabled !== false, sortOrder: Number(building.sortOrder) || index + 1 })).filter((building) => building.name) : []
    })).filter((area) => area.id && area.name) : []
  })).filter((campus) => campus.id && campus.name)
}

function findDeliverySelection(settings, data) {
  const campuses = cloneDeliveryCampuses(settings && settings.deliveryCampuses)
  const deliveryCampus = String(data.deliveryCampus || '').trim()
  const campus = campuses.find((item) => item.id === deliveryCampus && item.enabled)
  if (!campus) return { error: '请选择有效的配送校区' }
  const areaId = String(data.dormArea || '').trim()
  const area = campus.dormAreas.find((item) => item.id === areaId && item.enabled)
  if (!area) return { error: '请选择有效的宿舍园区' }
  const buildingId = String(data.dormBuildingId || '').trim()
  const buildingName = String(data.dormBuilding || '').trim()
  const building = area.buildings.find((item) => item.enabled && ((buildingId && item.id === buildingId) || (!buildingId && item.name === buildingName)))
  if (!building) return { error: '请选择有效的宿舍楼' }
  return { campuses, campus, area, building }
}

function findConfiguredDeliverySelection(settings, data) {
  if (!settings || !Array.isArray(settings.deliveryCampuses) || !settings.deliveryCampuses.length) {
    return { error: '当前校区尚未配置可用宿舍地址' }
  }
  return findDeliverySelection(settings, data)
}

function normalizeExpressPickupInput(data = {}, { allowEmptyCode = false, requireParcelSize = false } = {}) {
  const source = Array.isArray(data.pickupItems)
    ? data.pickupItems
    : (data.pickupPointId || data.pickupCode ? [{ pickupPointId: data.pickupPointId, pickupCode: data.pickupCode, parcelSize: data.parcelSize, packageCount: data.packageCount }] : [])
  if (!source.length) return { error: '请至少添加一个取件码' }
  if (source.length > EXPRESS_PICKUP_ITEM_LIMIT) return { error: `最多添加 ${EXPRESS_PICKUP_ITEM_LIMIT} 个取件码` }
  const items = []
  const seen = new Set()
  let totalPackageCount = 0
  for (let index = 0; index < source.length; index += 1) {
    const input = source[index] || {}
    const pickupPointId = String(input.pickupPointId || '').trim()
    const pickupCode = String(input.pickupCode || '').trim()
    const packageCount = Number(input.packageCount)
    const parcelSize = normalizeExpressParcelSize(input.parcelSize)
    if (!pickupPointId || (!pickupCode && !allowEmptyCode)) return { error: '请填写完整的快递点和取件码' }
    if (!Number.isInteger(packageCount) || packageCount < 1 || packageCount > EXPRESS_PICKUP_ITEM_PACKAGE_LIMIT) return { error: `每个取件码件数需为 1-${EXPRESS_PICKUP_ITEM_PACKAGE_LIMIT}` }
    if (requireParcelSize && !parcelSize) return { error: '请选择包裹规格' }
    const key = `${pickupPointId}\u0000${pickupCode.toUpperCase()}`
    if (seen.has(key)) return { error: '同一快递点的取件码不能重复' }
    seen.add(key)
    totalPackageCount += packageCount
    if (totalPackageCount > EXPRESS_ORDER_PACKAGE_LIMIT) return { error: `一个订单最多 ${EXPRESS_ORDER_PACKAGE_LIMIT} 件包裹` }
    items.push({ id: String(input.id || `pickup_item_${index + 1}`), pickupPointId, pickupCode, packageCount, parcelSize })
  }
  return { items, totalPackageCount, pickupItemCount: items.length, pickupPointCount: new Set(items.map((item) => item.pickupPointId)).size }
}

function resolveExpressPricing(settings) {
  const baseOrderPriceCents = Math.max(0, Number(settings && settings.baseOrderPriceCents) || 0)
  const perPackagePriceCents = Math.max(0, Number(settings && (settings.perPackagePriceCents ?? settings.basePriceCents)) || 0)
  const extraPickupPointPriceCents = Math.max(0, Number(settings && settings.extraPickupPointPriceCents) || 0)
  return {
    pricingMode: String(settings && settings.pricingMode || 'PER_PACKAGE'),
    baseOrderPriceCents,
    perPackagePriceCents,
    extraPickupPointPriceCents,
    parcelSizePricing: normalizeExpressParcelSizePricing(settings && settings.parcelSizePricing)
  }
}

function calculateExpressAmount(normalized, pricing) {
  const sizeBreakdown = Object.fromEntries(Object.values(EXPRESS_PARCEL_SIZE).map((size) => [size, { count: 0, unitPriceCents: pricing.parcelSizePricing[size].priceCents, subtotalCents: 0 }]))
  let parcelSubtotalCents = 0
  if (pricing.pricingMode === 'PARCEL_SIZE') {
    for (const item of normalized.items) {
      const parcelSize = normalizeExpressParcelSize(item.parcelSize)
      const configured = parcelSize && pricing.parcelSizePricing[parcelSize]
      if (!configured || configured.enabled !== true) return { error: '请选择有效且可用的包裹规格' }
      const count = Number(item.packageCount) || 0
      sizeBreakdown[parcelSize].count += count
      sizeBreakdown[parcelSize].subtotalCents += configured.priceCents * count
      parcelSubtotalCents += configured.priceCents * count
    }
  }
  const extraPickupPointFee = pricing.extraPickupPointPriceCents * Math.max(0, normalized.pickupPointCount - 1)
  const additionalFeeCents = pricing.pricingMode === 'PARCEL_SIZE' ? pricing.baseOrderPriceCents + extraPickupPointFee : pricing.baseOrderPriceCents + extraPickupPointFee
  const legacySubtotal = pricing.perPackagePriceCents * normalized.totalPackageCount
  const totalPriceCents = pricing.pricingMode === 'PARCEL_SIZE' ? parcelSubtotalCents + additionalFeeCents : legacySubtotal + additionalFeeCents
  return { parcelSubtotalCents, extraPickupPointFee, additionalFeeCents, totalPriceCents, sizeBreakdown }
}

  function summarizePickupPoints(items) {
  const counts = new Map()
  items.forEach((item) => counts.set(item.pickupPointNameSnapshot || item.pickupPointName || item.pickupPointId, (counts.get(item.pickupPointNameSnapshot || item.pickupPointName || item.pickupPointId) || 0) + item.packageCount))
  return Array.from(counts.entries()).map(([name, count]) => `${name}×${count}`).join(' / ')
}

function createExpressModule({ db, _, cloud, helpers = {} }) {
  const {
    staff,
    getUserForAction,
    resolveCampusIdForRead = (value) => (typeof value === 'string' ? value.trim() : null),
    makeDeterministicId = (scope, value) => `${scope}_${String(value || '').replace(/[^a-z0-9_-]/gi, '')}`,
    isCollectionNotExistError = () => false,
    ocrAdapter
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
    const points = Array.isArray(row.pickupPoints) ? row.pickupPoints.filter((point) => point.enabled !== false).map((point) => ({
      id: point.id,
      name: point.name,
      address: point.address || '',
      shortName: point.shortName || point.name || '',
      aliases: Array.isArray(point.aliases) ? point.aliases.slice(0, 10) : [],
      deliveryCampus: point.deliveryCampus || '',
      openingHours: point.openingHours || '',
      sortOrder: Number(point.sortOrder) || 0
    })).sort((a, b) => a.sortOrder - b.sortOrder) : []
    return {
      campusId,
      schoolId: row.schoolId || EXPRESS_DEFAULT_SCHOOL_ID,
      configured: !!settings,
      serviceStatus: !settings ? 'UNCONFIGURED' : (row.acceptingOrders === true ? 'OPEN' : 'PAUSED'),
      acceptingOrders: row.acceptingOrders === true,
      cutoffTime: row.cutoffTime || '',
      deliveryWindow: row.deliveryWindow || '',
      paymentExpireMinutes: Number(row.paymentExpireMinutes) || 30,
      basePriceCents: Number(row.basePriceCents) || 0,
      pricingMode: row.pricingMode || 'PER_PACKAGE',
      baseOrderPriceCents: Math.max(0, Number(row.baseOrderPriceCents) || 0),
      perPackagePriceCents: Math.max(0, Number(row.perPackagePriceCents ?? row.basePriceCents) || 0),
      extraPickupPointPriceCents: Math.max(0, Number(row.extraPickupPointPriceCents) || 0),
      parcelSizePricing: normalizeExpressParcelSizePricing(row.parcelSizePricing),
      pickupPoints: points,
      deliveryCampuses: cloneDeliveryCampuses(row.deliveryCampuses),
      notice: row.notice || '',
      specialParcelNotice: row.specialParcelNotice || '超重、超大、易碎或特殊物品请先联系工作人员确认是否可配送。',
      testPaymentAvailable: testPaymentEnabled()
    }
  }

  const expressImport = createExpressImportModule({
    cloud,
    getUserForAction,
    readSettings,
    ocrAdapter: ocrAdapter || createConfiguredOCRAdapter()
  })

  function publicDeliveryProfile(profile) {
    if (!profile) return null
    return {
      _id: profile._id,
      label: profile.label,
      isSelf: profile.isSelf === true,
      recipientName: profile.recipientName,
      contactPhone: profile.contactPhone,
      schoolId: profile.schoolId,
      campusId: profile.campusId,
      deliveryCampus: profile.deliveryCampus,
      deliveryCampusName: profile.deliveryCampusName,
      dormArea: profile.dormArea,
      dormAreaName: profile.dormAreaName,
      dormBuildingId: profile.dormBuildingId,
      dormBuildingName: profile.dormBuildingName,
      roomNumber: profile.roomNumber,
      isDefault: profile.isDefault === true,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }
  }

  async function withTransaction(handler) {
    if (typeof db.runTransaction === 'function') return db.runTransaction(handler)
    return handler(db)
  }

  async function readOwnedDeliveryProfile(ownerUserId, profileId, store = db) {
    if (!profileId) return null
    try {
      const result = await store.collection(DELIVERY_PROFILES).doc(String(profileId)).get()
      const profile = result && result.data
      return profile && profile.ownerUserId === ownerUserId ? profile : null
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  function sortProfiles(profiles) {
    return profiles.slice().sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    })
  }

  async function listActiveDeliveryProfiles(ownerUserId, store = db) {
    try {
      const result = await store.collection(DELIVERY_PROFILES).where({ ownerUserId, status: EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE }).get()
      return sortProfiles(result.data || [])
    } catch (err) {
      if (isCollectionNotExistError(err)) return []
      throw err
    }
  }

  function validateDeliveryProfileInput(settings, data = {}) {
    const selection = findConfiguredDeliverySelection(settings, data)
    if (selection.error) return selection
    const label = String(data.label || '').trim().slice(0, 20)
    const recipientName = String(data.recipientName || '').trim().slice(0, 30)
    const contactPhone = String(data.contactPhone || '').trim()
    const roomNumber = String(data.roomNumber || '').trim().slice(0, 20)
    if (!label) return { error: '请填写配送信息名称' }
    if (!recipientName) return { error: '请填写收件人姓名' }
    if (!/^1\d{10}$/.test(contactPhone)) return { error: '请填写有效手机号' }
    if (!roomNumber) return { error: '请填写房间号' }
    return {
      selection,
      label,
      recipientName,
      contactPhone,
      roomNumber,
      isSelf: data.isSelf === true
    }
  }

  async function writeDeliveryProfile(transaction, ownerUserId, campusId, settings, data) {
    const parsed = validateDeliveryProfileInput(settings, data)
    if (parsed.error) return { error: parsed.error }
    const active = await listActiveDeliveryProfiles(ownerUserId, transaction)
    if (active.length >= 10) return { error: '最多保存 10 条常用配送信息' }
    const isDefault = active.length === 0 || data.isDefault === true
    if (isDefault && active.length) {
      await transaction.collection(DELIVERY_PROFILES).where({ ownerUserId, status: EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE, isDefault: true }).update({ data: { isDefault: false, updatedAt: now() } })
    }
    const profile = {
      _id: `express_profile_${crypto.randomBytes(12).toString('hex')}`,
      ownerUserId,
      label: parsed.label,
      isSelf: parsed.isSelf,
      recipientName: parsed.recipientName,
      contactPhone: parsed.contactPhone,
      schoolId: settings.schoolId || EXPRESS_DEFAULT_SCHOOL_ID,
      campusId,
      deliveryCampus: parsed.selection.campus.id,
      deliveryCampusName: parsed.selection.campus.name,
      dormArea: parsed.selection.area.id,
      dormAreaName: parsed.selection.area.name,
      dormBuildingId: parsed.selection.building.id,
      dormBuildingName: parsed.selection.building.name,
      roomNumber: parsed.roomNumber,
      isDefault,
      status: EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE,
      createdAt: now(),
      updatedAt: now(),
      smokeRunId: data.smokeRunId || null
    }
    await transaction.collection(DELIVERY_PROFILES).doc(profile._id).set({ data: profile })
    return { profile }
  }

  async function getMyExpressDeliveryProfiles(openid) {
    const user = await getUserForAction(openid, { requireActive: true })
    return { code: 0, data: (await listActiveDeliveryProfiles(userIdOf(user))).map(publicDeliveryProfile) }
  }

  async function createExpressDeliveryProfile(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const ownerUserId = userIdOf(user)
    const campusId = resolveCampus(user, data.campusId)
    if (campusId !== (user.campusId || campusId)) return fail('只能保存当前校区的配送信息', 403)
    const settings = await readSettings(campusId)
    const result = await withTransaction(async (transaction) => {
      const written = await writeDeliveryProfile(transaction, ownerUserId, campusId, settings, data)
      if (written.error) return fail(written.error)
      const profile = written.profile
      return { code: 0, data: publicDeliveryProfile(profile) }
    })
    return result
  }

  async function setDefaultExpressDeliveryProfile(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const ownerUserId = userIdOf(user)
    return withTransaction(async (transaction) => {
      const profile = await readOwnedDeliveryProfile(ownerUserId, data.profileId, transaction)
      if (!profile || profile.status !== EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE) return fail('配送信息不存在', 404)
      await transaction.collection(DELIVERY_PROFILES).where({ ownerUserId, status: EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE, isDefault: true }).update({ data: { isDefault: false, updatedAt: now() } })
      const patch = { isDefault: true, updatedAt: now() }
      await transaction.collection(DELIVERY_PROFILES).doc(profile._id).update({ data: patch })
      return { code: 0, data: publicDeliveryProfile({ ...profile, ...patch }) }
    })
  }

  async function updateExpressDeliveryProfile(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const ownerUserId = userIdOf(user)
    const profile = await readOwnedDeliveryProfile(ownerUserId, data.profileId)
    if (!profile || profile.status !== EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE) return fail('配送信息不存在', 404)
    const settings = await readSettings(profile.campusId)
    const parsed = validateDeliveryProfileInput(settings, { ...profile, ...data })
    if (parsed.error) return fail(parsed.error)
    const patch = {
      label: parsed.label,
      isSelf: parsed.isSelf,
      recipientName: parsed.recipientName,
      contactPhone: parsed.contactPhone,
      deliveryCampus: parsed.selection.campus.id,
      deliveryCampusName: parsed.selection.campus.name,
      dormArea: parsed.selection.area.id,
      dormAreaName: parsed.selection.area.name,
      dormBuildingId: parsed.selection.building.id,
      dormBuildingName: parsed.selection.building.name,
      roomNumber: parsed.roomNumber,
      updatedAt: now()
    }
    await db.collection(DELIVERY_PROFILES).doc(profile._id).update({ data: patch })
    const updated = { ...profile, ...patch }
    if (data.isDefault === true && !profile.isDefault) return setDefaultExpressDeliveryProfile(openid, { profileId: profile._id })
    return { code: 0, data: publicDeliveryProfile(updated) }
  }

  async function archiveExpressDeliveryProfile(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const ownerUserId = userIdOf(user)
    return withTransaction(async (transaction) => {
      const profile = await readOwnedDeliveryProfile(ownerUserId, data.profileId, transaction)
      if (!profile || profile.status !== EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE) return fail('配送信息不存在', 404)
      const patch = { status: EXPRESS_DELIVERY_PROFILE_STATUS.ARCHIVED, isDefault: false, updatedAt: now() }
      await transaction.collection(DELIVERY_PROFILES).doc(profile._id).update({ data: patch })
      if (profile.isDefault) {
        const remaining = (await listActiveDeliveryProfiles(ownerUserId, transaction)).filter((item) => item._id !== profile._id)
        if (remaining.length) {
          const replacement = remaining.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0]
          await transaction.collection(DELIVERY_PROFILES).doc(replacement._id).update({ data: { isDefault: true, updatedAt: now() } })
        }
      }
      return { code: 0, data: publicDeliveryProfile({ ...profile, ...patch }) }
    })
  }

  function userIdOf(user) {
    return user && (user.internalUserId || publicId(user._openid || user._id))
  }

  function resolveCampus(user, requested) {
    const requestedCampus = resolveCampusIdForRead(requested || (user && user.campusId))
    return requestedCampus || (user && user.campusId) || EXPRESS_DEFAULT_CAMPUS_ID
  }

  function isPastCutoff(settings) {
    const cutoff = String(settings && settings.cutoffTime || '').trim()
    if (!cutoff || !/^\d{1,2}:\d{2}$/.test(cutoff)) return false
    const [hour, minute] = cutoff.split(':').map(Number)
    const current = now()
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(current)
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]))
    return values.hour * 60 + values.minute >= hour * 60 + minute
  }

  async function getServiceConfig(openid, data = {}) {
    let user = null
    if (openid) {
      try {
        user = await getUserForAction(openid, { requireActive: false })
      } catch (_) {}
    }
    const campusId = resolveCampus(user, data.campusId)
    const settings = await readSettings(campusId)
    return { code: 0, data: publicSettings(settings, campusId) }
  }

  async function getExpressQuote(openid, data = {}) {
    let user = null
    if (openid) {
      try {
        user = await getUserForAction(openid, { requireActive: false })
      } catch (_) {}
    }
    const campusId = resolveCampus(user, data.campusId)
    const settings = await readSettings(campusId)
    if (!settings || settings.acceptingOrders !== true) return fail('当前校区暂未开放快递代拿')
    const pricing = resolveExpressPricing(settings)
    const normalized = normalizeExpressPickupInput(data, { allowEmptyCode: !Array.isArray(data.pickupItems), requireParcelSize: pricing.pricingMode === 'PARCEL_SIZE' })
    if (normalized.error) return fail(normalized.error)
    const names = new Map()
    for (const item of normalized.items) {
      const point = (settings.pickupPoints || []).find((candidate) => candidate.id === item.pickupPointId && candidate.enabled !== false)
      if (!point) return fail('请选择有效的快递点')
      if (data.deliveryCampus && point.deliveryCampus && point.deliveryCampus !== data.deliveryCampus) return fail('快递点与配送校区不匹配')
      names.set(item.pickupPointId, point.name)
    }
    const calculated = calculateExpressAmount(normalized, pricing)
    if (calculated.error) return fail(calculated.error)
    const subtotal = pricing.pricingMode === 'PARCEL_SIZE' ? calculated.parcelSubtotalCents : pricing.baseOrderPriceCents + pricing.perPackagePriceCents * normalized.totalPackageCount
    return { code: 0, data: {
      totalPackageCount: normalized.totalPackageCount,
      pickupItemCount: normalized.pickupItemCount,
      pickupPointCount: normalized.pickupPointCount,
      subtotal,
      extraPickupPointFee: calculated.extraPickupPointFee,
      totalPriceCents: calculated.totalPriceCents,
      parcelSubtotalCents: calculated.parcelSubtotalCents,
      additionalFeeCents: calculated.additionalFeeCents,
      sizeBreakdown: calculated.sizeBreakdown,
      unitPriceCents: pricing.perPackagePriceCents,
      unitPrice: (pricing.perPackagePriceCents / 100).toFixed(2),
      totalPrice: (calculated.totalPriceCents / 100).toFixed(2),
      deliveryWindow: settings.deliveryWindow || '',
      priceBreakdown: { pricingMode: pricing.pricingMode, baseOrderPriceCents: pricing.baseOrderPriceCents, perPackagePriceCents: pricing.perPackagePriceCents, extraPickupPointPriceCents: pricing.extraPickupPointPriceCents, pickupPointNames: Array.from(names.values()), parcelSizePricing: pricing.parcelSizePricing }
    } }
  }

  async function readOrder(orderId) {
    if (!orderId) return null
    const result = await db.collection(ORDERS).doc(String(orderId)).get()
    return result && result.data ? normalizeLegacyExpressOrder(result.data) : null
  }

  function publicPickupItems(order) {
    return normalizeExpressPickupItems(order).map((item) => ({
      id: item.id,
      pickupPointId: item.pickupPointId,
      pickupPointNameSnapshot: item.pickupPointNameSnapshot,
      pickupCode: item.pickupCode,
      packageCount: item.packageCount,
    parcelSize: item.parcelSize || null,
    parcelPriceCents: Number.isFinite(Number(item.parcelPriceCents)) ? Number(item.parcelPriceCents) : null
    }))
  }

  function publicOwnOrder(order) {
    if (!order) return null
    return {
      _id: order._id,
      orderNo: order.orderNo,
      schoolId: order.schoolId,
      campusId: order.campusId,
      deliveryCampus: order.deliveryCampus,
      deliveryCampusNameSnapshot: order.deliveryCampusNameSnapshot || '',
      pickupPointId: order.pickupPointId,
      pickupPointName: order.pickupPointName,
      pickupPointNameSnapshot: order.pickupPointNameSnapshot || order.pickupPointName,
      pickupItems: publicPickupItems(order),
      totalPackageCount: Number(order.totalPackageCount) || Number(order.packageCount) || 0,
      pickupItemCount: Number(order.pickupItemCount) || publicPickupItems(order).length,
      pickupPointCount: Number(order.pickupPointCount) || new Set(publicPickupItems(order).map((item) => item.pickupPointId)).size,
      packageCount: order.packageCount,
      pricingMode: order.pricingMode || 'PER_PACKAGE',
      parcelSubtotalCents: Number(order.parcelSubtotalCents) || 0,
      additionalFeeCents: Number(order.additionalFeeCents) || 0,
      sizeBreakdown: order.sizeBreakdown || null,
      dormArea: order.dormArea || '',
      dormAreaNameSnapshot: order.dormAreaNameSnapshot || '',
      dormBuilding: order.dormBuilding,
      dormBuildingId: order.dormBuildingId || '',
      dormBuildingNameSnapshot: order.dormBuildingNameSnapshot || order.dormBuilding,
      roomNumber: order.roomNumber,
      roomNumberSnapshot: order.roomNumberSnapshot || order.roomNumber,
      deliveryProfileId: order.deliveryProfileId || null,
      recipientNameSnapshot: order.recipientNameSnapshot || '未填写',
      recipientPhoneSnapshot: order.recipientPhoneSnapshot || order.phone || '',
      phone: order.recipientPhoneSnapshot || order.phone,
      note: order.note || '',
      amountCents: order.amountCents,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      parcelSizeMismatch: order.parcelSizeMismatch === true,
      expectedParcelSize: order.expectedParcelSize || null,
      actualParcelSize: order.actualParcelSize || null,
      mismatchCheckedAt: order.mismatchCheckedAt || null,
      mismatchNote: order.mismatchNote || '',
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
      schoolId: order.schoolId,
      campusId: order.campusId,
      deliveryCampus: order.deliveryCampus,
      deliveryCampusNameSnapshot: order.deliveryCampusNameSnapshot || '',
      pickupPointId: order.pickupPointId,
      pickupPointName: order.pickupPointName,
      pickupPointNameSnapshot: order.pickupPointNameSnapshot || order.pickupPointName,
      pickupItems: publicPickupItems(order),
      totalPackageCount: Number(order.totalPackageCount) || Number(order.packageCount) || 0,
      pickupItemCount: Number(order.pickupItemCount) || publicPickupItems(order).length,
      pickupPointCount: Number(order.pickupPointCount) || new Set(publicPickupItems(order).map((item) => item.pickupPointId)).size,
      pickupCode: order.pickupCode,
      packageCount: order.packageCount,
      pricingMode: order.pricingMode || 'PER_PACKAGE',
      parcelSubtotalCents: Number(order.parcelSubtotalCents) || 0,
      additionalFeeCents: Number(order.additionalFeeCents) || 0,
      sizeBreakdown: order.sizeBreakdown || null,
      dormArea: order.dormArea || '',
      dormAreaNameSnapshot: order.dormAreaNameSnapshot || '',
      dormBuilding: order.dormBuilding,
      dormBuildingId: order.dormBuildingId || '',
      dormBuildingNameSnapshot: order.dormBuildingNameSnapshot || order.dormBuilding,
      roomNumber: order.roomNumber,
      roomNumberSnapshot: order.roomNumberSnapshot || order.roomNumber,
      deliveryProfileId: order.deliveryProfileId || null,
      recipientNameSnapshot: order.recipientNameSnapshot || '未填写',
      recipientPhoneSnapshot: order.recipientPhoneSnapshot || order.phone || '',
      phone: order.recipientPhoneSnapshot || order.phone,
      note: order.note || '',
      amountCents: order.amountCents,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      parcelSizeMismatch: order.parcelSizeMismatch === true,
      expectedParcelSize: order.expectedParcelSize || null,
      actualParcelSize: order.actualParcelSize || null,
      mismatchStaffUserId: order.mismatchStaffUserId || null,
      mismatchCheckedAt: order.mismatchCheckedAt || null,
      mismatchNote: order.mismatchNote || '',
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
    if (isPastCutoff(settings)) return fail('今日已过截单时间，请明天再试')
    const clientRequestId = String(data.clientRequestId || '').trim().slice(0, 100) || crypto.randomUUID()
    const existingResult = await db.collection(ORDERS).where({ userId: userIdOf(user), clientRequestId }).limit(1).get()
    if (existingResult.data && existingResult.data[0]) return { code: 0, data: publicOwnOrder(normalizeLegacyExpressOrder(existingResult.data[0])), idempotent: true }
    const pricing = resolveExpressPricing(settings)
    const normalized = normalizeExpressPickupInput(data, { requireParcelSize: pricing.pricingMode === 'PARCEL_SIZE' })
    if (normalized.error) return fail(normalized.error)
    let deliveryProfile = null
    let deliveryData = null
    let deliverySelection
    if (data.deliveryProfileId) {
      deliveryProfile = await readOwnedDeliveryProfile(userIdOf(user), data.deliveryProfileId)
      if (!deliveryProfile || deliveryProfile.status !== EXPRESS_DELIVERY_PROFILE_STATUS.ACTIVE) return fail('配送信息不存在', 404)
      if (deliveryProfile.campusId !== campusId) return fail('配送信息不属于当前服务校区', 403)
      deliveryData = deliveryProfile
      deliverySelection = findConfiguredDeliverySelection(settings, deliveryProfile)
      if (deliverySelection.error) return fail('该地址已失效，请更新')
    } else if (data.deliveryData) {
      deliveryData = { ...data.deliveryData, label: data.deliveryData.label || (data.deliveryData.isSelf === true ? '我的宿舍' : '本次配送') }
      deliverySelection = findConfiguredDeliverySelection(settings, deliveryData)
      if (deliverySelection.error) return fail(deliverySelection.error)
    } else if (!data.deliveryCampus && !data.dormArea && !data.dormBuildingId) {
      const legacyBuilding = String(data.dormBuilding || '').trim()
      if (!legacyBuilding) return fail('请填写有效的宿舍楼')
      const campuses = cloneDeliveryCampuses(settings.deliveryCampuses)
      deliverySelection = { campuses, campus: campuses[0], area: campuses[0].dormAreas[0], building: { id: `legacy-${legacyBuilding}`, name: legacyBuilding, enabled: true } }
    } else {
      deliverySelection = findDeliverySelection(settings, data)
    }
    if (deliverySelection.error) return fail(deliverySelection.error)
    const resolvedItems = []
    for (let index = 0; index < normalized.items.length; index += 1) {
      const item = normalized.items[index]
      const point = (settings.pickupPoints || []).find((candidate) => candidate.id === item.pickupPointId && candidate.enabled !== false)
      if (!point) return fail('请选择有效的快递点')
      if (point.deliveryCampus && point.deliveryCampus !== deliverySelection.campus.id) return fail('快递点与配送校区不匹配')
      resolvedItems.push({
        id: makeDeterministicId('express_pickup_item', `${clientRequestId}:${index}:${item.pickupPointId}:${item.pickupCode.toUpperCase()}`),
        pickupPointId: point.id,
        pickupPointNameSnapshot: point.name,
        pickupCode: item.pickupCode,
        packageCount: item.packageCount,
        parcelSize: item.parcelSize || null,
        parcelPriceCents: pricing.pricingMode === 'PARCEL_SIZE' ? pricing.parcelSizePricing[item.parcelSize].priceCents : pricing.perPackagePriceCents
      })
    }
    const calculated = calculateExpressAmount(normalized, pricing)
    if (calculated.error) return fail(calculated.error)
    const amountCents = calculated.totalPriceCents
    const orderId = makeDeterministicId('express_order', `${userIdOf(user)}:${clientRequestId}`)
    const orderNo = `EXP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    const recipientName = String((deliveryData && deliveryData.recipientName) || data.recipientName || '').trim().slice(0, 30)
    const recipientPhone = String((deliveryData && (deliveryData.contactPhone || deliveryData.recipientPhoneSnapshot)) || data.recipientPhoneSnapshot || data.phone || '').trim()
    const dormBuilding = deliverySelection.building.name
    const roomNumber = String((deliveryData && deliveryData.roomNumber) || data.roomNumber || '').trim()
    if (!dormBuilding || dormBuilding.length > 40 || !roomNumber || roomNumber.length > 20) return fail('请填写宿舍楼和房间号')
    if (!/^1\d{10}$/.test(recipientPhone)) return fail('请填写有效手机号')
    const shouldSaveInlineProfile = !deliveryProfile && deliveryData && (deliveryData.isSelf === true || data.saveDeliveryProfile === true)
    const result = await withTransaction(async (transaction) => {
      const txExisting = await transaction.collection(ORDERS).where({ userId: userIdOf(user), clientRequestId }).limit(1).get()
      if (txExisting.data && txExisting.data[0]) return { code: 0, data: publicOwnOrder(normalizeLegacyExpressOrder(txExisting.data[0])), idempotent: true }
      let savedProfile = deliveryProfile
      if (shouldSaveInlineProfile) {
        const written = await writeDeliveryProfile(transaction, userIdOf(user), campusId, settings, { ...deliveryData, isDefault: deliveryData.isSelf === true || deliveryData.isDefault === true, smokeRunId: data.smokeRunId || null })
        if (written.error) return fail(written.error)
        savedProfile = written.profile
      }
      const firstItem = resolvedItems[0]
      const order = {
        _id: orderId,
        orderNo,
        userId: userIdOf(user),
        schoolId: settings.schoolId || EXPRESS_DEFAULT_SCHOOL_ID,
        campusId,
        deliveryProfileId: savedProfile ? savedProfile._id : null,
        deliveryCampus: deliverySelection.campus.id,
        deliveryCampusNameSnapshot: deliverySelection.campus.name,
        pickupPointId: firstItem.pickupPointId,
        pickupPointName: firstItem.pickupPointNameSnapshot,
        pickupPointNameSnapshot: firstItem.pickupPointNameSnapshot,
        pickupCode: firstItem.pickupCode,
        packageCount: normalized.totalPackageCount,
        pickupItems: resolvedItems,
        totalPackageCount: normalized.totalPackageCount,
        pickupItemCount: normalized.pickupItemCount,
        pickupPointCount: normalized.pickupPointCount,
        pricingMode: pricing.pricingMode,
        parcelSubtotalCents: calculated.parcelSubtotalCents,
        additionalFeeCents: calculated.additionalFeeCents,
        sizeBreakdown: calculated.sizeBreakdown,
        dormArea: deliverySelection.area.id,
        dormAreaNameSnapshot: deliverySelection.area.name,
        dormBuildingId: deliverySelection.building.id,
        dormBuilding,
        dormBuildingNameSnapshot: dormBuilding,
        roomNumber,
        roomNumberSnapshot: roomNumber,
        recipientNameSnapshot: recipientName,
        recipientPhoneSnapshot: recipientPhone,
        phone: recipientPhone,
        note: String(data.note || '').trim().slice(0, 100),
        amountCents,
        clientRequestId,
        paymentStatus: EXPRESS_PAYMENT_STATUS.UNPAID,
        orderStatus: EXPRESS_ORDER_STATUS.WAIT_PAYMENT,
        createdAt: now(),
        updatedAt: now(),
        paidAt: null,
        completedAt: null,
        updatedByUserId: null,
        smokeRunId: data.smokeRunId || null
      }
      await transaction.collection(ORDERS).doc(orderId).set({ data: order })
      return { code: 0, data: publicOwnOrder(order), profileCreated: !!(savedProfile && !deliveryProfile) }
    })
    return result
  }

  async function getMyExpressOrders(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const userId = userIdOf(user)
    const result = await db.collection(ORDERS).where({ userId }).orderBy('createdAt', 'desc').limit(Math.min(50, Math.max(1, Number(data.pageSize) || 20))).get()
    const settings = await readSettings(resolveCampus(user, data.campusId))
    const expireMs = (Number(settings && settings.paymentExpireMinutes) || 30) * 60 * 1000
    const rows = (result.data || []).map(normalizeLegacyExpressOrder)
    for (const row of rows) {
      if (row.paymentStatus === EXPRESS_PAYMENT_STATUS.UNPAID && row.orderStatus === EXPRESS_ORDER_STATUS.WAIT_PAYMENT && row.createdAt && Date.now() - new Date(row.createdAt).getTime() > expireMs) {
        row.orderStatus = EXPRESS_ORDER_STATUS.CANCELLED
        await db.collection(ORDERS).doc(row._id).update({ data: { orderStatus: EXPRESS_ORDER_STATUS.CANCELLED, updatedAt: now() } })
      }
    }
    return { code: 0, data: rows.map(publicOwnOrder) }
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
    if (order.paymentStatus !== EXPRESS_PAYMENT_STATUS.UNPAID || order.orderStatus !== EXPRESS_ORDER_STATUS.WAIT_PAYMENT) return fail('订单当前不可支付')
    const patch = { paymentStatus: EXPRESS_PAYMENT_STATUS.PAID, orderStatus: EXPRESS_ORDER_STATUS.WAIT_PICKUP, paidAt: now(), updatedAt: now() }
    await db.collection(ORDERS).doc(order._id).update({ data: patch })
    return { code: 0, data: publicOwnOrder({ ...order, ...patch }) }
  }

  async function cancelMyExpressOrder(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    const order = await readOrder(data.orderId)
    if (!order || order.userId !== userIdOf(user)) return fail('订单不存在', 404)
    if (order.paymentStatus !== EXPRESS_PAYMENT_STATUS.UNPAID || order.orderStatus !== EXPRESS_ORDER_STATUS.WAIT_PAYMENT) return fail('当前订单不可取消')
    const patch = { orderStatus: EXPRESS_ORDER_STATUS.CANCELLED, updatedAt: now() }
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
    let rows = (result.data || []).map(normalizeLegacyExpressOrder)
    if (data.status && Object.values(EXPRESS_ORDER_STATUS).includes(data.status)) rows = rows.filter((row) => row.orderStatus === data.status)
    if (data.pickupPointId) rows = rows.filter((row) => normalizeExpressPickupItems(row).some((item) => item.pickupPointId === data.pickupPointId))
    if (data.paymentStatus) rows = rows.filter((row) => row.paymentStatus === data.paymentStatus)
    const keyword = String(data.keyword || '').trim().toLowerCase()
    if (keyword) rows = rows.filter((row) => [row.orderNo, row.phone, row.recipientNameSnapshot, row.roomNumber, ...normalizeExpressPickupItems(row).flatMap((item) => [item.pickupCode, item.pickupPointNameSnapshot])].some((value) => String(value || '').toLowerCase().includes(keyword)))
    return rows
  }

  async function staffGetExpressDashboard(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_READ, data)
    if (auth.code !== 0) return auth
    const clock = now()
    const dayStart = new Date(clock)
    if (Number.isNaN(dayStart.getTime())) dayStart.setTime(Date.now())
    dayStart.setHours(0, 0, 0, 0)
    const rows = (await listScopedOrders(auth.campusId, data)).filter((row) => row.paymentStatus === EXPRESS_PAYMENT_STATUS.PAID && (!row.createdAt || new Date(row.createdAt).getTime() >= dayStart.getTime()))
    const counts = { all: rows.length, totalPackageCount: 0, pickupItemCount: 0, pickupPointCount: new Set(), revenueCents: 0, waitPickup: 0, delivering: 0, completed: 0, cancelled: 0 }
    rows.forEach((row) => {
      const items = normalizeExpressPickupItems(row)
      counts.totalPackageCount += Number(row.totalPackageCount) || items.reduce((sum, item) => sum + item.packageCount, 0)
      counts.pickupItemCount += Number(row.pickupItemCount) || items.length
      items.forEach((item) => counts.pickupPointCount.add(item.pickupPointId))
      counts.revenueCents += Number(row.amountCents) || 0
      if (row.orderStatus === EXPRESS_ORDER_STATUS.WAIT_PICKUP) counts.waitPickup++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.DELIVERING) counts.delivering++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.COMPLETED) counts.completed++
      if (row.orderStatus === EXPRESS_ORDER_STATUS.CANCELLED) counts.cancelled++
    })
    counts.pickupPointCount = counts.pickupPointCount.size
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

  async function staffFlagExpressParcelSizeMismatch(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE, data)
    if (auth.code !== 0) return auth
    const order = await readOrder(data.orderId)
    if (!order || order.campusId !== auth.campusId) return fail('订单不存在', 404)
    if (order.paymentStatus !== EXPRESS_PAYMENT_STATUS.PAID) return fail('订单尚未支付，不能核验包裹规格')
    const actualParcelSize = normalizeExpressParcelSize(data.actualParcelSize)
    if (!actualParcelSize) return fail('请选择有效的实际包裹规格')
    const items = normalizeExpressPickupItems(order)
    const itemIndex = items.findIndex((item) => item.id === String(data.itemId || ''))
    if (itemIndex < 0) return fail('包裹条目不存在', 404)
    const expectedParcelSize = items[itemIndex].parcelSize || null
    if (!expectedParcelSize || expectedParcelSize === actualParcelSize) return fail('当前包裹没有规格差异')
    const checkedAt = now()
    const updatedItems = items.map((item, index) => index === itemIndex ? { ...item, parcelSizeMismatch: true, expectedParcelSize, actualParcelSize, mismatchStaffUserId: auth.capabilities.userId, mismatchCheckedAt: checkedAt } : item)
    const patch = { pickupItems: updatedItems, parcelSizeMismatch: true, updatedAt: checkedAt }
    await db.collection(ORDERS).doc(order._id).update({ data: patch })
    await staff.writeAudit({ actorUserId: auth.capabilities.userId, action: 'EXPRESS_PARCEL_SIZE_MISMATCH', resourceType: 'express_order', resourceId: order._id, metadata: { itemId: items[itemIndex].id, expectedParcelSize, actualParcelSize, campusId: order.campusId } })
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

  async function staffRecordExpressParcelMismatch(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_UPDATE, data)
    if (auth.code !== 0) return auth
    const order = await readOrder(data.orderId)
    if (!order || order.campusId !== auth.campusId) return fail('订单不存在', 404)
    const actualParcelSize = normalizeExpressParcelSize(data.actualParcelSize)
    if (!actualParcelSize) return fail('请选择实际包裹规格')
    const expectedParcelSize = normalizeExpressParcelSize(data.expectedParcelSize) || (order.pickupItems && order.pickupItems[0] && order.pickupItems[0].parcelSize) || 'SMALL'
    const patch = {
      parcelSizeMismatch: true,
      expectedParcelSize,
      actualParcelSize,
      mismatchStaffUserId: auth.capabilities.userId,
      mismatchCheckedAt: now(),
      mismatchNote: String(data.note || '').trim().slice(0, 100),
      updatedAt: now()
    }
    await db.collection(ORDERS).doc(order._id).update({ data: patch })
    await staff.writeAudit({
      actorUserId: auth.capabilities.userId,
      action: 'EXPRESS_PARCEL_SIZE_MISMATCH_RECORDED',
      resourceType: 'express_order',
      resourceId: order._id,
      metadata: {
        campusId: order.campusId,
        expectedParcelSize,
        actualParcelSize,
        note: patch.mismatchNote
      }
    })
    return { code: 0, data: staffOrder({ ...order, ...patch }) }
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
    const pickup = rows.flatMap((row) => normalizeExpressPickupItems(row).map((item) => ({ ...row, ...item, pickupPointNameSnapshot: item.pickupPointNameSnapshot || row.pickupPointNameSnapshot || row.pickupPointName }))).sort((a, b) => by(a.pickupPointNameSnapshot || a.pickupPointName, b.pickupPointNameSnapshot || b.pickupPointName) || by(a.pickupCode, b.pickupCode))
    const delivery = rows.slice().sort((a, b) => by(a.deliveryCampusNameSnapshot || a.deliveryCampus, b.deliveryCampusNameSnapshot || b.deliveryCampus) || by(a.dormAreaNameSnapshot || a.dormArea, b.dormAreaNameSnapshot || b.dormArea) || by(a.dormBuildingNameSnapshot || a.dormBuilding, b.dormBuildingNameSnapshot || b.dormBuilding) || by(a.roomNumber, b.roomNumber))
    return { pickup, delivery }
  }

  async function staffExportExpressOrders(openid, data = {}) {
    const auth = await requireStaff(openid, STAFF_PERMISSIONS.EXPRESS_ORDER_EXPORT, data)
    if (auth.code !== 0) return auth
    const rows = (await listScopedOrders(auth.campusId, data)).filter((row) => row.paymentStatus === EXPRESS_PAYMENT_STATUS.PAID && row.orderStatus !== EXPRESS_ORDER_STATUS.CANCELLED)
    const { pickup, delivery } = sortForExport(rows)
    const workbook = new ExcelJS.Workbook()
    const pickupSheet = workbook.addWorksheet('取件清单', { views: [{ state: 'frozen', ySplit: 1 }] })
    pickupSheet.columns = [
      { header: '序号', key: 'index', width: 8 },
      { header: '快递点', key: 'pickupPointName', width: 20 },
      { header: '取件码', key: 'pickupCode', width: 18 },
      { header: '件数', key: 'packageCount', width: 8 },
      { header: '订单号', key: 'orderNo', width: 24 },
      { header: '配送校区', key: 'deliveryCampusName', width: 18 },
      { header: '宿舍楼', key: 'dormBuilding', width: 18 },
      { header: '房间', key: 'roomNumber', width: 12 },
      { header: '备注', key: 'note', width: 30 }
    ]
    pickup.forEach((row, index) => pickupSheet.addRow({ index: index + 1, pickupPointName: row.pickupPointNameSnapshot || row.pickupPointName, pickupCode: row.pickupCode, packageCount: row.packageCount, orderNo: row.orderNo, deliveryCampusName: row.deliveryCampusNameSnapshot || row.deliveryCampus || '未配置', dormBuilding: row.dormBuildingNameSnapshot || row.dormBuilding || '未配置', roomNumber: row.roomNumberSnapshot || row.roomNumber || '', note: row.note || '' }))
    pickupSheet.getRow(1).font = { bold: true }
    pickupSheet.autoFilter = { from: 'A1', to: 'I1' }
    pickupSheet.pageSetup.orientation = 'landscape'
    const deliverySheet = workbook.addWorksheet('配送清单', { views: [{ state: 'frozen', ySplit: 1 }] })
    deliverySheet.columns = [
      { header: '序号', key: 'index', width: 8 },
      { header: '配送校区', key: 'deliveryCampusName', width: 18 },
      { header: '宿舍园区', key: 'dormAreaName', width: 18 },
      { header: '宿舍楼', key: 'dormBuilding', width: 18 },
      { header: '房间', key: 'roomNumber', width: 12 },
      { header: '收件人', key: 'recipientName', width: 16 },
      { header: '手机号', key: 'phone', width: 16 },
      { header: '件数', key: 'packageCount', width: 8 },
      { header: '快递点摘要', key: 'pickupPointSummary', width: 30 },
      { header: '订单号', key: 'orderNo', width: 24 },
      { header: '状态', key: 'orderStatus', width: 14 }
    ]
    delivery.forEach((row, index) => deliverySheet.addRow({ index: index + 1, deliveryCampusName: row.deliveryCampusNameSnapshot || row.deliveryCampus || '未配置', dormAreaName: row.dormAreaNameSnapshot || row.dormArea || '未配置', dormBuilding: row.dormBuildingNameSnapshot || row.dormBuilding, roomNumber: row.roomNumberSnapshot || row.roomNumber, recipientName: row.recipientNameSnapshot || '未填写', phone: row.recipientPhoneSnapshot || row.phone, packageCount: row.totalPackageCount || row.packageCount, pickupPointSummary: summarizePickupPoints(normalizeExpressPickupItems(row).map((item) => ({ ...item, pickupPointNameSnapshot: item.pickupPointNameSnapshot || row.pickupPointNameSnapshot || row.pickupPointName }))), orderNo: row.orderNo, orderStatus: row.orderStatus }))
    deliverySheet.getRow(1).font = { bold: true }
    deliverySheet.autoFilter = { from: 'A1', to: 'K1' }
    deliverySheet.getCell('M1').value = '统计'
    deliverySheet.getCell('M2').value = '订单'
    deliverySheet.getCell('N2').value = delivery.length
    deliverySheet.getCell('M3').value = '包裹'
    deliverySheet.getCell('N3').value = delivery.reduce((sum, row) => sum + (Number(row.totalPackageCount) || Number(row.packageCount) || 0), 0)
    deliverySheet.getCell('M4').value = '取件码'
    deliverySheet.getCell('N4').value = pickup.length
    deliverySheet.getCell('M5').value = '快递点'
    deliverySheet.getCell('N5').value = new Set(pickup.map((row) => row.pickupPointId)).size
    deliverySheet.pageSetup.orientation = 'portrait'
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
      shortName: String(point.shortName || point.name || '').trim().slice(0, 30),
      aliases: Array.from(new Set((Array.isArray(point.aliases) ? point.aliases : []).map((alias) => String(alias || '').trim().slice(0, 30)).filter(Boolean))).slice(0, 10),
      deliveryCampus: String(point.deliveryCampus || '').trim().slice(0, 20),
      address: String(point.address || '').trim().slice(0, 100),
      openingHours: String(point.openingHours || '').trim().slice(0, 50),
      enabled: point.enabled !== false,
      sortOrder: Number(point.sortOrder) || index + 1
    })).filter((point) => point.name) : []
    if (data.acceptingOrders === true && pickupPoints.length === 0) return fail('接单前至少配置一个快递点')
    const settings = {
      _id: campusId,
      schoolId: EXPRESS_DEFAULT_SCHOOL_ID,
      campusId,
      acceptingOrders: data.acceptingOrders === true,
      cutoffTime: String(data.cutoffTime || '').trim().slice(0, 20),
      deliveryWindow: String(data.deliveryWindow || '').trim().slice(0, 60),
      paymentExpireMinutes: Math.min(1440, Math.max(5, Number(data.paymentExpireMinutes) || 30)),
      basePriceCents,
      pricingMode: String(data.pricingMode || 'PER_PACKAGE').trim().slice(0, 30) || 'PER_PACKAGE',
      baseOrderPriceCents: Math.min(10000, Math.max(0, Number(data.baseOrderPriceCents) || 0)),
      perPackagePriceCents: Math.min(10000, Math.max(0, Number(data.perPackagePriceCents ?? basePriceCents) || 0)),
      extraPickupPointPriceCents: Math.min(10000, Math.max(0, Number(data.extraPickupPointPriceCents) || 0)),
      parcelSizePricing: normalizeExpressParcelSizePricing(data.parcelSizePricing),
      pickupPoints,
      deliveryCampuses: cloneDeliveryCampuses(data.deliveryCampuses),
      notice: String(data.notice || '').trim().slice(0, 200),
      specialParcelNotice: String(data.specialParcelNotice || '超重、超大、易碎或特殊物品请先联系工作人员确认是否可配送。').trim().slice(0, 200),
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
    DELIVERY_PROFILES,
    normalizeExpressPickupInput,
    getExpressServiceConfig: getServiceConfig,
    getServiceConfig,
    getExpressQuote,
    getMyExpressDeliveryProfiles,
    createExpressDeliveryProfile,
    updateExpressDeliveryProfile,
    archiveExpressDeliveryProfile,
    setDefaultExpressDeliveryProfile,
    createExpressOrder,
    getMyExpressOrders,
    getMyExpressOrder,
    createExpressTestPayment,
    cancelMyExpressOrder,
    staffGetExpressDashboard,
    staffGetExpressOrders,
    staffGetExpressOrderDetail,
    staffUpdateExpressOrderStatus,
    staffBatchUpdateExpressOrderStatus,
    staffFlagExpressParcelSizeMismatch,
    staffRecordExpressParcelMismatch,
    staffExportExpressOrders,
    ownerUpdateExpressSettings,
    recognizeExpressScreenshots: expressImport.recognizeExpressScreenshots
  }
}

module.exports = createExpressModule
module.exports.ACTION_NAMES = [
  'getExpressServiceConfig',
  'getExpressQuote',
  'getMyExpressDeliveryProfiles',
  'createExpressDeliveryProfile',
  'updateExpressDeliveryProfile',
  'archiveExpressDeliveryProfile',
  'setDefaultExpressDeliveryProfile',
  'createExpressOrder',
  'getMyExpressOrders',
  'getMyExpressOrder',
  'createExpressTestPayment',
  'cancelMyExpressOrder',
  'staffGetExpressDashboard',
  'staffGetExpressOrders',
  'staffGetExpressOrderDetail',
  'staffUpdateExpressOrderStatus',
  'staffBatchUpdateExpressOrderStatus',
  'staffFlagExpressParcelSizeMismatch',
  'staffRecordExpressParcelMismatch',
  'staffExportExpressOrders',
  'ownerUpdateExpressSettings',
  'recognizeExpressScreenshots'
]
