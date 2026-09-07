// modules/events.js - 校园活动与活动专区业务模块
// 拆分自 dbOperations/index.js，保持 100% 协议与行为兼容

function createEventsModule({ db, _, cloud, helpers }) {
  const {
    isCollectionNotExistError,
    ensureCollection,
    activityZoneCore,
    checkAdmin,
    resolveCampusIdForRead,
    DEFAULT_CAMPUS_ID,
    announcementTargetsCampus,
    normalizeCampusIds
  } = helpers

  async function fetchActivityZoneConfigDoc() {
    try {
      const res = await db.collection('activity_zone').doc('config').get()
      return (res && res.data) || null
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  /** set 不支持 _.remove()，写入前剔除 Command 字段 */
  function sanitizeActivityZoneConfigForSet(doc) {
    const clean = {}
    Object.keys(doc || {}).forEach((key) => {
      const val = doc[key]
      if (val === undefined) return
      if (val && typeof val === 'object' && typeof val.operator === 'string') return
      clean[key] = val
    })
    return clean
  }

  async function persistActivityZoneConfig(doc) {
    const clean = sanitizeActivityZoneConfigForSet(doc)
    try {
      await db.collection('activity_zone').doc('config').set({ data: clean })
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
      await ensureCollection('activity_zone')
      await db.collection('activity_zone').doc('config').set({ data: clean })
    }
  }

  async function resolveActivityTagsForPost(campusId, category, existingPost = null) {
    const cat = String(category || '').trim()
    if (cat !== '校园活动') {
      return { inActivityZone: false, activityRoundId: _.remove() }
    }
    let zoneDoc = await fetchActivityZoneConfigDoc()
    await maybeAutoFinalizeActivityZone(zoneDoc)
    zoneDoc = await fetchActivityZoneConfigDoc()
    if (!activityZoneCore.isActivityZoneRunning(zoneDoc)) {
      return { inActivityZone: false, activityRoundId: _.remove() }
    }
    if (!activityZoneCore.announcementTargetsCampus(zoneDoc, campusId)) {
      return { inActivityZone: false, activityRoundId: _.remove() }
    }
    const roundId = String(zoneDoc.roundId || '')
    if (!roundId) {
      return { inActivityZone: false, activityRoundId: _.remove() }
    }
    if (
      existingPost &&
      existingPost.inActivityZone === true &&
      String(existingPost.activityRoundId || '') === roundId
    ) {
      return { inActivityZone: true, activityRoundId: roundId }
    }
    return { inActivityZone: true, activityRoundId: roundId }
  }

  async function convertActivityPostsToNormal(zoneDoc) {
    const roundId = String(zoneDoc.roundId || '')
    const campusIds = activityZoneCore.normalizeCampusIds(zoneDoc.campusIds)
    const whereCond = activityZoneCore.buildFinalizePostWhere(campusIds, roundId, _)
    const BATCH = 100
    let converted = 0
    let rounds = 0
    while (rounds < 200) {
      rounds += 1
      const res = await db.collection('posts').where(whereCond).limit(BATCH).get()
      const rows = res.data || []
      if (!rows.length) break
      await Promise.all(
        rows.map((row) =>
          db.collection('posts').doc(row._id).update({
            data: {
              category: '校园生活',
              inActivityZone: false,
              activityRoundId: _.remove(),
              activityEndedAt: db.serverDate()
            }
          })
        )
      )
      converted += rows.length
      if (rows.length < BATCH) break
    }
    return converted
  }

  async function finalizeActivityZoneRound(triggeredByOpenid, reason = 'manual') {
    const zoneDoc = await fetchActivityZoneConfigDoc()
    if (!zoneDoc || !zoneDoc.enabled) {
      return { code: -1, msg: '当前没有进行中的活动' }
    }
    const converted = await convertActivityPostsToNormal(zoneDoc)
    const nextRoundId = String(Date.now())
    const nextDoc = {
      enabled: false,
      campusIds: Array.isArray(zoneDoc.campusIds) ? zoneDoc.campusIds : ['all'],
      slides: [],
      roundId: nextRoundId,
      lastEndedAt: db.serverDate(),
      lastEndedBy: triggeredByOpenid || '',
      lastEndReason: reason,
      lastConvertedCount: converted,
      updateTime: db.serverDate(),
      updatedByOpenid: triggeredByOpenid || 'system'
    }
    await persistActivityZoneConfig(nextDoc)
    return {
      code: 0,
      msg: `本期活动已结束，${converted} 篇帖子已转为普通帖，专区已清空`,
      data: { converted, roundId: nextRoundId }
    }
  }

  async function maybeAutoFinalizeActivityZone(zoneDoc) {
    if (!zoneDoc || !zoneDoc.enabled) return null
    const endAt = activityZoneCore.parseActivityEndAt(zoneDoc.endAt)
    if (!endAt || endAt.getTime() > Date.now()) return null
    try {
      return await finalizeActivityZoneRound(zoneDoc.updatedByOpenid || 'system', 'auto_endAt')
    } catch (err) {
      console.error('[maybeAutoFinalizeActivityZone]', err)
      return { code: -1, msg: (err && err.message) || '自动结束活动失败' }
    }
  }

  async function getActivityZone(openid, data = {}) {
    let campusId = resolveCampusIdForRead(data)
    if (!campusId) {
      const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
      const user = (uRes.data && uRes.data[0]) || {}
      campusId = user.campusId || DEFAULT_CAMPUS_ID
    }
    let doc = await fetchActivityZoneConfigDoc()
    await maybeAutoFinalizeActivityZone(doc)
    doc = await fetchActivityZoneConfigDoc()
    if (!activityZoneCore.isActivityZoneRunning(doc)) return { code: 0, data: null }
    if (!announcementTargetsCampus(doc, campusId)) return { code: 0, data: null }
    const slides = Array.isArray(doc.slides)
      ? doc.slides.filter((s) => s && (String(s.image || '').trim() || String(s.title || '').trim()))
      : []
    if (!slides.length) return { code: 0, data: null }
    const endAt = activityZoneCore.parseActivityEndAt(doc.endAt)
    return {
      code: 0,
      data: {
        slides,
        roundId: String(doc.roundId || ''),
        endAt: endAt ? endAt.toISOString() : null
      }
    }
  }

  async function getActivityZoneAdmin(openid) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    let doc = await fetchActivityZoneConfigDoc()
    await maybeAutoFinalizeActivityZone(doc)
    doc = await fetchActivityZoneConfigDoc()
    const base = activityZoneCore.adminDataFromDoc(doc)
    let activePostCount = 0
    if (base.activityRunning && base.roundId) {
      try {
        const whereCond = activityZoneCore.buildFinalizePostWhere(base.campusIds, base.roundId, _)
        const cnt = await db.collection('posts').where(whereCond).count()
        activePostCount = cnt.total || 0
      } catch (err) {
        console.warn('[getActivityZoneAdmin] count posts:', err && err.message)
      }
    }
    return { code: 0, data: { ...base, activePostCount } }
  }

  async function saveActivityZone(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const prev = await fetchActivityZoneConfigDoc()
    const enabled = !!data.enabled
    const campusIds = normalizeCampusIds(data.campusIds)
    const slidesIn = Array.isArray(data.slides) ? data.slides : []
    if (slidesIn.length > 10) return { code: -1, msg: '轮播最多 10 张' }
    const slides = slidesIn.map((s) => ({
      image: String(s.image || '').trim(),
      title: String(s.title || '').trim().slice(0, 80),
      subtitle: String(s.subtitle || '').trim().slice(0, 120),
      content: String(s.content || '').trim().slice(0, 2000),
      activityTime: String(s.activityTime || '').trim().slice(0, 300),
      participation: String(s.participation || '').trim().slice(0, 800),
      rewards: String(s.rewards || '').trim().slice(0, 800),
      ctaText: String(s.ctaText || '').trim().slice(0, 16) || '了解详情'
    })).filter((s) => s.image || s.title)

    const startNewRound = !!data.startNewRound
    const prevRunning = activityZoneCore.isActivityZoneRunning(prev)
    let roundId = prev && prev.roundId ? String(prev.roundId) : ''
    if (startNewRound || (enabled && !prevRunning)) {
      roundId = String(Date.now())
    } else if (enabled && !roundId) {
      roundId = String(Date.now())
    }

    let endAt = activityZoneCore.parseActivityEndAt(data.endAt)
    if (data.endAt === null || data.endAt === '') {
      endAt = null
    }

    const doc = {
      enabled,
      campusIds,
      slides,
      roundId,
      updateTime: db.serverDate(),
      updatedByOpenid: openid
    }
    if (endAt) {
      doc.endAt = endAt
    }
    if (prev && prev.lastEndedAt) doc.lastEndedAt = prev.lastEndedAt

    await persistActivityZoneConfig(doc)

    if (enabled && endAt && endAt.getTime() <= Date.now()) {
      return await finalizeActivityZoneRound(openid, 'save_past_endAt')
    }
    return { code: 0, msg: '已保存活动专区配置', data: { roundId, endAt: endAt ? endAt.toISOString() : null } }
  }

  async function endActivityZone(openid) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    return finalizeActivityZoneRound(openid, 'manual')
  }

  return {
    fetchActivityZoneConfigDoc,
    sanitizeActivityZoneConfigForSet,
    persistActivityZoneConfig,
    resolveActivityTagsForPost,
    convertActivityPostsToNormal,
    finalizeActivityZoneRound,
    maybeAutoFinalizeActivityZone,
    getActivityZone,
    getActivityZoneAdmin,
    saveActivityZone,
    endActivityZone
  }
}

module.exports = createEventsModule
