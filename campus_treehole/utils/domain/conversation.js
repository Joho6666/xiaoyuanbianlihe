// shared/domain/conversation.js - 通用会话与即时通讯核心模型
// 统一承载：私信聊天、Tongpin 搭子群聊、二手集市商品咨询、活动群聊、UniBridge 语言搭子会话

const crypto = require('crypto')

const CONVERSATION_TYPES = {
  DIRECT: 'DIRECT',
  GROUP: 'GROUP'
}

const CONVERSATION_CONTEXT_TYPES = {
  DIRECT: 'DIRECT',             // 纯双人私聊
  BUDDY: 'BUDDY',               // 同频搭子成局群聊 (关联 buddyPostId)
  MARKET: 'MARKET',             // 二手集市咨询 (关联 goodsId)
  EVENT: 'EVENT',               // 校园活动大群 (关联 eventId)
  LANGUAGE_EXCHANGE: 'LANGUAGE_EXCHANGE' // 友桥语言交换搭子
}

const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  CARD: 'card',
  SYSTEM: 'system',
  VOICE: 'voice'
}

/**
 * 两人私聊生成确定性会话 ID (保证 A->B 与 B->A 映射到唯一相同会话)
 * @param {string} userIdA
 * @param {string} userIdB
 * @returns {string}
 */
function deriveDirectConversationId(userIdA, userIdB) {
  if (!userIdA || !userIdB) throw new Error('Both user IDs required for direct conversation')
  const sorted = [String(userIdA), String(userIdB)].sort().join(':')
  const hash = crypto.createHash('md5').update(`conv:direct:${sorted}`).digest('hex')
  return `conv_dm_${hash}`
}

/**
 * 构造标准会话实体
 * @param {Object} params
 * @returns {Object}
 */
function createConversationEntity({
  id,
  type = CONVERSATION_TYPES.DIRECT,
  contextType = CONVERSATION_CONTEXT_TYPES.DIRECT,
  contextId = null,
  title = '',
  createdAt = new Date().toISOString()
}) {
  return {
    id: id || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: Object.values(CONVERSATION_TYPES).includes(type) ? type : CONVERSATION_TYPES.DIRECT,
    contextType: Object.values(CONVERSATION_CONTEXT_TYPES).includes(contextType) ? contextType : CONVERSATION_CONTEXT_TYPES.DIRECT,
    contextId: contextId ? String(contextId).trim() : null,
    title: String(title || '').trim(),
    lastMessageContent: '',
    lastMessageAt: null,
    createdAt,
    updatedAt: createdAt
  }
}

/**
 * 构造会话成员实体
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} [role='member'] - 'owner' | 'admin' | 'member'
 * @returns {Object}
 */
function createConversationMember(conversationId, userId, role = 'member') {
  return {
    id: `${conversationId}:${userId}`,
    conversationId,
    userId,
    role: ['owner', 'admin', 'member'].includes(role) ? role : 'member',
    lastReadAt: new Date().toISOString(),
    joinedAt: new Date().toISOString()
  }
}

/**
 * 构造统一消息实体
 * @param {Object} params
 * @returns {Object}
 */
function createMessageEntity({
  id,
  conversationId,
  senderId,
  type = MESSAGE_TYPES.TEXT,
  content = '',
  cardPayload = null,
  createdAt = new Date().toISOString()
}) {
  if (!conversationId) throw new Error('Message requires conversationId')
  if (!senderId) throw new Error('Message requires senderId')

  return {
    id: id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    senderId,
    type: Object.values(MESSAGE_TYPES).includes(type) ? type : MESSAGE_TYPES.TEXT,
    content: String(content || '').trim(),
    cardPayload: cardPayload || null,
    createdAt
  }
}

/**
 * 兼容适配器：将旧版校园便利盒的散列私信记录转换为统一 Message 模型
 * @param {Object} legacyMsg - 旧 messages 集合文档
 * @param {string} [conversationId]
 * @returns {Object}
 */
function adaptLegacyMessageToUnified(legacyMsg, conversationId = '') {
  if (!legacyMsg) return null
  const fromOpenid = legacyMsg.fromOpenid || legacyMsg._openid || ''
  const toOpenid = legacyMsg.toOpenid || ''
  const convId = conversationId || (
    fromOpenid && toOpenid ? deriveDirectConversationId(fromOpenid, toOpenid) : 'conv_legacy_unknown'
  )

  let type = MESSAGE_TYPES.TEXT
  let cardPayload = null
  if (legacyMsg.type === 'image') {
    type = MESSAGE_TYPES.IMAGE
  } else if (legacyMsg.type === 'post_share') {
    type = MESSAGE_TYPES.CARD
    cardPayload = {
      type: 'post',
      id: legacyMsg.shareData ? legacyMsg.shareData.id : '',
      title: legacyMsg.shareData ? legacyMsg.shareData.title : legacyMsg.content || ''
    }
  } else if (legacyMsg.type === 'goods_share') {
    type = MESSAGE_TYPES.CARD
    cardPayload = {
      type: 'goods',
      id: legacyMsg.shareData ? legacyMsg.shareData.id : '',
      title: legacyMsg.shareData ? legacyMsg.shareData.title : legacyMsg.content || '',
      price: legacyMsg.shareData ? legacyMsg.shareData.price : null
    }
  }

  return createMessageEntity({
    id: legacyMsg._id || '',
    conversationId: convId,
    senderId: fromOpenid,
    type,
    content: legacyMsg.content || '',
    cardPayload,
    createdAt: legacyMsg.createTime ? new Date(legacyMsg.createTime).toISOString() : new Date().toISOString()
  })
}

module.exports = {
  CONVERSATION_TYPES,
  CONVERSATION_CONTEXT_TYPES,
  MESSAGE_TYPES,
  deriveDirectConversationId,
  createConversationEntity,
  createConversationMember,
  createMessageEntity,
  adaptLegacyMessageToUnified
}
