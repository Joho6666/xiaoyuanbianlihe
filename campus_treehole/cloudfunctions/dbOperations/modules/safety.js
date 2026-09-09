const { publicId } = require('../shared/public-data')
const { pairId } = require('../shared/heart')
// modules/safety.js - 安全与风控业务模块
// 涵盖举报处理、拉黑关系过滤、用户封禁管理
const USER_BLOCKS = 'user_blocks'

function createSafetyModule({ db, _, cloud, helpers }) {
  const {
    getUserForAction,
    isCollectionNotExistError,
    isUserBlocksUnavailableError,
    getUsersByOpenids,
    checkAdmin
  } = helpers

  async function safeUserBlocksQuery(run) {
    try {
      return await run()
    } catch (err) {
      if (isCollectionNotExistError(err)) return null
      throw err
    }
  }

  async function conversationBlocked(openidA, openidB) {
    if (!openidA || !openidB || openidA === openidB) return false
    const res = await safeUserBlocksQuery(() =>
      db.collection(USER_BLOCKS).where(_.or([
        { blockerOpenid: openidA, blockedOpenid: openidB },
        { blockerOpenid: openidB, blockedOpenid: openidA }
      ])).limit(1).get()
    )
    return !!(res && (res.data || []).length > 0)
  }

  /** 主页/帖子列表：对方拉黑了我 → 我不能看对方主页与其帖子 */
  async function viewerBlockedByAuthor(viewerOpenid, authorOpenid) {
    if (!viewerOpenid || !authorOpenid || viewerOpenid === authorOpenid) return false
    const res = await safeUserBlocksQuery(() =>
      db.collection(USER_BLOCKS).where({
        blockerOpenid: authorOpenid,
        blockedOpenid: viewerOpenid
      }).limit(1).get()
    )
    return !!(res && (res.data || []).length > 0)
  }

  /** 信息流：双向任一拉黑则不在双方时间线展示对方内容 */
  async function findAuthorsHiddenByBlockRelation(viewerOpenid, authorOpenids) {
    const ids = Array.from(new Set((authorOpenids || []).filter(Boolean)))
    const hide = new Set()
    if (!viewerOpenid || ids.length === 0) return hide

    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20)
      const theyBlockedMe = await safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({
          blockerOpenid: _.in(chunk),
          blockedOpenid: viewerOpenid
        }).get()
      )
      const iBlockedThem = await safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({
          blockerOpenid: viewerOpenid,
          blockedOpenid: _.in(chunk)
        }).get()
      )
      if (!theyBlockedMe || !iBlockedThem) continue
      ;(theyBlockedMe.data || []).forEach((row) => hide.add(row.blockerOpenid))
      ;(iBlockedThem.data || []).forEach((row) => hide.add(row.blockedOpenid))
    }
    return hide
  }

  /** 帖子/商品详情：任一方拉黑另一方则不可查看 */
  async function contentDetailBlocked(viewerOpenid, ownerOpenid) {
    return conversationBlocked(viewerOpenid, ownerOpenid)
  }

  async function removeFollowBetween(a, b) {
    if (!a || !b || a === b) return
    const [r1, r2] = await Promise.all([
      db.collection('follows').where({ _openid: a, targetOpenid: b }).get(),
      db.collection('follows').where({ _openid: b, targetOpenid: a }).get()
    ])
    const rows = [...(r1.data || []), ...(r2.data || [])]
    for (const row of rows) {
      if (row && row._id) {
        await db.collection('follows').doc(row._id).remove()
      }
    }
  }

  async function toggleUserBlock(openid, targetOpenid) {
    await getUserForAction(openid, { requireActive: true })
    const normalizedTarget = typeof targetOpenid === 'string' ? targetOpenid.trim() : ''
    if (!normalizedTarget) return { code: -1, msg: '目标用户参数缺失' }
    if (openid === normalizedTarget) return { code: -1, msg: '不能拉黑自己' }

    const targetRes = await db.collection('users').where({
      _openid: normalizedTarget,
      status: 'active'
    }).limit(1).get()
    if (targetRes.data.length === 0) {
      return { code: -1, msg: '目标用户不存在或已停用' }
    }

    const BLOCKS_SETUP_MSG =
      '拉黑数据表未就绪：请在云开发控制台「数据库」新建集合 user_blocks，或在项目 campus_treehole 目录执行 npm run db:create-user-blocks-collection'

    try {
      const existing = await safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({
          blockerOpenid: openid,
          blockedOpenid: normalizedTarget
        }).get()
      )
      const existingRows = (existing && existing.data) || []

      if (existingRows.length > 0) {
        for (const row of existingRows) {
          await db.collection(USER_BLOCKS).doc(row._id).remove()
        }
        return { code: 0, data: { blocked: false } }
      }

      // Fail closed for Heart interactions before creating the existing block relation.
      // The fence remains conservative after unblock; a future explicit re-consent can reset it.
      const blocker = await getUserForAction(openid, { requireActive: true })
      const target = targetRes.data[0]
      await db.collection('heart_block_fences').doc(pairId(blocker.internalUserId || publicId(openid), target.internalUserId || publicId(normalizedTarget))).set({data:{blocked:true}})
      await db.collection(USER_BLOCKS).add({
        data: {
          blockerOpenid: openid,
          blockedOpenid: normalizedTarget,
          createTime: db.serverDate()
        }
      })
      await removeFollowBetween(openid, normalizedTarget)
      return { code: 0, data: { blocked: true } }
    } catch (err) {
      console.error('toggleUserBlock:', err)
      if (typeof isUserBlocksUnavailableError === 'function' && isUserBlocksUnavailableError(err)) {
        return { code: -1, msg: BLOCKS_SETUP_MSG }
      }
      throw err
    }
  }

  async function getBlockRelation(openid, targetOpenid) {
    const normalizedTarget = typeof targetOpenid === 'string' ? targetOpenid.trim() : ''
    if (!normalizedTarget || normalizedTarget === openid) {
      return {
        code: 0,
        data: { either: false, theyBlockedMe: false, iBlockedThem: false }
      }
    }
    const [theyBlockedMe, either, ibRow] = await Promise.all([
      viewerBlockedByAuthor(openid, normalizedTarget),
      conversationBlocked(openid, normalizedTarget),
      safeUserBlocksQuery(() =>
        db.collection(USER_BLOCKS).where({ blockerOpenid: openid, blockedOpenid: normalizedTarget }).limit(1).get()
      )
    ])
    const iBlockedThem = !!(ibRow && (ibRow.data || []).length > 0)
    return {
      code: 0,
      data: { either, theyBlockedMe, iBlockedThem }
    }
  }

  /** 我拉黑的用户列表（用于「黑名单」页解除拉黑） */
  async function getBlockedUsersList(openid, { page = 1, pageSize = 50 } = {}) {
    await getUserForAction(openid, { requireActive: true })
    const safePage = Math.max(1, Number(page) || 1)
    const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 50))
    let blockRows = []
    try {
      const res = await db.collection(USER_BLOCKS)
        .where({ blockerOpenid: openid })
        .orderBy('createTime', 'desc')
        .skip((safePage - 1) * safeSize)
        .limit(safeSize)
        .get()
      blockRows = res.data || []
    } catch (e) {
      const all = await db.collection(USER_BLOCKS).where({ blockerOpenid: openid }).limit(200).get()
      const sorted = (all.data || []).slice().sort((a, b) => {
        const ta = a.createTime instanceof Date ? a.createTime.getTime() : new Date(a.createTime || 0).getTime()
        const tb = b.createTime instanceof Date ? b.createTime.getTime() : new Date(b.createTime || 0).getTime()
        return tb - ta
      })
      const start = (safePage - 1) * safeSize
      blockRows = sorted.slice(start, start + safeSize)
    }

    const ids = blockRows.map((r) => r.blockedOpenid).filter(Boolean)
    if (!ids.length) return { code: 0, data: [] }

    const users = await getUsersByOpenids(ids, { status: 'active' })
    const userMap = new Map(users.map((u) => [u._openid, u]))
    const data = ids.map((id) => {
      const u = userMap.get(id)
      if (u) {
        return {
          _openid: id,
          nickName: u.nickName || '同学',
          avatarUrl: u.avatarUrl || '/images/avatar_default.png',
          college: u.college || u.campusName || ''
        }
      }
      return {
        _openid: id,
        nickName: '用户',
        avatarUrl: '/images/avatar_default.png',
        college: ''
      }
    })
    return { code: 0, data }
  }

  // ========== 举报操作 ==========
  async function reportContent(openid, data) {
    await getUserForAction(openid, { requireActive: true })
    if (['heart_profile','heart_photo'].includes(data.targetType)) {
      if (typeof data.targetId !== 'string' || !data.targetId || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 200) return {code:-1,msg:'请填写有效举报原因（最多200字）'}
      const target = await db.collection('heart_profiles').doc(data.targetId).get()
      if (!target.data) return {code:-1,msg:'资料不存在'}
      if (data.targetType === 'heart_photo') {
        const photoFileId = typeof data.photoFileId === 'string' ? data.photoFileId.trim() : ''
        const photoIndex = Number(data.photoIndex)
        if (!photoFileId || !Number.isInteger(photoIndex) || photoIndex < 0 || !Array.isArray(target.data.photos) || target.data.photos[photoIndex] !== photoFileId) {
          return { code: -1, msg: '举报图片与心动资料不匹配' }
        }
      }
    }
    const existing = await db.collection('reports').where({
      _openid: openid,
      targetId: data.targetId,
      targetType: data.targetType,
      ...(data.targetType === 'heart_photo' ? { photoFileId: data.photoFileId } : {})
    }).count()

    if (existing.total > 0) return { code: -1, msg: '您已举报过该内容' }

    await db.collection('reports').add({
      data: {
        _openid: openid,
        targetId: data.targetId,
        targetType: data.targetType,
        ...(data.targetType === 'heart_photo' ? { photoFileId: data.photoFileId, photoIndex: Number(data.photoIndex) } : {}),
        reason: data.reason,
        status: 'pending',
        createTime: db.serverDate()
      }
    })

    return { code: 0, msg: '举报已提交，我们会尽快处理' }
  }

  // ========== 管理员操作 ==========
  async function banUser(openid, targetOpenid) {
    const isAdmin = await checkAdmin(openid)
    if (!isAdmin) return { code: -1, msg: '无管理员权限' }

    const targetRes = await db.collection('users').where({ _openid: targetOpenid }).limit(1).get()
    const targetUser = (targetRes.data || [])[0]
    await db.collection('users').where({ _openid: targetOpenid }).update({
      data: { status: 'banned', banTime: db.serverDate() }
    })

    await db.collection('posts').where({ _openid: targetOpenid, status: 'active' }).update({
      data: { status: 'hidden', hiddenBy: 'banUser', hiddenAt: db.serverDate() }
    })
    await db.collection('market_goods').where({ _openid: targetOpenid, status: 'active' }).update({
      data: { status: 'hidden', hiddenBy: 'banUser', hiddenAt: db.serverDate() }
    }).catch((err) => {
      if (!(err && err.message && err.message.includes('not exist'))) throw err
    })
    await db.collection('comments').where({ _openid: targetOpenid, status: 'active' }).update({
      data: { status: 'hidden', hiddenBy: 'banUser', hiddenAt: db.serverDate() }
    })
    await db.collection('market_comments').where({ _openid: targetOpenid, status: 'active' }).update({
      data: { status: 'hidden', hiddenBy: 'banUser', hiddenAt: db.serverDate() }
    }).catch((err) => {
      if (!(err && err.message && err.message.includes('not exist'))) throw err
    })
    if (targetUser) {
      const targetUserId = targetUser.internalUserId || publicId(targetOpenid)
      await db.collection('heart_profiles').doc(targetUserId).update({
        data: { enabled: false, allowFateCard: false, updatedAt: db.serverDate(), disabledBy: 'banUser' }
      }).catch((err) => {
        if (!(err && /(?:not exist|not found)/i.test(String(err.message || err.errMsg || '')))) throw err
      })
    }

    return { code: 0, msg: '用户已封禁' }
  }

  return {
    USER_BLOCKS,
    safeUserBlocksQuery,
    conversationBlocked,
    viewerBlockedByAuthor,
    findAuthorsHiddenByBlockRelation,
    contentDetailBlocked,
    toggleUserBlock,
    getBlockRelation,
    getBlockedUsersList,
    reportContent,
    banUser
  }
}

module.exports = createSafetyModule
