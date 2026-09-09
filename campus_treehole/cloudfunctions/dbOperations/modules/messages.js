// modules/messages.js - 消息、私信与互动通知业务模块
// 负责一对一聊天、会话列表、未读统计与系统/订阅通知推送
const { publicId } = require('../shared/public-data')

function createMessagesModule({ db, _, cloud, helpers }) {
  const {
    getUserForAction,
    getUsersByOpenids,
    checkRateLimit,
    checkBannedWords,
    wxTextCheck,
    wxImageCheck,
    triggerSubscribeNotify,
    trimSnippet,
    conversationBlocked,
    USER_BLOCKS,
    safeUserBlocksQuery,
    checkAdmin,
    contactAllowed = async () => true
  } = helpers

  function formatConversationMessage(msg) {
    if (!msg) return ''
    if (msg.type === 'voice') return '[语音消息]'
    if (msg.type === 'image') return '[图片]'
    if (msg.type === 'post_share') return `[分享帖子] ${((msg.shareData && msg.shareData.title) || msg.content || '').trim()}`
    if (msg.type === 'goods_share') return `[分享商品] ${((msg.shareData && msg.shareData.title) || msg.content || '').trim()}`
    return msg.content || ''
  }

  async function getConversations(openid) {
    const allRes = await db.collection('messages')
      .where(_.or([
        { fromOpenid: openid },
        { toOpenid: openid }
      ]))
      .orderBy('createTime', 'desc')
      .limit(200)
      .get()
    const allMessages = allRes.data || []
    const convMap = {}
    const unreadMap = {}

    const [blockedByMe, blockedMe] = await Promise.all([
      safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({ blockerOpenid: openid }).limit(500).get()
      ),
      safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({ blockedOpenid: openid }).limit(500).get()
      )
    ])
    const hideConv = new Set()
    ;(blockedByMe && blockedByMe.data ? blockedByMe.data : []).forEach((r) => hideConv.add(r.blockedOpenid))
    ;(blockedMe && blockedMe.data ? blockedMe.data : []).forEach((r) => hideConv.add(r.blockerOpenid))

    for (const msg of allMessages) {
      const otherOpenid = msg.fromOpenid === openid ? msg.toOpenid : msg.fromOpenid
      if (hideConv.has(otherOpenid)) continue
      if (!convMap[otherOpenid] || msg.createTime > convMap[otherOpenid].createTime) {
        convMap[otherOpenid] = msg
      }
      if (msg.toOpenid === openid && !msg.isRead) {
        unreadMap[otherOpenid] = (unreadMap[otherOpenid] || 0) + 1
      }
    }

    const otherIds = Object.keys(convMap)
    if (otherIds.length === 0) return { code: 0, data: [] }

    const userMap = {}
    const users = await getUsersByOpenids(otherIds)
    for (const u of users) {
      userMap[u._openid] = u
    }

    const conversations = otherIds.map((otherId) => {
      const msg = convMap[otherId]
      const user = userMap[otherId] || {}
      return {
        targetUserId: user.internalUserId || publicId(otherId),
        targetNickName: user.nickName || '未知用户',
        targetAvatar: user.avatarUrl || '/images/avatar_default.png',
        lastMessage: formatConversationMessage(msg),
        lastTime: msg.createTime,
        unreadCount: unreadMap[otherId] || 0
      }
    }).sort((a, b) => {
      const timeA = a.lastTime instanceof Date ? a.lastTime.getTime() : (a.lastTime || 0)
      const timeB = b.lastTime instanceof Date ? b.lastTime.getTime() : (b.lastTime || 0)
      return timeB - timeA
    })

    return { code: 0, data: conversations }
  }

  async function getUnreadMessageCount(openid) {
    const res = await db.collection('messages')
      .where({ toOpenid: openid, isRead: false })
      .count()
    return {
      code: 0,
      data: {
        unreadCount: res.total || 0
      }
    }
  }

  async function getMessages(openid, targetOpenid, sinceTime) {
    await getUserForAction(openid, { requireActive: true })
    const normalizedTarget = typeof targetOpenid === 'string' ? targetOpenid.trim() : ''
    if (!normalizedTarget) return { code: -1, msg: '缺少会话对象' }
    if (normalizedTarget === openid) return { code: -1, msg: '无效会话对象' }

    if (await conversationBlocked(openid, normalizedTarget)) {
      return { code: -1, msg: '无法查看与该用户的私信' }
    }
    if (!(await contactAllowed(openid, normalizedTarget))) return { code: 403, msg: '当前没有可用的联系权限' }

    const sinceTs = Number(sinceTime)
    const hasSinceTime = Number.isFinite(sinceTs) && sinceTs > 0
    const sinceDate = hasSinceTime ? new Date(sinceTs) : null
    const buildSideCond = (fromOpenid, toOpenid) => {
      const side = { fromOpenid, toOpenid }
      if (!hasSinceTime) return side
      return _.and([side, { createTime: _.gt(sinceDate) }])
    }

    const latestRes = await db.collection('messages').where(_.or([
      buildSideCond(openid, normalizedTarget),
      buildSideCond(normalizedTarget, openid)
    ]))
      .orderBy('createTime', hasSinceTime ? 'asc' : 'desc')
      .limit(hasSinceTime ? 100 : 200)
      .get()
    const messages = hasSinceTime
      ? (latestRes.data || [])
      : (latestRes.data || []).slice().reverse()

    // 标记未读为已读
    const unread = messages.filter((m) => m.toOpenid === openid && !m.isRead)
    if (unread.length > 0) {
      const readWhere = hasSinceTime
        ? { toOpenid: openid, fromOpenid: normalizedTarget, isRead: false, createTime: _.gt(sinceDate) }
        : { toOpenid: openid, fromOpenid: normalizedTarget, isRead: false }
      await db.collection('messages')
        .where(readWhere)
        .update({ data: { isRead: true } })
    }

    return { code: 0, data: messages }
  }

  async function sendMessage(openid, data = {}) {
    const user = await getUserForAction(openid, { requireActive: true })
    if (user.isMuted) return { code: -1, msg: '您已被禁言，无法发送消息' }

    const targetOpenid = typeof data.targetOpenid === 'string' ? data.targetOpenid.trim() : ''
    if (!targetOpenid) return { code: -1, msg: '接收方参数缺失' }
    if (targetOpenid === openid) return { code: -1, msg: '不能给自己发消息' }

    const targetRes = await db.collection('users').where({
      _openid: targetOpenid,
      status: 'active'
    }).limit(1).get()
    if (targetRes.data.length === 0) return { code: -1, msg: '对方账号不可用' }

    if (await conversationBlocked(openid, targetOpenid)) {
      return { code: -1, msg: '无法与对方发送私信' }
    }

    const type = typeof data.type === 'string' ? data.type : 'text'
    const allowedTypes = ['text', 'emoji', 'image', 'voice', 'post_share', 'goods_share']
    if (!allowedTypes.includes(type)) return { code: -1, msg: '不支持的消息类型' }

    const rawContent = typeof data.content === 'string' ? data.content : ''
    const trimmedContent = rawContent.trim()
    const normalizedFileId = typeof data.fileId === 'string' ? data.fileId.trim() : ''

    if ((type === 'text' || type === 'emoji') && !trimmedContent) {
      return { code: -1, msg: '消息内容不能为空' }
    }
    if ((type === 'image' || type === 'voice') && !normalizedFileId && !trimmedContent) {
      return { code: -1, msg: '消息文件缺失' }
    }

    let normalizedShareData = null
    if (type === 'post_share' || type === 'goods_share') {
      const shareData = data.shareData || {}
      const shareId = typeof shareData.id === 'string'
        ? shareData.id.trim()
        : String(shareData.id || '').trim()
      if (!shareId) return { code: -1, msg: '分享内容无效' }
      normalizedShareData = {
        id: shareId,
        title: typeof shareData.title === 'string' ? shareData.title : '',
        summary: typeof shareData.summary === 'string' ? shareData.summary : '',
        image: typeof shareData.image === 'string' ? shareData.image : '',
        category: typeof shareData.category === 'string' ? shareData.category : '',
        price: shareData.price
      }
    }

    // 频率限制：1分钟内最多10条消息
    const canSend = await checkRateLimit(openid, 'messages', 1, 10)
    if (!canSend) return { code: -1, msg: '发送太频繁，请稍后再试' }

    // 文本审核
    if (type === 'text' || type === 'emoji') {
      const check = checkBannedWords(trimmedContent)
      if (!check.pass) return { code: -2, msg: `消息包含违规词"${check.word}"` }
      const wxCheck = await wxTextCheck(openid, trimmedContent)
      if (!wxCheck.pass) return { code: -2, msg: '消息未通过安全审核' }
    }

    if (type === 'image') {
      const wxImageRes = await wxImageCheck(openid, normalizedFileId)
      if (!wxImageRes.pass) return { code: -2, msg: '图片消息未通过安全审核' }
    }
    if (!(await contactAllowed(openid, targetOpenid))) return { code: 403, msg: '当前没有可用的联系权限' }

    const msg = {
      _openid: openid,
      fromOpenid: openid,
      toOpenid: targetOpenid,
      content: (type === 'image' || type === 'voice') ? rawContent : trimmedContent,
      type,
      duration: type === 'voice' ? (Number(data.duration) || 0) : 0,
      fileId: (type === 'image' || type === 'voice') ? (normalizedFileId || trimmedContent || '') : '',
      width: type === 'image' ? (Number(data.width) || 0) : 0,
      height: type === 'image' ? (Number(data.height) || 0) : 0,
      shareData: normalizedShareData,
      isRead: false,
      createTime: db.serverDate()
    }

    const addRes = await db.collection('messages').add({ data: msg })
    msg._id = addRes._id
    if (type === 'text' || type === 'emoji' || type === 'image' || type === 'voice') {
      const actorName = user.nickName || '有人'
      const summary = type === 'image'
        ? '给你发来了一张图片'
        : type === 'voice'
          ? '给你发来了一条语音'
          : `给你发来私信：${trimSnippet(trimmedContent || '新消息')}`
      if (typeof triggerSubscribeNotify === 'function') {
        await triggerSubscribeNotify({
          toOpenid: targetOpenid,
          sceneType: 'dm',
          actorName,
          summary,
          // OpenID is an internal transport identifier only. Notification routes
          // must use the public user id and are resolved server-side on arrival.
          page: `/pages/chat/chat?targetUserId=${encodeURIComponent(targetRes.data[0].internalUserId || publicId(targetOpenid))}`
        })
      }
    }
    if (type === 'post_share' && normalizedShareData && normalizedShareData.id) {
      const postRes = await db.collection('posts').doc(normalizedShareData.id).get().catch(() => ({ data: null }))
      const post = postRes.data || {}
      if (post._openid && post._openid !== openid && typeof triggerSubscribeNotify === 'function') {
        await triggerSubscribeNotify({
          toOpenid: post._openid,
          sceneType: 'share',
          actorName: user.nickName || '有人',
          itemTitle: trimSnippet(post.title || normalizedShareData.title || '帖子'),
          summary: '转发了你的帖子',
          page: `/pages/detail/detail?id=${normalizedShareData.id}`
        })
      }
    }
    if (type === 'goods_share' && normalizedShareData && normalizedShareData.id) {
      const goodsRes = await db.collection('market_goods').doc(normalizedShareData.id).get().catch(() => ({ data: null }))
      const goods = goodsRes.data || {}
      if (goods._openid && goods._openid !== openid && typeof triggerSubscribeNotify === 'function') {
        await triggerSubscribeNotify({
          toOpenid: goods._openid,
          sceneType: 'share',
          actorName: user.nickName || '有人',
          itemTitle: trimSnippet(goods.title || normalizedShareData.title || '商品'),
          summary: '转发了你的商品',
          page: `/packageMarket/pages/market-detail/market-detail?id=${normalizedShareData.id}`
        })
      }
    }
    return { code: 0, data: msg }
  }

  async function getInteractionNotifications(openid, { page = 1, pageSize = 30 } = {}) {
    try {
      const res = await db.collection('notifications')
        .where({ toOpenid: openid, status: 'active' })
        .orderBy('createTime', 'desc')
        .skip((Math.max(1, page) - 1) * pageSize)
        .limit(pageSize)
        .get()
      return { code: 0, data: res.data || [] }
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        return { code: 0, data: [] }
      }
      throw err
    }
  }

  async function markInteractionNotificationsRead(openid, data = {}) {
    const ids = Array.isArray(data.ids) ? data.ids.filter(Boolean) : []
    try {
      if (ids.length > 0) {
        for (let i = 0; i < ids.length; i += 20) {
          const chunk = ids.slice(i, i + 20)
          const res = await db.collection('notifications')
            .where({ toOpenid: openid, _id: _.in(chunk), isRead: false })
            .limit(100)
            .get()
          for (const item of res.data || []) {
            await db.collection('notifications').doc(item._id).update({ data: { isRead: true } })
          }
        }
        return { code: 0, msg: '已标记已读' }
      }

      const unread = await db.collection('notifications')
        .where({ toOpenid: openid, isRead: false, status: 'active' })
        .limit(100)
        .get()
      for (const item of unread.data || []) {
        await db.collection('notifications').doc(item._id).update({ data: { isRead: true } })
      }
      return { code: 0, msg: '已全部标记已读' }
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        return { code: 0, msg: '暂无未读互动' }
      }
      throw err
    }
  }

  async function getUnreadInteractionCount(openid) {
    try {
      const res = await db.collection('notifications')
        .where({ toOpenid: openid, isRead: false, status: 'active' })
        .count()
      return { code: 0, data: { unreadCount: res.total || 0 } }
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        return { code: 0, data: { unreadCount: 0 } }
      }
      throw err
    }
  }

  async function sendAnnouncementNotify(openid, data = {}) {
    if (!(await checkAdmin(openid))) return { code: -1, msg: '无管理员权限' }
    const title = trimSnippet(data.title || '社区公告')
    const summary = trimSnippet(data.summary || '有新的公告，请及时查看')
    const announcementType = trimSnippet(data.announcementType || '社区公告')
    const page = typeof data.page === 'string' && data.page.trim() ? data.page.trim() : '/pages/index/index'
    const toOpenids = Array.isArray(data.toOpenids)
      ? Array.from(new Set(data.toOpenids.map((id) => String(id || '').trim()).filter(Boolean)))
      : []
    if (!toOpenids.length) return { code: -1, msg: '缺少接收用户列表' }
    let sent = 0
    for (const toOpenid of toOpenids) {
      if (typeof triggerSubscribeNotify === 'function') {
        await triggerSubscribeNotify({
          toOpenid,
          sceneType: 'announcement',
          itemTitle: title,
          summary,
          announcementType,
          page
        })
      }
      sent += 1
    }
    return { code: 0, msg: '公告通知已发送', data: { sent } }
  }

  return {
    getConversations,
    getUnreadMessageCount,
    getMessages,
    sendMessage,
    getInteractionNotifications,
    markInteractionNotificationsRead,
    getUnreadInteractionCount,
    sendAnnouncementNotify,
    formatConversationMessage
  }
}

module.exports = createMessagesModule
