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

  // ================= 公告相关操作 =================

  function announcementIsVisibleNow(item, now = new Date()) {
    if (!item || item.status !== 'published') return false
    const publishAt = item.publishAt ? new Date(item.publishAt) : null
    const expireAt = item.expireAt ? new Date(item.expireAt) : null
    if (publishAt && !Number.isNaN(publishAt.getTime()) && publishAt.getTime() > now.getTime()) return false
    if (expireAt && !Number.isNaN(expireAt.getTime()) && expireAt.getTime() <= now.getTime()) return false
    return true
  }

  function getPublishTs(item) {
    const t = item && item.publishAt ? new Date(item.publishAt).getTime() : 0
    return Number.isFinite(t) ? t : 0
  }

  function sortAnnouncements(list) {
    return (list || []).slice().sort((a, b) => {
      const pinDiff = (b && b.pinTop ? 1 : 0) - (a && a.pinTop ? 1 : 0)
      if (pinDiff !== 0) return pinDiff
      return getPublishTs(b) - getPublishTs(a)
    })
  }

  async function getAnnouncementList(openid, { page = 1, pageSize = 20 } = {}) {
    const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = (uRes.data && uRes.data[0]) || {}
    const campusId = user.campusId || DEFAULT_CAMPUS_ID
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.max(1, Math.min(50, Number(pageSize) || 20))
    const now = new Date()
    let res
    try {
      res = await db.collection('announcements').limit(200).get()
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
      return { code: 0, data: [] }
    }
    const filtered = sortAnnouncements((res.data || []).filter((item) =>
      announcementIsVisibleNow(item, now) && announcementTargetsCampus(item, campusId)
    ))
    const start = (safePage - 1) * safePageSize
    return { code: 0, data: filtered.slice(start, start + safePageSize) }
  }

  async function getAdminAnnouncementList(openid, { page = 1, pageSize = 30 } = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    let res
    try {
      res = await db.collection('announcements')
        .orderBy('createTime', 'desc')
        .skip((Math.max(1, page) - 1) * pageSize)
        .limit(pageSize)
        .get()
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
      return { code: 0, data: [] }
    }
    return { code: 0, data: res.data || [] }
  }

  async function getAnnouncementDetail(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const announcementId = String(data.announcementId || '').trim()
    if (!announcementId) return { code: -1, msg: '缺少公告ID' }
    const res = await db.collection('announcements').doc(announcementId).get().catch(() => ({ data: null }))
    if (!res || !res.data) return { code: -1, msg: '公告不存在' }
    return { code: 0, data: res.data }
  }

  async function createAnnouncement(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const title = String(data.title || '').trim()
    const content = String(data.content || '').trim()
    if (!title) return { code: -1, msg: '公告标题不能为空' }
    if (!content) return { code: -1, msg: '公告内容不能为空' }
    if (helpers.wxTextCheck) {
      const textCheck1 = await helpers.wxTextCheck(openid, title)
      const textCheck2 = await helpers.wxTextCheck(openid, content)
      if (!textCheck1.pass || !textCheck2.pass) return { code: -2, msg: '公告内容未通过安全审核' }
    }
    const images = Array.isArray(data.images)
      ? data.images.filter((x) => typeof x === 'string' && x.trim())
      : []
    if (images.length > 10) return { code: -1, msg: '公告最多上传10张图片' }
    if (images.length && helpers.wxImageBatchCheck) {
      const imgCheck = await helpers.wxImageBatchCheck(openid, images)
      if (!imgCheck.pass) return { code: -2, msg: '公告图片未通过安全审核' }
    }
    const userSnap = helpers.getUserSnapshot ? await helpers.getUserSnapshot(openid) : {}
    const doc = {
      _openid: openid,
      title,
      content,
      images,
      campusIds: normalizeCampusIds(data.campusIds),
      status: data.status === 'published' ? 'published' : 'draft',
      priority: ['normal', 'important', 'urgent'].includes(data.priority) ? data.priority : 'normal',
      pinTop: !!data.pinTop,
      publishAt: data.status === 'published' ? db.serverDate() : null,
      expireAt: data.expireAt ? new Date(data.expireAt) : null,
      createdByOpenid: openid,
      createdByName: userSnap.nickName || '管理员',
      readCount: 0,
      targetCount: 0,
      notifySent: false,
      notifySentAt: null,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    let res
    try {
      res = await db.collection('announcements').add({ data: doc })
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
      await ensureCollection('announcements')
      res = await db.collection('announcements').add({ data: doc })
    }
    return { code: 0, msg: '公告已创建', data: { _id: res._id } }
  }

  async function updateAnnouncement(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const id = String(data.announcementId || '').trim()
    if (!id) return { code: -1, msg: '缺少公告ID' }
    const patch = {}
    if (data.title !== undefined) patch.title = String(data.title || '').trim()
    if (data.content !== undefined) patch.content = String(data.content || '').trim()
    if (data.campusIds !== undefined) patch.campusIds = normalizeCampusIds(data.campusIds)
    if (data.priority !== undefined) patch.priority = ['normal', 'important', 'urgent'].includes(data.priority) ? data.priority : 'normal'
    if (data.pinTop !== undefined) patch.pinTop = !!data.pinTop
    if (data.expireAt !== undefined) patch.expireAt = data.expireAt ? new Date(data.expireAt) : null
    if (data.images !== undefined) {
      patch.images = Array.isArray(data.images)
        ? data.images.filter((x) => typeof x === 'string' && x.trim())
        : []
      if (patch.images.length > 10) return { code: -1, msg: '公告最多上传10张图片' }
    }
    if (patch.title && helpers.wxTextCheck) {
      const c = await helpers.wxTextCheck(openid, patch.title)
      if (!c.pass) return { code: -2, msg: '标题未通过安全审核' }
    }
    if (patch.content && helpers.wxTextCheck) {
      const c = await helpers.wxTextCheck(openid, patch.content)
      if (!c.pass) return { code: -2, msg: '内容未通过安全审核' }
    }
    if (patch.images && patch.images.length && helpers.wxImageBatchCheck) {
      const imgCheck = await helpers.wxImageBatchCheck(openid, patch.images)
      if (!imgCheck.pass) return { code: -2, msg: '公告图片未通过安全审核' }
    }
    patch.updateTime = db.serverDate()
    await db.collection('announcements').doc(id).update({ data: patch })
    return { code: 0, msg: '公告已更新' }
  }

  async function publishAnnouncement(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const id = String(data.announcementId || '').trim()
    if (!id) return { code: -1, msg: '缺少公告ID' }
    const aRes = await db.collection('announcements').doc(id).get().catch(() => ({ data: null }))
    const item = aRes.data
    if (!item) return { code: -1, msg: '公告不存在' }
    await db.collection('announcements').doc(id).update({
      data: { status: 'published', publishAt: db.serverDate(), updateTime: db.serverDate() }
    })
    return { code: 0, msg: '公告已发布' }
  }

  async function revokeAnnouncement(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const id = String(data.announcementId || '').trim()
    if (!id) return { code: -1, msg: '缺少公告ID' }
    await db.collection('announcements').doc(id).update({
      data: { status: 'revoked', updateTime: db.serverDate() }
    })
    return { code: 0, msg: '公告已撤回' }
  }

  async function markAnnouncementRead(openid, data = {}) {
    const announcementId = String(data.announcementId || '').trim()
    if (!announcementId) return { code: -1, msg: '缺少公告ID' }
    const makeDeterministicId = helpers.makeDeterministicId || ((scope, ...parts) => `${scope}_${parts.join('_')}`)
    const readId = makeDeterministicId('annread', openid, announcementId)
    const existingDoc = await db.collection('announcement_reads').doc(readId).get().catch(() => ({ data: null }))
    if (existingDoc && existingDoc.data) return { code: 0, msg: '已读' }

    let added = false
    try {
      await db.collection('announcement_reads').add({
        data: {
          _id: readId,
          _openid: openid,
          announcementId,
          readTime: db.serverDate()
        }
      })
      added = true
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('announcement_reads')
        try {
          await db.collection('announcement_reads').add({
            data: { _id: readId, _openid: openid, announcementId, readTime: db.serverDate() }
          })
          added = true
        } catch (e) {}
      }
    }
    if (added) {
      await db.collection('announcements').doc(announcementId).update({ data: { readCount: _.inc(1) } }).catch(() => {})
    }
    return { code: 0, msg: '已标记已读' }
  }

  async function getUnreadAnnouncementCount(openid) {
    const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = (uRes.data && uRes.data[0]) || {}
    const campusId = user.campusId || DEFAULT_CAMPUS_ID
    const now = new Date()
    let annRes
    try {
      annRes = await db.collection('announcements').limit(200).get()
    } catch (err) {
      if (!isCollectionNotExistError(err)) throw err
      return { code: 0, data: { unreadCount: 0 } }
    }
    const list = (annRes.data || []).filter((item) =>
      announcementIsVisibleNow(item, now) && announcementTargetsCampus(item, campusId)
    )
    if (!list.length) return { code: 0, data: { unreadCount: 0 } }
    const ids = list.map((x) => x._id)
    let readRes
    try {
      readRes = await db.collection('announcement_reads').where({
        _openid: openid,
        announcementId: _.in(ids)
      }).get()
    } catch (err) {
      readRes = { data: [] }
    }
    const readIds = new Set((readRes.data || []).map((r) => r.announcementId))
    const unread = list.filter((item) => !readIds.has(item._id)).length
    return { code: 0, data: { unreadCount: unread } }
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
    endActivityZone,
    createAnnouncement,
    updateAnnouncement,
    publishAnnouncement,
    revokeAnnouncement,
    getAnnouncementList,
    getAdminAnnouncementList,
    getAnnouncementDetail,
    markAnnouncementRead,
    getUnreadAnnouncementCount
  }
}

module.exports = createEventsModule
