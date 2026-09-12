// modules/ride.js - 拼车同行业务模块
// 负责行程发布、拼车广场、行程详情；申请审批/容量事务见同模块后续 slice。
// 状态机与匹配评分见 ../domain/ride.js 与 ../domain/ride-matching.js（纯函数）。
const { getCampusById } = require('../shared/schools')
const { createContentValidator } = require('../shared/content-safety')
const {
  RIDE_STATUS,
  RIDE_REQUEST_STATUS,
  RIDE_DEPARTURE_MODES,
  createRidePostEntity,
  resolveExpiredRideStatus,
  canTransitionRideStatus
} = require('../domain/ride')
const { rankRideMatches } = require('../domain/ride-matching')
const { RIDE_PLACE_CATEGORIES, filterRidePlaces, getHotRidePlaces } = require('../domain/ride-places')
const { deriveDeterministicUserId } = require('../domain/user')
const https = require('https')

// 单校区 OPEN 行程生命周期极短（NOW≤60min，预约≤14天），内存过滤候选上限 200 条
const SQUARE_MAX_CANDIDATES = 200

function publicAuthorId(openid) {
  return openid ? deriveDeterministicUserId(openid) : ''
}

/**
 * 公开输出白名单：剥离发起人 openid，输出确定性 authorId。
 * 绝不返回 openid / numericId / internalUserId / 实时位置。
 */
function publicRidePost(post, viewerOpenid) {
  if (!post) return null
  const { _openid, authorOpenid, authorId, ...safePost } = post
  const remainPeople = Math.max(0, (Number(post.maxPeople) || 0) - (Number(post.currentPeople) || 0))
  return {
    ...safePost,
    id: post._id,
    authorId: publicAuthorId(_openid),
    author: post.author || { nickName: '同学', avatarUrl: '/images/avatar_default.png' },
    remainPeople,
    isFull: (Number(post.currentPeople) || 0) >= (Number(post.maxPeople) || 0),
    isAuthor: !!viewerOpenid && viewerOpenid === _openid
  }
}

function createRideModule({ db, _, cloud, helpers }) {
  const validateUserContent = createContentValidator(helpers)
  const {
    getUserForAction,
    checkRateLimit,
    checkBannedWords,
    wxTextCheck,
    isCollectionNotExistError,
    ensureCollection,
    campusWhereClause,
    resolveCampusIdForRead,
    DEFAULT_CAMPUS_ID,
    escapeRegExp,
    findAuthorsHiddenByBlockRelation,
    viewerBlockedByAuthor,
    conversationBlocked,
    addNotification,
    triggerSubscribeNotify,
    makeDeterministicId,
    grantForOpenids
  } = helpers

  async function getRideDoc(rideId) {
    try {
      const res = await db.collection('ride_posts').doc(rideId).get()
      return (res && res.data) || null
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  /**
   * 惰性过期：读取时发现 OPEN/FULL 已过 expiresAt → 更正为 EXPIRED（尽力而为）
   */
  function lazyExpire(post) {
    const nextStatus = resolveExpiredRideStatus(post)
    if (nextStatus === post.status) return post.status
    db.collection('ride_posts').doc(post._id).update({
      data: { status: nextStatus, updatedAt: db.serverDate() }
    }).catch(() => {})
    post.status = nextStatus
    return post.status
  }

  /**
   * 发布拼车行程。客户端提交的 status / currentPeople / expiresAt 一律忽略。
   */
  async function publishRide(openid, postData = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!postData.origin || !postData.destination) return { code: -1, msg: '请选择出发地和目的地' }

    const note = String(postData.note || '').trim()
    if (note) {
      const safety = await validateUserContent({ openid, text: note })
      if (!safety.pass) return { code: safety.code, msg: safety.reason }
    }

    const canPublish = await checkRateLimit(openid, 'ride_posts', 60, 10)
    if (!canPublish) return { code: -1, msg: '发布太频繁，请稍后再试' }

    let user
    let entity
    try {
      user = await getUserForAction(openid)
      const campusId = resolveCampusIdForRead(postData.campusId || user.campusId || DEFAULT_CAMPUS_ID)
      entity = createRidePostEntity({
        authorId: openid,
        schoolId: (getCampusById(campusId) || {}).schoolId || '',
        campusId,
        departureMode: postData.departureMode,
        origin: postData.origin,
        destination: postData.destination,
        departureTime: postData.departureTime,
        flexibleMinutes: postData.flexibleMinutes,
        maxPeople: postData.maxPeople,
        note
      })
    } catch (err) {
      return { code: -1, msg: err.message || '行程参数不合法' }
    }

    const doc = { _openid: openid, ...entity }
    delete doc.id

    try {
      const res = await db.collection('ride_posts').add({ data: doc })
      await ensureAuthorMember(res._id, openid, user)
      return { code: 0, msg: '发布成功', data: { rideId: res._id } }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('ride_posts')
        const res = await db.collection('ride_posts').add({ data: doc })
        await ensureAuthorMember(res._id, openid, user)
        return { code: 0, msg: '发布成功', data: { rideId: res._id } }
      }
      console.error('publishRide error:', err)
      return { code: -1, msg: '发布失败: ' + err.message }
    }
  }

  async function ensureAuthorMember(rideId, openid, user) {
    try {
      await db.collection('ride_members').add({
        data: {
          _id: makeDeterministicId('ride_mem', rideId, openid),
          rideId,
          _openid: openid,
          role: 'author',
          memberSnapshot: {
            nickName: (user && user.nickName) || '同学',
            avatarUrl: (user && user.avatarUrl) || '/images/avatar_default.png'
          },
          joinedAt: db.serverDate()
        }
      })
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('ensureAuthorMember error:', err)
    }
  }

  function inDayWindow(ms, tab) {
    // Asia/Shanghai 日界（UTC+8），广场「今天/明天」筛选用
    const day = Math.floor((ms + 8 * 3600000) / 86400000)
    const nowDay = Math.floor((Date.now() + 8 * 3600000) / 86400000)
    return tab === 'today' ? day === nowDay : day === nowDay + 1
  }

  /**
   * 拼车广场：tab = all | now | today | tomorrow；keyword 匹配目的地
   */
  async function getRideSquare(data = {}) {
    const { tab = 'all', keyword = '', page = 1, pageSize = 20, campusId, currentOpenid } = data
    const targetCampus = resolveCampusIdForRead(campusId)
    const cw = campusWhereClause(targetCampus)

    const parts = [{ status: RIDE_STATUS.OPEN }]
    if (cw) parts.push(cw)
    let condition
    if (parts.length === 1) condition = parts[0]
    else if (_ && typeof _.and === 'function') condition = _.and(parts)
    else condition = { status: RIDE_STATUS.OPEN, campusId: targetCampus }

    let rows
    try {
      const res = await db.collection('ride_posts')
        .where(condition)
        .orderBy('departureTime', 'asc')
        .limit(SQUARE_MAX_CANDIDATES)
        .get()
      rows = res.data || []
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        return { code: 0, data: { list: [], page: 1, pageSize, hasMore: false } }
      }
      console.error('getRideSquare error:', err)
      return { code: -1, msg: '获取拼车广场失败: ' + err.message }
    }

    const now = Date.now()
    const kw = escapeRegExp(String(keyword || '')).trim()
    const keywordRe = kw ? new RegExp(kw, 'i') : null

    const list = []
    for (const post of rows) {
      if (lazyExpire(post) !== RIDE_STATUS.OPEN) continue
      const departureMs = post.departureTime ? new Date(post.departureTime).getTime() : NaN
      if (!Number.isFinite(departureMs) || departureMs < now - 5 * 60000) continue

      if (tab === 'now' && post.departureMode !== RIDE_DEPARTURE_MODES.NOW) continue
      if ((tab === 'today' || tab === 'tomorrow') && !inDayWindow(departureMs, tab)) continue
      if (keywordRe) {
        const destName = (post.destination && (post.destination.name || post.destination.shortName)) || ''
        if (!keywordRe.test(destName)) continue
      }
      list.push(publicRidePost(post, currentOpenid))
    }

    // Block 关系过滤（公开访问无 openid 时跳过）
    if (currentOpenid && list.length && typeof findAuthorsHiddenByBlockRelation === 'function') {
      const authorOpenids = rows.map(row => row._openid)
      const hidden = await findAuthorsHiddenByBlockRelation(currentOpenid, authorOpenids)
      const hiddenSet = hidden instanceof Set ? hidden : new Set(hidden || [])
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const author = rows.find(row => row._id === list[i].id)
        if (author && hiddenSet.has(author._openid)) list.splice(i, 1)
      }
    }

    const size = Math.max(1, Number(pageSize))
    const skip = (Math.max(1, Number(page)) - 1) * size
    const paged = list.slice(skip, skip + size)
    return { code: 0, data: { list: paged, page: Number(page), pageSize: size, hasMore: skip + paged.length < list.length } }
  }

  /**
   * 行程详情（Block 检查 + viewer 关系态）
   */
  async function getRideById(data = {}) {
    const { rideId, openid } = data
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }
    let post
    try {
      post = await getRideDoc(rideId)
    } catch (err) {
      return { code: -1, msg: '查询失败: ' + err.message }
    }
    if (!post) return { code: -1, msg: '行程不存在或已结束' }

    if (openid && typeof conversationBlocked === 'function') {
      if (await conversationBlocked(openid, post._openid)) {
        return { code: -1, msg: '无法查看该行程' }
      }
    }

    const status = lazyExpire(post)
    const isAuthor = openid === post._openid

    let members = []
    try {
      const res = await db.collection('ride_members')
        .where({ rideId })
        .orderBy('joinedAt', 'asc')
        .limit(20)
        .get()
      members = (res.data || []).map(member => ({
        _id: member._id,
        role: member.role,
        joinedAt: member.joinedAt,
        memberSnapshot: member.memberSnapshot || {},
        memberId: publicAuthorId(member._openid)
      }))
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('getRideById members error:', err)
    }

    let myRequest = null
    const isMember = members.some(member => member.memberId === publicAuthorId(openid))
    if (openid && !isAuthor) {
      try {
        const res = await db.collection('ride_join_requests')
          .where({ rideId, _openid: openid })
          .limit(1)
          .get()
        const row = (res.data || [])[0]
        if (row) myRequest = { _id: row._id, status: row.status, createdAt: row.createdAt }
      } catch (err) {
        if (!isCollectionNotExistError(err)) console.error('getRideById request error:', err)
      }
    }

    return {
      code: 0,
      data: {
        ...publicRidePost(post, openid),
        status,
        members,
        isMember,
        myRequest,
        canChat: isMember
      }
    }
  }

  /**
   * 腾讯位置服务 webservice POI 搜索（TENCENT_LBS_KEY 环境变量配置后启用）。
   * 任何失败都回退到预置目录搜索，不阻塞用户。
   */
  function searchTencentPlaces(keyword) {
    return new Promise(resolve => {
      const key = process.env.TENCENT_LBS_KEY
      if (!key || !keyword) return resolve(null)
      const queryPath = `/ws/place/v1/search?keyword=${encodeURIComponent(keyword)}&boundary=region(${encodeURIComponent('桂林')},0)&page_size=10&page_index=1&key=${encodeURIComponent(key)}`
      const req = https.get({ host: 'apis.map.qq.com', path: queryPath, timeout: 3000 }, res => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw)
            if (!parsed || parsed.status !== 0 || !Array.isArray(parsed.data)) return resolve(null)
            resolve(parsed.data.map(item => ({
              poiId: String(item.id || ''),
              name: item.title || '',
              address: item.address || '',
              latitude: item.location && item.location.lat,
              longitude: item.location && item.location.lng,
              category: 'poi',
              source: 'tencent'
            })))
          } catch (err) {
            resolve(null)
          }
        })
      })
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.on('error', () => resolve(null))
    })
  }

  /**
   * 预置地点目录 + 分类/热门过滤
   */
  async function getRidePlaces(data = {}) {
    const { category = 'all', hot = false } = data
    return {
      code: 0,
      data: {
        categories: RIDE_PLACE_CATEGORIES,
        hotPlaces: getHotRidePlaces(8),
        places: hot ? getHotRidePlaces(8) : filterRidePlaces({ category })
      }
    }
  }

  /**
   * 地点搜索：配置 TENCENT_LBS_KEY 时走腾讯 POI，否则预置目录过滤
   */
  async function searchRidePlaces(data = {}) {
    const { keyword = '', category = 'all' } = data
    const remote = await searchTencentPlaces(String(keyword || '').trim())
    if (remote && remote.length) {
      return { code: 0, data: { places: remote, source: 'tencent' } }
    }
    return { code: 0, data: { places: filterRidePlaces({ keyword, category }), source: 'catalog' } }
  }

  /**
   * 发布成功后的推荐同行列表（仅作者；Top 10，纯函数打分）
   */
  async function getRideMatches(data = {}) {
    const { rideId, openid } = data
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }

    const target = await getRideDoc(rideId)
    if (!target) return { code: -1, msg: '行程不存在或已结束' }
    if (target._openid !== openid) return { code: -1, msg: '仅发起人可查看匹配推荐' }

    const cw = campusWhereClause(target.campusId)
    let rows
    try {
      const condition = cw || {}
      const res = await db.collection('ride_posts')
        .where(condition)
        .orderBy('departureTime', 'asc')
        .limit(SQUARE_MAX_CANDIDATES)
        .get()
      rows = res.data || []
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        return { code: 0, data: { rides: [], matchCount: 0 } }
      }
      console.error('getRideMatches error:', err)
      return { code: -1, msg: '获取匹配失败: ' + err.message }
    }

    const now = Date.now()
    const candidates = []
    for (const row of rows) {
      if (row._id === rideId) continue
      if (lazyExpire(row) !== RIDE_STATUS.OPEN) continue
      candidates.push(row)
    }

    // Block 关系过滤：与作者互拉黑的行程不参与匹配
    let blockedOpenids = new Set()
    if (typeof findAuthorsHiddenByBlockRelation === 'function' && candidates.length) {
      const hidden = await findAuthorsHiddenByBlockRelation(openid, candidates.map(row => row._openid)).catch(() => new Set())
      blockedOpenids = hidden instanceof Set ? hidden : new Set(hidden || [])
    }

    const ranked = rankRideMatches(target, candidates, { now, blockedOpenids, limit: 10 })
    const rides = ranked.map(item => ({
      ...publicRidePost(item.ride, openid),
      matchScore: item.score.total,
      matchPercent: item.percent,
      diffMinutes: item.score.diffMinutes
    }))
    return { code: 0, data: { rides, matchCount: rides.length } }
  }

  function rideRouteText(post) {
    if (!post) return ''
    const origin = (post.origin && (post.origin.shortName || post.origin.name)) || ''
    const destination = (post.destination && (post.destination.shortName || post.destination.name)) || ''
    return `${origin} → ${destination}`
  }

  function publicRequest(request) {
    if (!request) return null
    const { _openid, requesterOpenid, ...safe } = request
    return { ...safe, requesterId: publicAuthorId(_openid) }
  }

  /**
   * 申请加入行程（幂等；Block 检查；不接受客户端提交的状态）
   */
  async function applyRideJoin(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { rideId } = data
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }

    const user = await getUserForAction(openid, { requireActive: true })
    const post = await getRideDoc(rideId)
    if (!post) return { code: -1, msg: '行程不存在或已结束' }
    if (post._openid === openid) return { code: -1, msg: '这是您发布的行程，无需申请' }

    const status = lazyExpire(post)
    if (status !== RIDE_STATUS.OPEN) return { code: -1, msg: '该行程当前不可申请' }
    if ((Number(post.currentPeople) || 0) >= (Number(post.maxPeople) || 0)) {
      return { code: -1, msg: '该行程名额已满' }
    }
    if (typeof conversationBlocked === 'function' && await conversationBlocked(openid, post._openid)) {
      return { code: -1, msg: '无法申请该行程' }
    }

    const canApply = await checkRateLimit(openid, 'ride_join_requests', 60, 30)
    if (!canApply) return { code: -1, msg: '操作太频繁，请稍后再试' }

    const requestId = makeDeterministicId('ride_req', rideId, openid)
    const existing = await db.collection('ride_join_requests').doc(requestId).get().catch(() => ({ data: null }))
    if (existing && existing.data) {
      const current = existing.data.status
      if (current === RIDE_REQUEST_STATUS.PENDING) {
        return { code: 0, msg: '已提交申请，请等待发起人确认', data: { requestId, status: current, already: true } }
      }
      if (current === RIDE_REQUEST_STATUS.ACCEPTED) {
        return { code: -1, msg: '您已加入该行程' }
      }
      if (current === RIDE_REQUEST_STATUS.REJECTED) {
        return { code: -1, msg: '发起人已拒绝，请勿重复申请' }
      }
      // CANCELLED（自己撤销过）→ 重置回 PENDING
      await db.collection('ride_join_requests').doc(requestId).update({
        data: { status: RIDE_REQUEST_STATUS.PENDING, createdAt: db.serverDate(), handledAt: null }
      })
      await notifyRide(post._openid, openid, 'ride_join_request', rideId, '重新申请加入你的拼车行程', rideRouteText(post))
      return { code: 0, msg: '已提交申请', data: { requestId, status: RIDE_REQUEST_STATUS.PENDING } }
    }

    const doc = {
      _id: requestId,
      rideId,
      _openid: openid,
      requesterSnapshot: {
        nickName: user.nickName || '同学',
        avatarUrl: user.avatarUrl || '/images/avatar_default.png'
      },
      status: RIDE_REQUEST_STATUS.PENDING,
      createdAt: db.serverDate(),
      handledAt: null
    }
    try {
      await db.collection('ride_join_requests').add({ data: doc })
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('ride_join_requests')
        await db.collection('ride_join_requests').add({ data: doc })
      } else if (/duplicate|already exist|exists/i.test(err.message || '')) {
        // 并发重复申请 → 幂等成功
        return { code: 0, msg: '已提交申请，请等待发起人确认', data: { requestId, status: RIDE_REQUEST_STATUS.PENDING, already: true } }
      } else {
        throw err
      }
    }
    await notifyRide(post._openid, openid, 'ride_join_request', rideId, '想加入你的拼车行程', rideRouteText(post))
    return { code: 0, msg: '申请已发送', data: { requestId, status: RIDE_REQUEST_STATUS.PENDING } }
  }

  async function notifyRide(toOpenid, fromOpenid, type, rideId, content, routeText) {
    if (typeof addNotification !== 'function') return
    try {
      await addNotification({
        toOpenid,
        fromOpenid,
        type,
        targetType: 'ride',
        targetId: rideId,
        content,
        itemTitle: routeText || ''
      })
    } catch (err) {
      console.error('ride notify error:', err)
    }
  }

  /**
   * 撤销自己的 PENDING 申请
   */
  async function cancelRideJoin(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { rideId } = data
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }
    const requestId = makeDeterministicId('ride_req', rideId, openid)
    const res = await db.collection('ride_join_requests')
      .where({ _id: requestId, _openid: openid, status: RIDE_REQUEST_STATUS.PENDING })
      .update({ data: { status: RIDE_REQUEST_STATUS.CANCELLED, handledAt: db.serverDate() } })
    if (!res || !res.stats || res.stats.updated === 0) {
      return { code: -1, msg: '没有待处理的申请' }
    }
    return { code: 0, msg: '已撤销申请' }
  }

  /**
   * 发起人审批：accept/reject。
   * accept 使用事务保证容量安全：并发接受最后 1 个名额时只有一个成功。
   */
  async function reviewRideJoin(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { requestId, decision } = data
    if (!requestId) return { code: -1, msg: '缺少申请 ID' }
    if (!['accept', 'reject'].includes(decision)) return { code: -1, msg: '无效的审批操作' }

    const reqRes = await db.collection('ride_join_requests').doc(requestId).get().catch(() => ({ data: null }))
    const request = (reqRes && reqRes.data) || null
    if (!request) return { code: -1, msg: '申请不存在' }

    const post = await getRideDoc(request.rideId)
    if (!post) return { code: -1, msg: '行程不存在或已结束' }
    if (post._openid !== openid) return { code: -1, msg: '仅发起人可以处理申请' }

    const requesterOpenid = request._openid
    const routeText = rideRouteText(post)

    if (decision === 'reject') {
      const res = await db.collection('ride_join_requests')
        .where({ _id: requestId, status: RIDE_REQUEST_STATUS.PENDING })
        .update({ data: { status: RIDE_REQUEST_STATUS.REJECTED, handledAt: db.serverDate() } })
      if (!res || !res.stats || res.stats.updated === 0) {
        return { code: -1, msg: '该申请已处理' }
      }
      await notifyRide(requesterOpenid, openid, 'ride_join_rejected', post._id, '你的拼车申请未被通过', routeText)
      return { code: 0, msg: '已拒绝申请', data: { status: RIDE_REQUEST_STATUS.REJECTED } }
    }

    // accept：事务内完成 申请认领 + 容量校验 + 人数推进
    try {
      const transaction = await db.startTransaction()
      const txReqRes = await transaction.collection('ride_join_requests').doc(requestId).get()
      const txRequest = (txReqRes && txReqRes.data) || null
      if (!txRequest || txRequest.status !== RIDE_REQUEST_STATUS.PENDING) {
        await transaction.rollback()
        return { code: -1, msg: '该申请已处理' }
      }
      const txRideRes = await transaction.collection('ride_posts').doc(txRequest.rideId).get()
      const txPost = (txRideRes && txRideRes.data) || null
      if (!txPost) {
        await transaction.rollback()
        return { code: -1, msg: '行程不存在或已结束' }
      }
      if (txPost._openid !== openid) {
        await transaction.rollback()
        return { code: -1, msg: '仅发起人可以处理申请' }
      }
      const currentPeople = Number(txPost.currentPeople) || 0
      const maxPeople = Number(txPost.maxPeople) || 0
      if (txPost.status !== RIDE_STATUS.OPEN) {
        await transaction.rollback()
        return { code: -1, msg: '该行程当前不可加入' }
      }
      if (currentPeople >= maxPeople) {
        await transaction.rollback()
        return { code: -1, msg: '名额已满，无法再通过新成员' }
      }

      await transaction.collection('ride_join_requests').doc(requestId).update({
        data: { status: RIDE_REQUEST_STATUS.ACCEPTED, handledAt: db.serverDate() }
      })

      const nextCount = currentPeople + 1
      const rideUpdate = { currentPeople: nextCount, updatedAt: db.serverDate() }
      if (nextCount >= maxPeople) rideUpdate.status = RIDE_STATUS.FULL
      await transaction.collection('ride_posts').doc(txRequest.rideId).update({ data: rideUpdate })
      await transaction.commit()

      await ensureMemberDoc(txRequest.rideId, requesterOpenid, txRequest.requesterSnapshot)
      if (typeof grantForOpenids === 'function') {
        // RIDE Contact Grant：接受后双方建立联系，可私信
        await grantForOpenids(openid, requesterOpenid, 'RIDE', txRequest.rideId).catch(() => {})
      }
      await notifyRide(requesterOpenid, openid, 'ride_join_accepted', txRequest.rideId, '你的拼车申请已通过', routeText)
      return {
        code: 0,
        msg: '已通过申请',
        data: { status: RIDE_REQUEST_STATUS.ACCEPTED, currentPeople: nextCount, rideStatus: nextCount >= maxPeople ? RIDE_STATUS.FULL : RIDE_STATUS.OPEN }
      }
    } catch (err) {
      console.error('reviewRideJoin transaction error:', err)
      return { code: -1, msg: '处理审批失败: ' + err.message }
    }
  }

  async function ensureMemberDoc(rideId, memberOpenid, snapshot) {
    try {
      await db.collection('ride_members').doc(makeDeterministicId('ride_mem', rideId, memberOpenid)).set({
        data: {
          rideId,
          _openid: memberOpenid,
          role: 'member',
          memberSnapshot: snapshot || { nickName: '同学', avatarUrl: '/images/avatar_default.png' },
          joinedAt: db.serverDate()
        }
      })
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('ensureMemberDoc error:', err)
    }
  }

  /**
   * 成员出发前退出：回补名额，FULL → OPEN
   */
  async function leaveRide(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { rideId } = data
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }

    const post = await getRideDoc(rideId)
    if (!post) return { code: -1, msg: '行程不存在或已结束' }
    if (post._openid === openid) return { code: -1, msg: '发起人不能退出，请取消行程' }

    const memberRes = await db.collection('ride_members')
      .where({ rideId, _openid: openid, role: 'member' })
      .limit(1)
      .get()
    if (!memberRes.data || memberRes.data.length === 0) {
      return { code: -1, msg: '您不是该行程成员' }
    }

    try {
      const transaction = await db.startTransaction()
      const txRideRes = await transaction.collection('ride_posts').doc(rideId).get()
      const txPost = (txRideRes && txRideRes.data) || null
      if (!txPost) {
        await transaction.rollback()
        return { code: -1, msg: '行程不存在或已结束' }
      }
      if (![RIDE_STATUS.OPEN, RIDE_STATUS.FULL].includes(txPost.status)) {
        await transaction.rollback()
        return { code: -1, msg: '行程已出发或结束，无法退出' }
      }
      const currentPeople = Number(txPost.currentPeople) || 0
      if (currentPeople <= 1) {
        await transaction.rollback()
        return { code: -1, msg: '人数异常，无法退出' }
      }
      const nextCount = currentPeople - 1
      const rideUpdate = { currentPeople: nextCount, updatedAt: db.serverDate() }
      if (txPost.status === RIDE_STATUS.FULL && nextCount < (Number(txPost.maxPeople) || 0)) {
        rideUpdate.status = RIDE_STATUS.OPEN
      }
      await transaction.collection('ride_posts').doc(rideId).update({ data: rideUpdate })
      await transaction.commit()

      for (const member of memberRes.data) {
        await db.collection('ride_members').doc(member._id).remove().catch(() => {})
      }
      await notifyRide(post._openid, openid, 'ride_member_left', rideId, '退出了你的拼车行程', rideRouteText(post))
      return { code: 0, msg: '已退出行程', data: { currentPeople: nextCount } }
    } catch (err) {
      console.error('leaveRide transaction error:', err)
      return { code: -1, msg: '退出行程失败: ' + err.message }
    }
  }

  /**
   * 发起人状态操作：depart / complete / cancel（服务端状态机校验）
   */
  async function updateRideStatus(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { rideId, action } = data
    if (!rideId || !action) return { code: -1, msg: '参数缺失' }
    const actionMap = { depart: RIDE_STATUS.DEPARTED, complete: RIDE_STATUS.COMPLETED, cancel: RIDE_STATUS.CANCELLED }
    const targetStatus = actionMap[action]
    if (!targetStatus) return { code: -1, msg: '无效的操作' }

    const post = await getRideDoc(rideId)
    if (!post) return { code: -1, msg: '行程不存在或已结束' }
    if (post._openid !== openid) return { code: -1, msg: '仅发起人可以操作' }

    lazyExpire(post)
    if (!canTransitionRideStatus(post.status, targetStatus)) {
      return { code: -1, msg: '当前状态无法执行该操作' }
    }

    await db.collection('ride_posts').doc(rideId).update({
      data: { status: targetStatus, updatedAt: db.serverDate() }
    })

    const routeText = rideRouteText(post)
    if (action === 'cancel') {
      // 通知已接受成员 + 拒绝残余 PENDING 申请
      try {
        const members = await db.collection('ride_members')
          .where({ rideId, role: 'member' })
          .limit(20)
          .get()
        for (const member of (members.data || [])) {
          await notifyRide(member._openid, openid, 'ride_cancelled', rideId, '发起人取消了拼车行程', routeText)
        }
        const pendings = await db.collection('ride_join_requests')
          .where({ rideId, status: RIDE_REQUEST_STATUS.PENDING })
          .limit(20)
          .get()
        for (const pending of (pendings.data || [])) {
          await db.collection('ride_join_requests').doc(pending._id).update({
            data: { status: RIDE_REQUEST_STATUS.REJECTED, handledAt: db.serverDate() }
          }).catch(() => {})
          await notifyRide(pending._openid, openid, 'ride_join_rejected', rideId, '行程已取消，申请自动关闭', routeText)
        }
      } catch (err) {
        console.error('cancel ride notify error:', err)
      }
    }

    return { code: 0, msg: '操作成功', data: { status: targetStatus } }
  }

  /**
   * 成员/发起人建立联系（RIDE Contact Grant）
   */
  async function startRideContact(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { rideId } = data
    if (!rideId) return { code: -1, msg: '缺少行程 ID' }
    if (typeof grantForOpenids !== 'function') return { code: -1, msg: '联系服务不可用' }

    const post = await getRideDoc(rideId)
    if (!post) return { code: -1, msg: '行程不存在或已结束' }

    let memberOpenids = [post._openid]
    try {
      const members = await db.collection('ride_members')
        .where({ rideId })
        .limit(20)
        .get()
      memberOpenids = (members.data || []).map(member => member._openid)
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('startRideContact members error:', err)
    }

    // 客户端只持有公开 targetUserId（确定性 UUID）；在此解析回内部 openid
    const targetUserId = typeof data.targetUserId === 'string' ? data.targetUserId : ''
    const targetOpenidRaw = typeof data.targetOpenid === 'string' ? data.targetOpenid : ''
    let resolvedTarget = memberOpenids.find(mo => mo === targetOpenidRaw || (targetUserId && publicAuthorId(mo) === targetUserId)) || ''
    if (!resolvedTarget) return { code: -1, msg: '缺少联系人' }
    if (!memberOpenids.includes(openid)) {
      return { code: -1, msg: '仅行程成员可以互相联系' }
    }
    if (typeof conversationBlocked === 'function' && await conversationBlocked(openid, resolvedTarget)) {
      return { code: -1, msg: '无法与对方建立联系' }
    }

    const grantResult = await grantForOpenids(openid, resolvedTarget, 'RIDE', rideId)
    if (!grantResult || grantResult.code !== 0) {
      return (grantResult && grantResult.code === 0) ? grantResult : { code: -1, msg: (grantResult && grantResult.msg) || '无法建立联系' }
    }
    return { code: 0, msg: 'ok', data: { targetUserId: (grantResult.data && grantResult.data.targetUserId) || targetUserId } }
  }

  /**
   * 我的行程：published / joined
   */
  async function getMyRides(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { tab = 'published' } = data
    const now = Date.now()

    if (tab === 'joined') {
      let memberships = []
      try {
        const res = await db.collection('ride_members')
          .where({ _openid: openid, role: 'member' })
          .orderBy('joinedAt', 'desc')
          .limit(50)
          .get()
        memberships = res.data || []
      } catch (err) {
        if (!isCollectionNotExistError(err)) console.error('getMyRides members error:', err)
      }
      const rides = []
      for (const membership of memberships) {
        const post = await getRideDoc(membership.rideId).catch(() => null)
        if (!post) continue
        lazyExpire(post)
        rides.push({ ...publicRidePost(post, openid), myRole: 'member' })
      }
      return { code: 0, data: { rides } }
    }

    let rows = []
    try {
      const res = await db.collection('ride_posts')
        .where({ _openid: openid })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
      rows = res.data || []
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('getMyRides published error:', err)
    }
    const rides = []
    for (const post of rows) {
      lazyExpire(post)
      rides.push({ ...publicRidePost(post, openid), myRole: 'author' })
    }
    return { code: 0, data: { rides } }
  }

  /**
   * 申请管理：received（我收到的）/ sent（我发出的）
   */
  async function getRideRequests(openid, data = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const { tab = 'received' } = data

    if (tab === 'sent') {
      let requests = []
      try {
        const res = await db.collection('ride_join_requests')
          .where({ _openid: openid })
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get()
        requests = res.data || []
      } catch (err) {
        if (!isCollectionNotExistError(err)) console.error('getRideRequests sent error:', err)
      }
      const list = []
      for (const request of requests) {
        const post = await getRideDoc(request.rideId).catch(() => null)
        list.push({
          ...publicRequest(request),
          ride: post ? { id: post._id, routeText: rideRouteText(post), departureTime: post.departureTime, status: post.status } : null
        })
      }
      return { code: 0, data: { list } }
    }

    let myRides = []
    try {
      const res = await db.collection('ride_posts')
        .where({ _openid: openid })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
      myRides = res.data || []
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('getRideRequests received error:', err)
    }
    if (!myRides.length) return { code: 0, data: { list: [] } }
    const rideIds = myRides.map(ride => ride._id)
    const rideById = new Map(myRides.map(ride => [ride._id, ride]))

    let requests = []
    try {
      const res = await db.collection('ride_join_requests')
        .where({ rideId: _.in(rideIds) })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
      requests = res.data || []
    } catch (err) {
      if (!isCollectionNotExistError(err)) console.error('getRideRequests received list error:', err)
    }
    const list = []
    for (const request of requests) {
      const post = rideById.get(request.rideId)
      if (!post) continue
      list.push({
        ...publicRequest(request),
        ride: { id: post._id, routeText: rideRouteText(post), departureTime: post.departureTime, status: post.status }
      })
    }
    return { code: 0, data: { list } }
  }

  return {
    publishRide,
    getRideSquare,
    getRideById,
    getRidePlaces,
    searchRidePlaces,
    getRideMatches,
    applyRideJoin,
    cancelRideJoin,
    reviewRideJoin,
    leaveRide,
    updateRideStatus,
    startRideContact,
    getMyRides,
    getRideRequests
  }
}

module.exports = createRideModule
