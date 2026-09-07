// modules/buddies.js - 同频找搭子业务模块
// 负责搭子组局发布、5 态成局流转、申请与审批看板

function createBuddiesModule({ db, _, cloud, helpers }) {
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
    triggerSubscribeNotify
  } = helpers

  /**
   * 查询搭子广场列表
   */
  async function getBuddyPosts({ page = 1, pageSize = 20, category, status, keyword, campusId }) {
    try {
      let query = db.collection('buddy_posts')
      const targetCampus = resolveCampusIdForRead(campusId)
      let condition = campusWhereClause(targetCampus)

      if (category && category !== 'all') {
        condition.category = category
      }

      if (status && status !== 'all') {
        condition.status = status
      } else if (!status) {
        // 默认优先展示招募中与满员状态
        condition.status = (_ && typeof _.in === 'function') ? _.in(['OPEN', 'FULL']) : 'OPEN'
      }

      if (keyword && String(keyword).trim()) {
        const kw = escapeRegExp(String(keyword).trim())
        condition.title = db.RegExp({ regexp: kw, options: 'i' })
      }

      const skip = (Math.max(1, page) - 1) * pageSize
      const res = await query
        .where(condition)
        .orderBy('startAt', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()

      return { code: 0, data: res.data || [] }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        return { code: 0, data: [] }
      }
      console.error('getBuddyPosts error:', err)
      return { code: -1, msg: '获取搭子列表失败: ' + err.message, data: [] }
    }
  }

  /**
   * 获取搭子组局详情
   */
  async function getBuddyPostById({ id, openid }) {
    if (!id) return { code: -1, msg: '缺少组局 ID' }
    try {
      const postRes = await db.collection('buddy_posts').doc(id).get()
      const post = (postRes && postRes.data) || null
      if (!post) return { code: -1, msg: '搭子组局不存在' }

      // 获取已通过的成员列表
      let acceptedMembers = []
      try {
        const appRes = await db.collection('buddy_applications')
          .where({ postId: id, status: 'ACCEPTED' })
          .limit(20)
          .get()
        acceptedMembers = appRes.data || []
      } catch (e) {
        if (!isCollectionNotExistError(e)) console.error('get applications error:', e)
      }

      // 获取当前用户的申请状态（如果是申请者）
      let userApplication = null
      let pendingApplications = []
      if (openid) {
        if (openid === post._openid) {
          // 发起人：查看所有待审批申请
          try {
            const pendingRes = await db.collection('buddy_applications')
              .where({ postId: id, status: 'PENDING' })
              .orderBy('createTime', 'asc')
              .get()
            pendingApplications = pendingRes.data || []
          } catch (e) {
            if (!isCollectionNotExistError(e)) console.error('get pending apps error:', e)
          }
        } else {
          // 普通访客：查看自己的申请状态
          try {
            const myAppRes = await db.collection('buddy_applications')
              .where({ postId: id, applicantId: openid })
              .limit(1)
              .get()
            if (myAppRes.data && myAppRes.data.length > 0) {
              userApplication = myAppRes.data[0]
            }
          } catch (e) {
            if (!isCollectionNotExistError(e)) console.error('get my app error:', e)
          }
        }
      }

      return {
        code: 0,
        data: {
          ...post,
          acceptedMembers,
          pendingApplications,
          userApplication,
          isAuthor: openid === post._openid
        }
      }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        return { code: -1, msg: '暂无该组局' }
      }
      return { code: -1, msg: '查询失败: ' + err.message }
    }
  }

  /**
   * 发布搭子招募
   */
  async function addBuddyPost(openid, postData = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const title = String(postData.title || '').trim()
    if (!title || title.length < 3) return { code: -1, msg: '活动标题至少 3 个字' }
    if (!postData.startAt) return { code: -1, msg: '请选择活动开始时间' }

    // 检查违禁词
    checkBannedWords(title)
    if (postData.description) checkBannedWords(postData.description)

    // 微信内容安全审查
    await wxTextCheck(`${title} ${postData.description || ''}`, openid)

    // 获取发布者信息
    const user = await getUserForAction(openid)
    const minPeople = Math.max(2, Number(postData.minPeople) || 2)
    const maxPeople = Math.max(minPeople, Number(postData.maxPeople) || 4)
    const campusId = resolveCampusIdForRead(postData.campusId || user.campusId || DEFAULT_CAMPUS_ID)

    const newPost = {
      _openid: openid,
      authorId: openid,
      author: {
        nickName: user.nickName || '同学',
        avatarUrl: user.avatarUrl || '/images/avatar_default.png',
        gender: user.gender || 0
      },
      category: postData.category || 'sports',
      title,
      description: String(postData.description || '').trim(),
      startAt: String(postData.startAt),
      endAt: postData.endAt ? String(postData.endAt) : null,
      location: String(postData.location || '').trim(),
      minPeople,
      maxPeople,
      acceptedCount: 1, // 发起人自带 1 席
      genderRequirement: ['any', 'male_only', 'female_only'].includes(postData.genderRequirement) ? postData.genderRequirement : 'any',
      schoolOnly: !!postData.schoolOnly,
      campusId,
      status: 'OPEN',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    try {
      const res = await db.collection('buddy_posts').add({ data: newPost })
      return { code: 0, msg: '发布成功', data: { id: res._id } }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('buddy_posts')
        const res = await db.collection('buddy_posts').add({ data: newPost })
        return { code: 0, msg: '发布成功', data: { id: res._id } }
      }
      console.error('addBuddyPost error:', err)
      return { code: -1, msg: '发布失败: ' + err.message }
    }
  }

  /**
   * 申请加入搭子
   */
  async function applyBuddyPost(openid, { postId, message = '' }) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!postId) return { code: -1, msg: '缺少组局 ID' }

    const postRes = await db.collection('buddy_posts').doc(postId).get()
    const post = (postRes && postRes.data) || null
    if (!post) return { code: -1, msg: '搭子组局不存在' }
    if (post._openid === openid) return { code: -1, msg: '您是发起人，无需申请' }
    if (post.status !== 'OPEN') return { code: -1, msg: '该组局当前不在招募状态' }
    if (post.acceptedCount >= post.maxPeople) return { code: -1, msg: '该组局人数已满' }

    // 检查重复申请
    try {
      const existRes = await db.collection('buddy_applications')
        .where({ postId, applicantId: openid })
        .limit(1)
        .get()
      if (existRes.data && existRes.data.length > 0) {
        const exist = existRes.data[0]
        if (exist.status === 'PENDING') return { code: -1, msg: '您已提交申请，请等待发起人确认' }
        if (exist.status === 'ACCEPTED') return { code: -1, msg: '您已加入该组局' }
      }
    } catch (e) {
      if (!isCollectionNotExistError(e)) throw e
    }

    const applicant = await getUserForAction(openid)
    const newApp = {
      postId,
      postTitle: post.title,
      authorOpenid: post._openid,
      applicantId: openid,
      applicant: {
        nickName: applicant.nickName || '同学',
        avatarUrl: applicant.avatarUrl || '/images/avatar_default.png',
        gender: applicant.gender || 0
      },
      message: String(message || '').trim(),
      status: 'PENDING',
      createTime: db.serverDate()
    }

    try {
      const addRes = await db.collection('buddy_applications').add({ data: newApp })
      return { code: 0, msg: '申请已提交', data: { id: addRes._id } }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('buddy_applications')
        const addRes = await db.collection('buddy_applications').add({ data: newApp })
        return { code: 0, msg: '申请已提交', data: { id: addRes._id } }
      }
      return { code: -1, msg: '申请失败: ' + err.message }
    }
  }

  /**
   * 发起人审批申请 (通过 / 拒绝)
   */
  async function handleBuddyApplication(openid, { applicationId, action }) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!applicationId || !['ACCEPT', 'REJECT'].includes(action)) {
      return { code: -1, msg: '参数不合法' }
    }

    const appRes = await db.collection('buddy_applications').doc(applicationId).get()
    const appData = (appRes && appRes.data) || null
    if (!appData) return { code: -1, msg: '申请记录不存在' }
    if (appData.authorOpenid !== openid) return { code: -1, msg: '无权处理该申请' }
    if (appData.status !== 'PENDING') return { code: -1, msg: '该申请已处理' }

    const postRes = await db.collection('buddy_posts').doc(appData.postId).get()
    const post = (postRes && postRes.data) || null
    if (!post) return { code: -1, msg: '组局不存在' }

    if (action === 'ACCEPT') {
      if (post.acceptedCount >= post.maxPeople) {
        return { code: -1, msg: '人数已满，无法再通过新成员' }
      }
      await db.collection('buddy_applications').doc(applicationId).update({
        data: { status: 'ACCEPTED', decidedAt: db.serverDate() }
      })
      const nextCount = (post.acceptedCount || 1) + 1
      const updatePayload = { acceptedCount: nextCount, updateTime: db.serverDate() }
      if (nextCount >= post.maxPeople) {
        updatePayload.status = 'FULL'
      }
      await db.collection('buddy_posts').doc(appData.postId).update({ data: updatePayload })
      return { code: 0, msg: '已通过申请' }
    } else {
      await db.collection('buddy_applications').doc(applicationId).update({
        data: { status: 'REJECTED', decidedAt: db.serverDate() }
      })
      return { code: 0, msg: '已婉拒申请' }
    }
  }

  /**
   * 变更组局状态 (锁定满员 / 提前结束 / 取消)
   */
  async function updateBuddyPostStatus(openid, { postId, targetStatus }) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!postId || !['OPEN', 'FULL', 'FINISHED', 'CANCELLED'].includes(targetStatus)) {
      return { code: -1, msg: '参数不合法' }
    }

    const postRes = await db.collection('buddy_posts').doc(postId).get()
    const post = (postRes && postRes.data) || null
    if (!post) return { code: -1, msg: '组局不存在' }
    if (post._openid !== openid) return { code: -1, msg: '只有发起人可以修改状态' }

    await db.collection('buddy_posts').doc(postId).update({
      data: { status: targetStatus, updateTime: db.serverDate() }
    })
    return { code: 0, msg: '状态更新成功' }
  }

  /**
   * 获取我发起的搭子
   */
  async function getUserBuddyPosts(openid, { page = 1, pageSize = 20 } = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    try {
      const skip = (Math.max(1, page) - 1) * pageSize
      const res = await db.collection('buddy_posts')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
      return { code: 0, data: res.data || [] }
    } catch (err) {
      if (isCollectionNotExistError(err)) return { code: 0, data: [] }
      return { code: -1, msg: '查询失败: ' + err.message, data: [] }
    }
  }

  return {
    getBuddyPosts,
    getBuddyPostById,
    addBuddyPost,
    applyBuddyPost,
    handleBuddyApplication,
    updateBuddyPostStatus,
    getUserBuddyPosts
  }
}

module.exports = createBuddiesModule
