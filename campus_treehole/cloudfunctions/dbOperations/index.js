const { resolveUserOpenid } = require('./shared/user-identity')
const { sanitizePublicPost, sanitizePublicUser } = require('./shared/public-data')
const schoolDirectory = require('./shared/schools')
// 数据库操作云函数 - 统一处理所有 CRUD 操作
// 已实现高聚合低耦合的模块化架构 (modules/)，保持 100% API 契约向后兼容
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 生成确定性 _id，配合 doc().get/set 实现幂等写入，防止并发重复
function makeDeterministicId(scope, ...parts) {
  const raw = [scope, ...parts.map((p) => String(p == null ? '' : p))].join('|')
  return `${scope}_${crypto.createHash('md5').update(raw).digest('hex')}`
}

const { buildMarketCategoryWhere, normalizePublishCategory } = require('./marketCategories')
const activityZoneCore = require('./activityZoneCore')
const {
  DEFAULT_CAMPUS_ID,
  resolveCampusIdForRead,
  campusWhereClause: sharedCampusWhereClause
} = require('./shared/campus')

function campusWhereClause(campusId) {
  return sharedCampusWhereClause(_, campusId)
}

// 错误判断与集合自动保障
function isCollectionNotExistError(err) {
  if (!err) return false
  const raw = (err && (err.errMsg || err.message || '')) + ''
  return /not exist|DATABASE_COLLECTION_NOT_EXIST|not exists/i.test(raw)
}

function isUserBlocksUnavailableError(err) {
  if (!err) return false
  const raw = (err && (err.errMsg || err.message || '')) + ''
  return /not exist|DATABASE_COLLECTION_NOT_EXIST|not exists|-501001/i.test(raw)
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    const raw = (err && (err.errMsg || err.message || '')) + ''
    if (/already exist|exists/i.test(raw)) return
    console.warn(`[ensureCollection] 创建集合 ${name} 异常:`, err)
  }
}

// ========== 业务模块导入与按需懒加载 ==========
const createMarketModule = require('./modules/market')
let marketModuleInstance = null
function getMarketModule() {
  if (!marketModuleInstance) {
    marketModuleInstance = createMarketModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        checkRateLimit,
        checkAdmin,
        checkBannedWords,
        wxTextCheck,
        wxImageBatchCheck,
        findAuthorsHiddenByBlockRelation: (v, ids) => getSafetyModule().findAuthorsHiddenByBlockRelation(v, ids),
        contentDetailBlocked: (v, o) => getSafetyModule().contentDetailBlocked(v, o),
        viewerBlockedByAuthor: (v, a) => getSafetyModule().viewerBlockedByAuthor(v, a),
        addNotification,
        triggerSubscribeNotify,
        trimSnippet,
        makeDeterministicId,
        DEFAULT_CAMPUS_ID,
        resolveCampusIdForRead,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        escapeRegExp,
        buildMarketCategoryWhere,
        normalizePublishCategory
      }
    })
  }
  return marketModuleInstance
}

const createEventsModule = require('./modules/events')
let eventsModuleInstance = null
function getEventsModule() {
  if (!eventsModuleInstance) {
    eventsModuleInstance = createEventsModule({
      db,
      _,
      cloud,
      helpers: {
        isCollectionNotExistError,
        ensureCollection,
        activityZoneCore,
        checkAdmin,
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID,
        announcementTargetsCampus: (doc, campusId) => (doc && doc.campusIds ? (doc.campusIds.includes('all') || doc.campusIds.includes(campusId)) : true),
        normalizeCampusIds: (ids) => activityZoneCore.normalizeCampusIds(ids),
        wxTextCheck,
        wxImageBatchCheck,
        getUserSnapshot,
        triggerSubscribeNotify,
        trimSnippet,
        makeDeterministicId
      }
    })
  }
  return eventsModuleInstance
}

const createBuddiesModule = require('./modules/buddies')
let buddiesModuleInstance = null
function getBuddiesModule() {
  if (!buddiesModuleInstance) {
    buddiesModuleInstance = createBuddiesModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        checkRateLimit,
        checkBannedWords,
        wxTextCheck,
        isCollectionNotExistError,
        ensureCollection,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID,
        escapeRegExp,
        triggerSubscribeNotify
      }
    })
  }
  return buddiesModuleInstance
}

const createBridgeModule = require('./modules/bridge')
const createCampusNowModule = require('./modules/campus-now')
let bridgeModuleInstance = null
function getCampusNowModule() {
  if (!_campusNowModule) {
    _campusNowModule = createCampusNowModule({
      db,
      _,
      cloud,
      helpers: {
        resolveCampusIdForRead,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        DEFAULT_CAMPUS_ID
      }
    })
  }
  return _campusNowModule
}

function getBridgeModule() {
  if (!bridgeModuleInstance) {
    bridgeModuleInstance = createBridgeModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        isCollectionNotExistError,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID
      }
    })
  }
  return bridgeModuleInstance
}

const createMutualModule = require('./modules/mutual')
let mutualModuleInstance = null
function getMutualModule() {
  if (!mutualModuleInstance) {
    mutualModuleInstance = createMutualModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        checkBannedWords,
        wxTextCheck,
        wxImageBatchCheck,
        isCollectionNotExistError,
        ensureCollection,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID,
        escapeRegExp,
        checkAdmin
      }
    })
  }
  return mutualModuleInstance
}

const createSafetyModule = require('./modules/safety')
let safetyModuleInstance = null
function getSafetyModule() {
  if (!safetyModuleInstance) {
    safetyModuleInstance = createSafetyModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        isCollectionNotExistError,
        isUserBlocksUnavailableError,
        getUsersByOpenids,
        checkAdmin
      }
    })
  }
  return safetyModuleInstance
}

const createUsersModule = require('./modules/users')
let usersModuleInstance = null
function getUsersModule() {
  if (!usersModuleInstance) {
    usersModuleInstance = createUsersModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        getUsersByOpenids,
        checkAdmin,
        checkBannedWords,
        wxTextCheck,
        wxImageCheck,
        escapeRegExp,
        DEFAULT_CAMPUS_ID,
        conversationBlocked: (a, b) => getSafetyModule().conversationBlocked(a, b),
        viewerBlockedByAuthor: (v, a) => getSafetyModule().viewerBlockedByAuthor(v, a),
        addNotification,
        USER_BLOCKS: 'user_blocks',
        safeUserBlocksQuery: (run) => getSafetyModule().safeUserBlocksQuery(run),
        isCollectionNotExistError,
        getMarketModule
      }
    })
  }
  return usersModuleInstance
}

const createMessagesModule = require('./modules/messages')
let messagesModuleInstance = null
function getMessagesModule() {
  if (!messagesModuleInstance) {
    messagesModuleInstance = createMessagesModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        getUsersByOpenids,
        checkRateLimit,
        checkBannedWords,
        wxTextCheck,
        wxImageCheck,
        publicId,
        triggerSubscribeNotify,
        trimSnippet,
        conversationBlocked: (a, b) => getSafetyModule().conversationBlocked(a, b),
        USER_BLOCKS: 'user_blocks',
        safeUserBlocksQuery: (run) => getSafetyModule().safeUserBlocksQuery(run),
        checkAdmin
      }
    })
  }
  return messagesModuleInstance
}

const createHeartModule = require('./modules/heart')
let heartModuleInstance
function getHeartModule() {
  if (!heartModuleInstance) heartModuleInstance = createHeartModule({db, _, cloud, helpers: {
    getUserForAction, checkBannedWords, wxTextCheck, wxImageBatchCheck,
    findAuthorsHiddenByBlockRelation: (a,ids) => getSafetyModule().findAuthorsHiddenByBlockRelation(a,ids),
    conversationBlocked: (a,b) => getSafetyModule().conversationBlocked(a,b)
  }})
  return heartModuleInstance
}

const createPostsModule = require('./modules/posts')
let postsModuleInstance = null
function getPostsModule() {
  if (!postsModuleInstance) {
    postsModuleInstance = createPostsModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction,
        checkRateLimit,
        checkAdmin,
        checkBannedWords,
        wxTextCheck,
        wxImageBatchCheck,
        findAuthorsHiddenByBlockRelation: (v, ids) => getSafetyModule().findAuthorsHiddenByBlockRelation(v, ids),
        contentDetailBlocked: (v, o) => getSafetyModule().contentDetailBlocked(v, o),
        viewerBlockedByAuthor: (v, a) => getSafetyModule().viewerBlockedByAuthor(v, a),
        addNotification,
        triggerSubscribeNotify,
        trimSnippet,
        makeDeterministicId,
        DEFAULT_CAMPUS_ID,
        resolveCampusIdForRead,
        campusWhereClause: (cid) => sharedCampusWhereClause(_, cid),
        escapeRegExp,
        getEventsModule
      }
    })
  }
  return postsModuleInstance
}

const createWebAdminDispatch = require('./webAdminHandlers')
const webAdminDispatch = createWebAdminDispatch(db, _, cloud, {
  triggerSubscribeNotify: (payload) => triggerSubscribeNotify(payload)
})

// ========== 通用基础设施与鉴权工具 ==========

function getOpenidFromContext() {
  try {
    const { OPENID } = cloud.getWXContext()
    return OPENID || ''
  } catch (e) {
    return ''
  }
}

function getOpenid(context) {
  const openid = getOpenidFromContext()
  if (!openid) throw new Error('未授权访问')
  return openid
}

const PUBLIC_READ_ACTIONS = new Set([
  'getPosts',
  'getPostById',
  'getComments',
  'getMarketGoods',
  'getMarketGoodsById',
  'getMarketComments',
  'getBuddyPosts',
  'getBuddyPostById',
  'getLanguagePartners',
  'getLanguagePartnerProfile',
  'getMutualPosts',
  'getMutualPostById',
  'getAnnouncementList',
  'getActivityZone',
  'getCampusNowSummary'
])

async function checkAdmin(openid) {
  const res = await db.collection('users').where({ _openid: openid, role: 'admin', status: 'active' }).get()
  return res.data.length > 0
}

async function checkRateLimit(openid, collection, minutes, maxCount) {
  const timeAgo = new Date(Date.now() - minutes * 60 * 1000)
  try {
    const res = await db.collection(collection).where({
      _openid: openid,
      createTime: _.gte(timeAgo)
    }).count()
    return res.total < maxCount
  } catch (err) {
    if (isCollectionNotExistError(err)) return true
    console.error('[checkRateLimit] 频率检查异常，按已达上限处理:', err)
    return false
  }
}

async function getUserForAction(openid, { requireActive = true } = {}) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const user = res.data[0]
  if (!user) throw new Error('用户不存在')

  if (user.status === 'banned' && user.banExpiry) {
    const now = Date.now()
    const expire = new Date(user.banExpiry).getTime()
    if (!Number.isNaN(expire) && now > expire) {
      await db.collection('users').doc(user._id).update({
        data: { status: 'active', banTime: null, banExpiry: null }
      })
      user.status = 'active'
      user.banTime = null
      user.banExpiry = null
    }
  }

  if (requireActive && user.status === 'banned') {
    throw new Error('账号已被封禁')
  }

  return user
}

function checkBannedWords(text) {
  if (!text || !text.trim()) return { pass: true, word: null }
  const bannedWords = [
    '颠覆政权', '分裂国家', '推翻政府', '反党', '反共',
    '独立运动', '藏独', '疆独', '台独', '港独',
    '法轮功', '邪教', '反华势力', '境外势力',
    '颜色革命', '暴动', '叛乱', '政变', '辱华', '卖国',
    '色情', '淫秽', '裸体', '性交易', '卖淫', '嫖娼',
    '援交', '约炮', '一夜情', '成人视频', '黄片',
    '情色', '性服务', '招嫖', '楼凤',
    '赌博', '网赌', '赌场', '赌球', '赌马',
    '博彩', '彩票代购', '赌资', '庄家', '下注',
    '百家乐', '老虎机', '赌钱', '押注', '赔率盘口',
    '毒品', '吸毒', '贩毒', '制毒', '冰毒',
    '海洛因', '大麻', '可卡因', '摇头丸', 'K粉',
    '麻古', '笑气', '迷幻药', '致幻剂',
    '杀人', '抢劫', '绑架', '爆炸', '恐怖袭击',
    '枪支买卖', '贩卖人口', '黑社会', '打砸抢', '非法集会',
    '诈骗', '传销', '洗钱', '非法集资', '高利贷'
  ]
  for (const word of bannedWords) {
    if (text.includes(word)) {
      return { pass: false, word }
    }
  }
  return { pass: true, word: null }
}

function guessImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return 'image/jpeg'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

async function wxTextCheck(openid, text) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 2,
      version: 2,
      content: text
    })
    if (!result.result || result.result.suggest !== 'pass') {
      return { pass: false, word: '(微信安全检测不通过)' }
    }
    return { pass: true, word: null }
  } catch (err) {
    console.error('微信文本安全检测异常（按强制策略拦截）:', err)
    return { pass: false, word: '(文本安全服务异常)' }
  }
}

async function wxImageCheck(openid, fileID) {
  if (!fileID || typeof fileID !== 'string') {
    return { pass: false, word: '(图片文件参数缺失)' }
  }
  try {
    const res = await cloud.downloadFile({ fileID })
    const fileBuffer = res && res.fileContent
    if (!fileBuffer) return { pass: false, word: '(图片文件读取失败)' }
    const contentType = guessImageContentType(fileBuffer)
    const result = await cloud.openapi.security.imgSecCheck({
      media: { contentType, value: fileBuffer }
    })
    if (result && result.errCode && result.errCode !== 0) {
      return { pass: false, word: '(图片未通过安全审核)' }
    }
    return { pass: true, word: null }
  } catch (err) {
    console.error('微信图片安全检测异常:', err)
    return { pass: false, word: '(图片安全服务异常)' }
  }
}

async function wxImageBatchCheck(openid, fileList) {
  const list = Array.isArray(fileList) ? fileList.filter(Boolean) : []
  if (!list.length) return { pass: true, word: null }
  const checks = await Promise.all(list.map((fileID) => wxImageCheck(openid, fileID)))
  for (let j = 0; j < checks.length; j++) {
    if (!checks[j].pass) return checks[j]
  }
  return { pass: true, word: null }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimSnippet(text, max = 32) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

async function getUsersByOpenids(openids, extraWhere = {}) {
  const normalizedIds = Array.from(new Set((openids || []).filter(Boolean)))
  if (normalizedIds.length === 0) return []

  const users = []
  for (let i = 0; i < normalizedIds.length; i += 20) {
    const chunk = normalizedIds.slice(i, i + 20)
    const where = { ...extraWhere, _openid: _.in(chunk) }
    const res = await db.collection('users').where(where).get()
    users.push(...(res.data || []))
  }
  const orderMap = new Map(normalizedIds.map((id, index) => [id, index]))
  return users.sort((a, b) => (orderMap.get(a._openid) || 0) - (orderMap.get(b._openid) || 0))
}

async function getUserSnapshot(openid) {
  if (!openid) return {}
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const user = res.data[0] || {}
  return {
    openid,
    nickName: user.nickName || '用户',
    avatarUrl: user.avatarUrl || '/images/avatar_default.png',
    numericId: user.numericId || ''
  }
}

async function addNotification(notification) {
  const toOpenid = notification.toOpenid
  const fromOpenid = notification.fromOpenid
  if (!toOpenid || !fromOpenid || toOpenid === fromOpenid) return null

  const actor = await getUserSnapshot(fromOpenid)
  const doc = {
    _openid: fromOpenid,
    fromOpenid,
    toOpenid,
    actorNickname: actor.nickName,
    actorAvatar: actor.avatarUrl,
    actorNumericId: actor.numericId,
    type: notification.type || 'interaction',
    targetType: notification.targetType || '',
    targetId: notification.targetId || '',
    postId: notification.postId || '',
    goodsId: notification.goodsId || '',
    commentId: notification.commentId || '',
    content: notification.content || '',
    itemTitle: notification.itemTitle || '',
    itemImage: notification.itemImage || '',
    itemPrice: notification.itemPrice !== undefined ? notification.itemPrice : '',
    isRead: false,
    status: 'active',
    createTime: db.serverDate()
  }

  try {
    const addRes = await db.collection('notifications').add({ data: doc })
    doc._id = addRes._id
    return doc
  } catch (err) {
    if (isCollectionNotExistError(err)) {
      await ensureCollection('notifications')
      const addRes = await db.collection('notifications').add({ data: doc })
      doc._id = addRes._id
      return doc
    }
    throw err
  }
}

function sceneToNotifyPrefKey(sceneType) {
  const map = { dm: 'dm', comment: 'comment', like: 'like', favorite: 'favorite', share: 'share', announcement: 'announcement', offshelf: 'offshelf' }
  return map[sceneType] || ''
}

async function canSendSubscribeNotify(toOpenid, sceneType) {
  if (!toOpenid) return false
  const key = sceneToNotifyPrefKey(sceneType)
  if (!key) return false
  try {
    const res = await db.collection('users').where({ _openid: toOpenid }).limit(1).get()
    const user = (res.data && res.data[0]) || {}
    if (user.notifyEnabled === false) return false
    const prefs = user.notifyPrefs || {}
    if (prefs && prefs[key] === false) return false
    return true
  } catch (err) {
    return false
  }
}

async function triggerSubscribeNotify(payload) {
  const toOpenid = payload && payload.toOpenid
  const sceneType = payload && payload.sceneType
  if (!(await canSendSubscribeNotify(toOpenid, sceneType))) return
  const internalSecret = String(process.env.INTERNAL_NOTIFY_SECRET || '').trim()
  if (!internalSecret) return
  try {
    await cloud.callFunction({
      name: 'notifySender',
      data: {
        action: 'send',
        internalSecret,
        data: payload
      }
    })
  } catch (err) {
    console.warn('触发订阅消息异常（主流程不受影响）:', err)
  }
}

// ========== 主入口分发 ==========
exports.main = async (event, context) => {
  const { action, webSecret } = event
  const data = { ...(event.data || {}) }
  const campusActions = new Set(['getPosts','getMarketGoods','getBuddyPosts','getLanguagePartners','getMutualPosts','addPost','updatePost','addMarketGoods','addBuddyPost','addMutualPost','updateProfile','updateLanguageProfile'])
  if (campusActions.has(action)) {
    let requestedCampus = data.campusId
    if (!requestedCampus) {
      const actor = getOpenidFromContext()
      if (actor) {
        const rows = await db.collection('users').where({ _openid: actor }).limit(1).get()
        requestedCampus = rows.data[0] && rows.data[0].campusId
      }
    }
    const campus = schoolDirectory.getCampusById(requestedCampus || DEFAULT_CAMPUS_ID)
    if (!campus) return { code: -1, msg: '无效或未开放的校区' }
    data.campusId = campus.id
    data.schoolId = campus.schoolId
  }

  if (action === 'getTempFileUrls') {
    const { OPENID } = cloud.getWXContext()
    const envSecret = process.env.ADMIN_WEB_SECRET
    const adminSecretOk = !!(envSecret && webSecret && String(webSecret) === String(envSecret))
    if (!OPENID && !adminSecretOk) {
      return { code: -403, msg: '未授权：请登录后再获取临时链接' }
    }
    const rawFileList = Array.isArray(data.fileList) ? data.fileList : []
    const safeList = rawFileList
      .filter((f) => typeof f === 'string' && f.startsWith('cloud://'))
      .slice(0, 50)
    if (!safeList.length) return { code: 0, data: [] }
    const res = await cloud.getTempFileURL({ fileList: safeList })
    return { code: 0, data: res.fileList }
  }

  if (action === 'callAdminPanel') {
    const envSecret = process.env.ADMIN_WEB_SECRET
    const ws = data && data.webSecret
    if (!envSecret || !ws || String(ws) !== String(envSecret)) {
      return { code: -403, msg: '无效的 Web 管理密钥' }
    }
    const adminAction = data.adminAction
    const adminData = data.adminData || {}
    if (!adminAction || typeof adminAction !== 'string') {
      return { code: -1, msg: '缺少 adminAction' }
    }
    return await webAdminDispatch(adminAction, adminData)
  }

  // 快捷公共读取绕过鉴权
  if (action === 'getMarketGoods') {
    return await getMarketModule().getMarketGoods(data)
  }

  try {
    const openid = PUBLIC_READ_ACTIONS.has(action)
      ? getOpenidFromContext()
      : getOpenid(context)

    const identityActions = new Set(['sendMessage','getMessages','getUserInfo','getBlockRelation','toggleUserBlock','toggleFollow','getUserPosts','getUserMarketGoods'])
    if (identityActions.has(action)) {
      const identifier = data.targetUserId || data.userId || data.targetOpenid
      if (identifier) {
        data.targetOpenid = await resolveUserOpenid(db, identifier)
        if (!data.targetOpenid) return { code: -1, msg: '目标用户不存在' }
      }
    }
    if (["getHeartProfile", "updateHeartProfile", "disableHeartProfile", "getHeartDiscover", "likeHeartProfile", "passHeartProfile", "getHeartMatches", "drawFateCard", "getFateCardQuota", "toggleFateCardOptIn", "startHeartChat"].includes(action)) return await getHeartModule()[action](openid, data)
    switch (action) {
      // ===== 帖子动态相关 (modules/posts.js) =====
      case 'getPosts':
        return await getPostsModule().getPosts(openid, data)
      case 'getPostById':
        return await getPostsModule().getPostById(data.postId, openid)
      case 'addPost':
        return await getPostsModule().addPost(openid, data)
      case 'updatePost':
        return await getPostsModule().updatePost(openid, data)
      case 'deletePost':
        return await getPostsModule().deletePost(openid, data.postId)
      case 'toggleTopPost':
        return await getPostsModule().toggleTopPost(openid, data.postId)
      case 'getComments':
        return await getPostsModule().getComments(data.postId, data.sortBy, openid)
      case 'addComment':
        return await getPostsModule().addComment(openid, data)
      case 'toggleLikePost':
        return await getPostsModule().toggleLikePost(openid, data.postId)
      case 'toggleLikeComment':
        return await getPostsModule().toggleLikeComment(openid, data.commentId)
      case 'toggleFavorPost':
        return await getPostsModule().toggleFavorPost(openid, data.postId)
      case 'getFavoredPosts':
        return await getPostsModule().getFavoredPosts(openid, data)
      case 'getLikedPosts':
        return await getPostsModule().getLikedPosts(openid, data)
      case 'getMyPosts':
        return await getPostsModule().getMyPosts(openid, data)
      case 'getUserPosts':
        return await getPostsModule().getUserPosts(openid, data.targetOpenid, data)

      // ===== 用户关系与资料相关 (modules/users.js) =====
      case 'getUserInfo':
        return await getUsersModule().getUserInfo(openid, data.targetOpenid || data.userId || openid)
      case 'updateProfile':
        return await getUsersModule().updateProfile(openid, data)
      case 'updateNotifySettings':
        return await getUsersModule().updateNotifySettings(openid, data)
      case 'migrateCampusDefaults':
        return await getUsersModule().migrateCampusDefaults(openid)
      case 'searchUsers':
        return await getUsersModule().searchUsers(openid, data.keyword)
      case 'agreePrivacy':
        return await getUsersModule().agreePrivacy(openid)
      case 'deleteAccount':
        return await getUsersModule().deleteAccount(openid)
      case 'toggleFollow':
        return await getUsersModule().toggleFollow(openid, data.targetOpenid)
      case 'getFollowingList':
        return await getUsersModule().getFollowingList(openid, data)
      case 'getFollowerList':
        return await getUsersModule().getFollowerList(openid, data)
      case 'getUserMarketGoods':
        return await getUsersModule().getUserMarketGoods(openid, data.targetOpenid, data)

      // ===== 私信与通知相关 (modules/messages.js) =====
      case 'getConversations':
        return await getMessagesModule().getConversations(openid)
      case 'getUnreadMessageCount':
        return await getMessagesModule().getUnreadMessageCount(openid)
      case 'getMessages':
        return await getMessagesModule().getMessages(openid, data.targetOpenid, data.sinceTime)
      case 'sendMessage':
        return await getMessagesModule().sendMessage(openid, data)
      case 'getInteractionNotifications':
        return await getMessagesModule().getInteractionNotifications(openid, data)
      case 'markInteractionNotificationsRead':
        return await getMessagesModule().markInteractionNotificationsRead(openid, data)
      case 'getUnreadInteractionCount':
        return await getMessagesModule().getUnreadInteractionCount(openid)
      case 'sendAnnouncementNotify':
        return await getMessagesModule().sendAnnouncementNotify(openid, data)

      // ===== 安全风控相关 (modules/safety.js) =====
      case 'toggleUserBlock':
        return await getSafetyModule().toggleUserBlock(openid, data.targetOpenid)
      case 'getBlockRelation':
        return await getSafetyModule().getBlockRelation(openid, data.targetOpenid)
      case 'getBlockedUsersList':
        return await getSafetyModule().getBlockedUsersList(openid, data)
      case 'reportContent':
        return await getSafetyModule().reportContent(openid, data)
      case 'banUser':
        return await getSafetyModule().banUser(openid, data.targetOpenid || data)

      // ===== 公告与活动相关 (modules/events.js) =====
      case 'createAnnouncement':
        return await getEventsModule().createAnnouncement(openid, data)
      case 'updateAnnouncement':
        return await getEventsModule().updateAnnouncement(openid, data)
      case 'publishAnnouncement':
        return await getEventsModule().publishAnnouncement(openid, data)
      case 'revokeAnnouncement':
        return await getEventsModule().revokeAnnouncement(openid, data)
      case 'getAnnouncementList':
        return await getEventsModule().getAnnouncementList(openid, data)
      case 'getAdminAnnouncementList':
        return await getEventsModule().getAdminAnnouncementList(openid, data)
      case 'getAnnouncementDetail':
        return await getEventsModule().getAnnouncementDetail(openid, data)
      case 'markAnnouncementRead':
        return await getEventsModule().markAnnouncementRead(openid, data)
      case 'getUnreadAnnouncementCount':
        return await getEventsModule().getUnreadAnnouncementCount(openid)
      case 'getActivityZone':
        return await getEventsModule().getActivityZone(openid, data)
      case 'getActivityZoneAdmin':
        return await getEventsModule().getActivityZoneAdmin(openid)
      case 'saveActivityZone':
        return await getEventsModule().saveActivityZone(openid, data)
      case 'endActivityZone':
        return await getEventsModule().endActivityZone(openid, data)

      // ===== 二手集市相关 (modules/market.js) =====
      case 'getMarketGoodsById':
        return await getMarketModule().getMarketGoodsById(data.goodsId, openid)
      case 'addMarketGoods':
        return await getMarketModule().addMarketGoods(openid, data)
      case 'toggleFavorGoods':
        return await getMarketModule().toggleFavorGoods(openid, data.goodsId)
      case 'wantMarketGoods':
        return await getMarketModule().wantMarketGoods(openid, data.goodsId)
      case 'deleteMarketGoods':
        return await getMarketModule().deleteMarketGoods(openid, data.goodsId)
      case 'getMarketComments':
        return await getMarketModule().getMarketComments(data.goodsId, openid)
      case 'addMarketComment':
        return await getMarketModule().addMarketComment(openid, data)
      case 'getAdminMarketGoods':
        return await getMarketModule().getAdminMarketGoods(data)

      // ===== 同频找搭子相关 (modules/buddies.js) =====
      case 'getBuddyPosts':
        return await getBuddiesModule().getBuddyPosts({ ...data, currentOpenid: openid })
      case 'getBuddyPostById':
        return await getBuddiesModule().getBuddyPostById({ ...data, openid })
      case 'addBuddyPost':
        return await getBuddiesModule().addBuddyPost(openid, data)
      case 'applyBuddyPost':
        return await getBuddiesModule().applyBuddyPost(openid, data)
      case 'cancelBuddyApplication':
        return await getBuddiesModule().cancelBuddyApplication(openid, data)
      case 'handleBuddyApplication':
        return await getBuddiesModule().handleBuddyApplication(openid, data)
      case 'updateBuddyPostStatus':
        return await getBuddiesModule().updateBuddyPostStatus(openid, data)
      case 'getUserBuddyPosts':
        return await getBuddiesModule().getUserBuddyPosts(openid, data)

      // ===== 校园此刻轻量聚合相关 (modules/campus-now.js) =====
      case 'getCampusNowSummary':
        return await getCampusNowModule().getCampusNowSummary({ ...data, currentOpenid: openid })

      // ===== 友桥语伴相关 (modules/bridge.js) =====
      case 'getLanguagePartners':
        return await getBridgeModule().getLanguagePartners({ ...data, currentOpenid: openid })
      case 'getLanguagePartnerProfile':
        return await getBridgeModule().getLanguagePartnerProfile({ ...data, currentOpenid: openid })
      case 'updateLanguageProfile':
        return await getBridgeModule().updateLanguageProfile(openid, data)

      // ===== 校园互助生活与失物招领相关 (modules/mutual.js) =====
      case 'getMutualPosts':
        return await getMutualModule().getMutualPosts(data)
      case 'getMutualPostById':
        return await getMutualModule().getMutualPostById({ ...data, openid })
      case 'addMutualPost':
        return await getMutualModule().addMutualPost(openid, data)
      case 'updateMutualPostStatus':
        return await getMutualModule().updateMutualPostStatus(openid, data)
      case 'deleteMutualPost':
        return await getMutualModule().deleteMutualPost(openid, data.id)

      default:
        return { code: -1, msg: `未知操作: ${action}` }
    }
  } catch (err) {
    console.error(`[dbOperations] action=${action} failed:`, err)
    return {
      code: -1,
      msg: (err && (err.errMsg || err.message)) || '操作失败'
    }
  }
}

const dispatch = exports.main
const sanitizedActions = new Set(['getUserInfo','getBuddyPosts','getBuddyPostById','getUserBuddyPosts','getLanguagePartners','getLanguagePartnerProfile','getMutualPosts','getMutualPostById','getPosts','getPostById','getMarketGoods','getMarketGoodsById','getComments','getMarketComments','getUserPosts','getUserMarketGoods','getFollowingList','getFollowerList','getCampusNowSummary'])
exports.main = async (event, context) => {
 const result=await dispatch(event,context)
 if (!sanitizedActions.has(event.action) || !result || result.code!==0) return result
 return {...result,data:event.action==='getUserInfo'?sanitizePublicUser(result.data):sanitizePublicPost(result.data)}
}
