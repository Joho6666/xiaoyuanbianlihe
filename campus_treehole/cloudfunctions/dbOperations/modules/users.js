// modules/users.js - 用户资料、关系与账户管理业务模块
// 负责用户资料查询修改、关注/粉丝、隐私协议与注销

function createUsersModule({ db, _, cloud, helpers }) {
  const {
    getUserForAction,
    getUsersByOpenids,
    checkAdmin,
    checkBannedWords,
    wxTextCheck,
    wxImageCheck,
    escapeRegExp,
    DEFAULT_CAMPUS_ID,
    conversationBlocked,
    viewerBlockedByAuthor,
    addNotification,
    USER_BLOCKS,
    safeUserBlocksQuery,
    isCollectionNotExistError,
    getMarketModule
  } = helpers

  async function toggleFollow(openid, targetOpenid) {
    await getUserForAction(openid, { requireActive: true })
    const normalizedTarget = typeof targetOpenid === 'string' ? targetOpenid.trim() : ''
    if (!normalizedTarget) return { code: -1, msg: '目标用户参数缺失' }
    if (openid === normalizedTarget) return { code: -1, msg: '不能关注自己' }

    const targetRes = await db.collection('users').where({
      _openid: normalizedTarget,
      status: 'active'
    }).limit(1).get()
    if (targetRes.data.length === 0) {
      return { code: -1, msg: '目标用户不存在或已停用' }
    }

    if (await conversationBlocked(openid, normalizedTarget)) {
      return { code: -1, msg: '无法关注该用户' }
    }

    const existing = await db.collection('follows').where({
      _openid: openid, targetOpenid: normalizedTarget
    }).get()

    if (existing.data.length > 0) {
      for (const row of existing.data) {
        await db.collection('follows').doc(row._id).remove()
      }
      return { code: 0, data: { isFollowing: false } }
    } else {
      await db.collection('follows').add({
        data: { _openid: openid, targetOpenid: normalizedTarget, createTime: db.serverDate() }
      })
      if (typeof addNotification === 'function') {
        await addNotification({
          toOpenid: normalizedTarget,
          fromOpenid: openid,
          type: 'user_follow',
          targetType: 'user',
          targetId: normalizedTarget,
          content: '关注了你'
        })
      }
      return { code: 0, data: { isFollowing: true } }
    }
  }

  async function getFollowingList(openid, { page = 1, pageSize = 50 }) {
    const follows = await db.collection('follows').where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize).limit(pageSize).get()

    const targetIds = follows.data.map((f) => f.targetOpenid)
    if (targetIds.length === 0) return { code: 0, data: [], total: 0 }

    const users = await getUsersByOpenids(targetIds, { status: 'active' })
    return { code: 0, data: users, total: targetIds.length }
  }

  async function getFollowerList(openid, { page = 1, pageSize = 50 }) {
    const followers = await db.collection('follows').where({ targetOpenid: openid })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize).limit(pageSize).get()

    const followerIds = followers.data.map((f) => f._openid)
    if (followerIds.length === 0) return { code: 0, data: [], total: 0 }

    const users = await getUsersByOpenids(followerIds, { status: 'active' })
    return { code: 0, data: users, total: followerIds.length }
  }

  async function getUserInfo(openid, targetIdentifier) {
    if (!targetIdentifier) return { code: -1, msg: '缺少目标用户标识' }
    let user = null
    const res = await db.collection('users').where({ _openid: targetIdentifier }).limit(1).get()
    if (res.data.length > 0) {
      user = res.data[0]
    } else {
      try {
        const docRes = await db.collection('users').doc(targetIdentifier).get()
        if (docRes && docRes.data) user = docRes.data
      } catch (e) {}
    }
    if (!user) return { code: -1, msg: '用户不存在' }

    const targetOpenid = user._openid
    if (openid && targetOpenid && openid !== targetOpenid) {
      if (await viewerBlockedByAuthor(openid, targetOpenid)) {
        return { code: -1, msg: '对方已将你拉黑，无法查看其主页' }
      }
    }

    const [followingRes, followerRes] = await Promise.all([
      db.collection('follows').where({ _openid: targetOpenid }).count(),
      db.collection('follows').where({ targetOpenid }).count()
    ])

    let isFollowing = false
    let iBlockedThem = false
    if (openid && targetOpenid && openid !== targetOpenid) {
      const [followRes, blockOwnRes] = await Promise.all([
        db.collection('follows').where({ _openid: openid, targetOpenid }).count(),
        typeof safeUserBlocksQuery === 'function'
          ? safeUserBlocksQuery(() =>
              db.collection(USER_BLOCKS).where({ blockerOpenid: openid, blockedOpenid: targetOpenid }).limit(1).get()
            )
          : null
      ])
      isFollowing = followRes.total > 0
      iBlockedThem = !!(blockOwnRes && (blockOwnRes.data || []).length > 0)
    }

    return {
      code: 0,
      data: {
        ...user,
        userId: user._id,
        followingCount: followingRes.total,
        followerCount: followerRes.total,
        isFollowing,
        iBlockedThem
      }
    }
  }

  async function updateProfile(openid, data) {
    const allowedFields = [
      'nickName', 'avatarUrl', 'college', 'bio', 'tags', 'coverImage',
      'profileCompleted', 'campusId', 'campusName', 'notifyEnabled',
      'notifyPrefs', 'notifyAcceptedTemplateIds', 'notifyAcceptTime'
    ]
    const updateData = {}
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key]
      }
    }

    if (updateData.campusName && !updateData.college) {
      updateData.college = updateData.campusName
    }

    if (updateData.nickName) {
      const check = checkBannedWords(updateData.nickName)
      if (!check.pass) return { code: -2, msg: `昵称包含违规词"${check.word}"` }
    }
    if (updateData.bio) {
      const check = checkBannedWords(updateData.bio)
      if (!check.pass) return { code: -2, msg: `简介包含违规词"${check.word}"` }
    }

    if (updateData.nickName) {
      const wxCheck = await wxTextCheck(openid, String(updateData.nickName))
      if (!wxCheck.pass) return { code: -2, msg: '昵称未通过安全审核' }
    }
    if (updateData.bio) {
      const wxCheck = await wxTextCheck(openid, String(updateData.bio))
      if (!wxCheck.pass) return { code: -2, msg: '简介未通过安全审核' }
    }

    if (updateData.avatarUrl) {
      const avatar = String(updateData.avatarUrl || '').trim()
      if (avatar && avatar.startsWith('cloud://')) {
        const wxAvatar = await wxImageCheck(openid, avatar)
        if (!wxAvatar.pass) return { code: -2, msg: '头像未通过安全审核' }
      } else if (avatar) {
        return { code: -2, msg: '头像需先上传到云存储后再提交' }
      }
    }
    if (updateData.coverImage) {
      const cover = String(updateData.coverImage || '').trim()
      if (cover && cover.startsWith('cloud://')) {
        const wxCover = await wxImageCheck(openid, cover)
        if (!wxCover.pass) return { code: -2, msg: '封面未通过安全审核' }
      } else if (cover) {
        return { code: -2, msg: '封面需先上传到云存储后再提交' }
      }
    }

    await db.collection('users').where({ _openid: openid }).update({ data: updateData })
    return { code: 0, msg: '资料更新成功' }
  }

  async function updateNotifySettings(openid, data = {}) {
    const notifyEnabled = data.notifyEnabled !== undefined ? !!data.notifyEnabled : true
    const rawPrefs = data.notifyPrefs || {}
    const prefs = {
      dm: rawPrefs.dm !== false,
      comment: rawPrefs.comment !== false,
      like: rawPrefs.like !== false,
      favorite: rawPrefs.favorite !== false,
      share: rawPrefs.share !== false,
      announcement: rawPrefs.announcement !== false,
      offshelf: rawPrefs.offshelf !== false
    }
    const acceptedTemplateIds = Array.isArray(data.acceptedTemplateIds)
      ? data.acceptedTemplateIds.filter((id) => typeof id === 'string' && id.trim())
      : []
    const updateData = {
      notifyEnabled,
      notifyPrefs: prefs,
      notifyAcceptTime: db.serverDate()
    }
    if (acceptedTemplateIds.length) {
      updateData.notifyAcceptedTemplateIds = acceptedTemplateIds
    }
    await db.collection('users').where({ _openid: openid }).update({ data: updateData })
    return { code: 0, msg: '通知设置已更新' }
  }

  async function searchUsers(openid, keyword) {
    const baseFilters = [{ status: 'active' }]
    if (openid) {
      baseFilters.push({ _openid: _.neq(openid) })
    }

    const kw = keyword == null ? '' : String(keyword).trim()
    if (!kw) {
      const cond = baseFilters.length > 1 ? _.and(baseFilters) : baseFilters[0]
      const res = await db.collection('users').where(cond).limit(20).get()
      return { code: 0, data: res.data }
    }

    const regex = db.RegExp({ regexp: escapeRegExp(kw), options: 'i' })
    const orBranches = [
      { nickName: regex },
      { college: regex },
      { numericId: regex }
    ]
    if (/^\d+$/.test(kw)) {
      orBranches.push({ numericId: kw })
      const nidNum = Number(kw)
      if (!Number.isNaN(nidNum)) orBranches.push({ numericId: nidNum })
    }
    const cond = _.and([
      ...baseFilters,
      _.or(orBranches)
    ])
    const res = await db.collection('users').where(cond).limit(20).get()
    return { code: 0, data: res.data }
  }

  async function runMigrateCampusDefaults() {
    const name = '桂林航天工业学院'
    const whereMissing = _.or([
      { campusId: _.exists(false) },
      { campusId: '' }
    ])
    let postsUpdated = 0
    let goodsUpdated = 0
    let usersUpdated = 0
    try {
      const pr = await db.collection('posts').where(whereMissing).update({
        data: { campusId: DEFAULT_CAMPUS_ID }
      })
      postsUpdated = (pr && pr.stats && pr.stats.updated) || 0
    } catch (e) {}
    try {
      const gr = await db.collection('market_goods').where(whereMissing).update({
        data: { campusId: DEFAULT_CAMPUS_ID }
      })
      goodsUpdated = (gr && gr.stats && gr.stats.updated) || 0
    } catch (e) {}
    try {
      const ur = await db.collection('users').where(whereMissing).update({
        data: {
          campusId: DEFAULT_CAMPUS_ID,
          campusName: name,
          college: name
        }
      })
      usersUpdated = (ur && ur.stats && ur.stats.updated) || 0
    } catch (e) {}
    return {
      code: 0,
      msg: '迁移完成',
      data: { postsUpdated, goodsUpdated, usersUpdated, campusId: DEFAULT_CAMPUS_ID }
    }
  }

  async function migrateCampusDefaults(openid) {
    if (!(await checkAdmin(openid))) {
      return { code: -403, msg: '仅管理员可执行校区字段迁移' }
    }
    return await runMigrateCampusDefaults()
  }

  async function agreePrivacy(openid) {
    await db.collection('users').where({ _openid: openid }).update({
      data: { agreedPrivacy: true, agreeTime: db.serverDate() }
    })
    return { code: 0, msg: '已同意隐私协议' }
  }

  async function removeDocsByQuery(collectionName, condition) {
    let hasMore = true
    while (hasMore) {
      const res = await db.collection(collectionName).where(condition).limit(20).get()
      if (res.data.length === 0) {
        hasMore = false
        break
      }
      for (const doc of res.data) {
        await db.collection(collectionName).doc(doc._id).remove()
      }
    }
  }

  async function deleteAccount(openid) {
    await db.collection('users').where({ _openid: openid }).update({
      data: { status: 'deleted', deleteTime: db.serverDate() }
    })
    await db.collection('posts').where({ _openid: openid }).update({
      data: { status: 'deleted' }
    })
    await db.collection('comments').where({ _openid: openid }).update({
      data: { status: 'deleted' }
    })
    await db.collection('market_comments').where({ _openid: openid }).update({
      data: { status: 'deleted' }
    }).catch((err) => {
      if (!(err && err.message && err.message.includes('not exist'))) throw err
    })
    await db.collection('market_goods').where({ _openid: openid }).update({
      data: { status: 'deleted' }
    })

    const ownCollections = ['likes', 'favors', 'market_favors', 'market_wants', 'reports']
    for (const col of ownCollections) {
      await removeDocsByQuery(col, { _openid: openid })
    }

    await removeDocsByQuery('follows', _.or([
      { _openid: openid },
      { targetOpenid: openid }
    ]))

    try {
      await removeDocsByQuery(USER_BLOCKS, _.or([
        { blockerOpenid: openid },
        { blockedOpenid: openid }
      ]))
    } catch (e) {
      if (!isCollectionNotExistError(e)) throw e
    }

    await removeDocsByQuery('messages', _.or([
      { fromOpenid: openid },
      { toOpenid: openid }
    ]))

    await removeDocsByQuery('notifications', _.or([
      { fromOpenid: openid },
      { toOpenid: openid }
    ]))

    return { code: 0, msg: '账号已注销' }
  }

  async function getUserMarketGoods(viewerOpenid, targetOpenid, opts = {}) {
    if (typeof getMarketModule === 'function') {
      return await getMarketModule().getUserMarketGoods(viewerOpenid, targetOpenid, opts)
    }
    return { code: 0, data: [] }
  }

  return {
    toggleFollow,
    getFollowingList,
    getFollowerList,
    getUserInfo,
    updateProfile,
    updateNotifySettings,
    searchUsers,
    migrateCampusDefaults,
    runMigrateCampusDefaults,
    agreePrivacy,
    deleteAccount,
    getUserMarketGoods
  }
}

module.exports = createUsersModule
