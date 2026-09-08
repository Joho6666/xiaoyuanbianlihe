// modules/posts.js - 校园圈动态、评论、点赞与收藏业务模块
// 负责帖子 CRUD、评论流转、防并发幂等点赞与收藏聚合

function createPostsModule({ db, _, cloud, helpers }) {
  const {
    getUserForAction,
    checkRateLimit,
    checkAdmin,
    checkBannedWords,
    wxTextCheck,
    wxImageBatchCheck,
    findAuthorsHiddenByBlockRelation,
    contentDetailBlocked,
    viewerBlockedByAuthor,
    addNotification,
    triggerSubscribeNotify,
    trimSnippet,
    makeDeterministicId,
    DEFAULT_CAMPUS_ID,
    resolveCampusIdForRead,
    campusWhereClause,
    escapeRegExp,
    getEventsModule
  } = helpers

  const ANONYMOUS_DISPLAY = {
    nickname: '匿名',
    avatar: '/images/avatar_default.png',
    college: '匿名'
  }

  function sanitizePostForClient(post, viewerOpenid, isAdmin) {
    if (!post || typeof post !== 'object') return post
    const authorOpenid = post._openid
    const isOwner = !!(authorOpenid && viewerOpenid && authorOpenid === viewerOpenid)

    let next = { ...post }

    if (post.isAnonymous === true && !isAdmin) {
      next = {
        ...next,
        nickname: ANONYMOUS_DISPLAY.nickname,
        avatar: ANONYMOUS_DISPLAY.avatar,
        college: ANONYMOUS_DISPLAY.college
      }
    }

    if (post.isAnonymous === true && !isOwner) {
      next = { ...next, _openid: '', userId: '' }
    }

    return next
  }

  async function sanitizePostsForClient(posts, viewerOpenid) {
    if (!posts || !posts.length) return posts
    const isAdmin = viewerOpenid ? await checkAdmin(viewerOpenid) : false
    return posts.map((p) => sanitizePostForClient(p, viewerOpenid, isAdmin))
  }

  function sortPostsByTimeDesc(arr) {
    return arr.sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0
      return tb - ta
    })
  }

  async function getPostsByIds(postIds, extraWhere = {}) {
    const normalizedIds = Array.from(new Set((postIds || []).filter(Boolean)))
    if (normalizedIds.length === 0) return []

    const posts = []
    for (let i = 0; i < normalizedIds.length; i += 20) {
      const chunk = normalizedIds.slice(i, i + 20)
      const where = { ...extraWhere, _id: _.in(chunk) }
      const res = await db.collection('posts').where(where).get()
      posts.push(...(res.data || []))
    }

    const orderMap = new Map(normalizedIds.map((id, index) => [id, index]))
    return posts.sort((a, b) => (orderMap.get(a._id) || 0) - (orderMap.get(b._id) || 0))
  }

  async function attachPostEngagement(openid, posts) {
    if (!posts.length || !openid) return posts
    const ids = posts.map((p) => p._id).filter(Boolean)
    const likedSet = new Set()
    const favorSet = new Set()
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20)
      const [likesRes, favorsRes] = await Promise.all([
        db.collection('likes').where({
          _openid: openid,
          targetType: 'post',
          targetId: _.in(chunk)
        }).get(),
        db.collection('favors').where({
          _openid: openid,
          postId: _.in(chunk)
        }).get()
      ])
      likesRes.data.forEach((l) => likedSet.add(l.targetId))
      favorsRes.data.forEach((f) => favorSet.add(f.postId))
    }
    return posts.map((p) => ({
      ...p,
      isLiked: likedSet.has(p._id),
      isFavored: favorSet.has(p._id)
    }))
  }

  async function getFollowTargetOpenids(openid, maxFollowCount = 2000) {
    const pageSize = 100
    const targetIds = []
    const seen = new Set()
    for (let skip = 0; skip < maxFollowCount; skip += pageSize) {
      const res = await db.collection('follows').where({ _openid: openid })
        .skip(skip)
        .limit(pageSize)
        .get()
      const rows = res.data || []
      if (rows.length === 0) break

      for (const row of rows) {
        const target = row && row.targetOpenid
        if (!target || seen.has(target)) continue
        seen.add(target)
        targetIds.push(target)
      }
      if (rows.length < pageSize) break
    }
    return targetIds
  }

  async function getPostsFollowMultiChunk(targetIds, { category, keyword, page, pageSize, campusId }) {
    const parts = [{ status: 'active' }]
    const cw = campusWhereClause(campusId || DEFAULT_CAMPUS_ID)
    if (cw) parts.push(cw)
    if (category && category !== '全部') parts.push({ category })
    if (keyword && keyword.trim()) {
      const regex = db.RegExp({ regexp: escapeRegExp(keyword.trim()), options: 'i' })
      parts.push(_.or([
        { content: regex },
        { title: regex },
        { nickname: regex }
      ]))
    }
    const base = parts.length === 1 ? parts[0] : _.and(parts)

    const chunks = []
    for (let i = 0; i < targetIds.length; i += 20) {
      chunks.push(targetIds.slice(i, i + 20))
    }

    const perChunkLimit = 100
    const collected = []
    for (const chunk of chunks) {
      const cond = _.and([base, { _openid: _.in(chunk) }])
      const r = await db.collection('posts').where(cond).orderBy('createTime', 'desc').limit(perChunkLimit).get()
      collected.push(...r.data)
    }
    const seen = new Set()
    const uniq = []
    for (const p of collected) {
      if (seen.has(p._id)) continue
      seen.add(p._id)
      uniq.push(p)
    }
    sortPostsByTimeDesc(uniq)
    const tops = uniq.filter((p) => p.isTop === true)
    const normals = uniq.filter((p) => p.isTop !== true)
    if (page === 1) {
      return [...tops, ...normals.slice(0, pageSize)]
    }
    const skip = (page - 1) * pageSize
    return normals.slice(skip, skip + pageSize)
  }

  async function getPosts(openid, { category, keyword, page = 1, pageSize = 20, feedType = 'discover', campusId: campusIdRaw }) {
    const campusIdRead = resolveCampusIdForRead({ campusId: campusIdRaw })
    if (campusIdRead === null) {
      return { code: 0, data: [] }
    }

    const isActivityFeed = feedType === 'activity'
    let categoryForQuery = isActivityFeed ? '校园活动' : category

    let followTargetIds = null
    if (feedType === 'follow') {
      followTargetIds = await getFollowTargetOpenids(openid)
      if (followTargetIds.length === 0) {
        return { code: 0, data: [] }
      }
      if (followTargetIds.length > 20) {
        let merged = await getPostsFollowMultiChunk(followTargetIds, { category: categoryForQuery, keyword, page, pageSize, campusId: campusIdRead })
        if (openid && merged.length > 0) {
          const hide = await findAuthorsHiddenByBlockRelation(openid, merged.map((p) => p._openid))
          merged = merged.filter((p) => !hide.has(p._openid))
        }
        const withEng = await attachPostEngagement(openid, merged)
        const data = await sanitizePostsForClient(withEng, openid)
        return { code: 0, data }
      }
    }

    const parts = [{ status: 'active' }]
    const cwMain = campusWhereClause(campusIdRead)
    if (cwMain) parts.push(cwMain)

    if (isActivityFeed && typeof getEventsModule === 'function') {
      const eventsMod = getEventsModule()
      const zoneDoc = await eventsMod.fetchActivityZoneConfigDoc()
      await eventsMod.maybeAutoFinalizeActivityZone(zoneDoc)
      const zoneAfter = await eventsMod.fetchActivityZoneConfigDoc()
      if (!eventsMod.activityZoneCore || !eventsMod.activityZoneCore.isActivityZoneRunning(zoneAfter)) {
        return { code: 0, data: [] }
      }
      parts.push({ category: '校园活动' })
      parts.push({ inActivityZone: true })
      if (zoneAfter.roundId) {
        parts.push({ activityRoundId: String(zoneAfter.roundId) })
      }
      categoryForQuery = '校园活动'
    } else if (categoryForQuery && categoryForQuery !== '全部') {
      parts.push({ category: categoryForQuery })
    }

    if (feedType === 'follow') {
      parts.push({ _openid: _.in(followTargetIds) })
    }

    if (keyword && keyword.trim()) {
      const regex = db.RegExp({
        regexp: escapeRegExp(keyword.trim()),
        options: 'i'
      })
      parts.push(_.or([
        { content: regex },
        { title: regex },
        { nickname: regex }
      ]))
    }

    const baseCondition = parts.length === 1 ? parts[0] : _.and(parts)

    const topPosts = page === 1
      ? await db.collection('posts').where(_.and([baseCondition, { isTop: true }])).orderBy('createTime', 'desc').get()
      : { data: [] }

    const normalPosts = await db.collection('posts').where(_.and([baseCondition, { isTop: _.neq(true) }]))
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    let allPosts = [...topPosts.data, ...normalPosts.data]
    if (openid && allPosts.length > 0) {
      const hide = await findAuthorsHiddenByBlockRelation(openid, allPosts.map((p) => p._openid))
      allPosts = allPosts.filter((p) => !hide.has(p._openid))
    }
    allPosts = await attachPostEngagement(openid, allPosts)
    allPosts = await sanitizePostsForClient(allPosts, openid)

    return { code: 0, data: allPosts }
  }

  async function getPostById(postId, openid) {
    let postRes
    try {
      postRes = await db.collection('posts').doc(postId).get()
    } catch (err) {
      return { code: -1, msg: '帖子不存在或已删除' }
    }
    const post = postRes && postRes.data
    if (!post || !post._id || post.status !== 'active') {
      return { code: -1, msg: '帖子不存在或已删除' }
    }

    const authorOpenid = post._openid
    if (authorOpenid && openid && authorOpenid !== openid) {
      if (await contentDetailBlocked(openid, authorOpenid)) {
        return { code: -1, msg: '无法查看该帖子' }
      }
    }

    let isLiked = false
    let isFavored = false
    let isAdmin = false
    if (openid) {
      const [likeRes, favorRes, adminFlag] = await Promise.all([
        db.collection('likes').where({ _openid: openid, targetId: postId, targetType: 'post' }).count(),
        db.collection('favors').where({ _openid: openid, postId: postId }).count(),
        checkAdmin(openid)
      ])
      isLiked = likeRes.total > 0
      isFavored = favorRes.total > 0
      isAdmin = adminFlag
    }

    const data = sanitizePostForClient(
      {
        ...post,
        isLiked,
        isFavored
      },
      openid,
      isAdmin
    )

    return { code: 0, data }
  }

  async function addPost(openid, data) {
    const user = await getUserForAction(openid, { requireActive: true })
    const isAdmin = await checkAdmin(openid)

    const canPost = await checkRateLimit(openid, 'posts', 5, 3)
    if (!canPost) return { code: -1, msg: '发布太频繁，请稍后再试' }

    const textToCheck = (data.title || '') + ' ' + (data.content || '')
    const localCheck = checkBannedWords(textToCheck)
    if (!localCheck.pass) return { code: -2, msg: `内容包含违规词"${localCheck.word}"`, word: localCheck.word }

    const images = Array.isArray(data.images) ? data.images : []
    const imagePromise = wxImageBatchCheck(openid, images)
    const wxCheck = await wxTextCheck(openid, textToCheck)
    if (!wxCheck.pass) {
      imagePromise.catch((e) => console.warn('addPost: image check after text fail', e))
      return { code: -2, msg: '内容未通过安全审核' }
    }
    const wxImageRes = await imagePromise
    if (!wxImageRes.pass) return { code: -2, msg: '图片未通过安全审核' }

    const videos = Array.isArray(data.videos) ? data.videos : []
    const thumbImages = Array.isArray(data.thumbImages) ? data.thumbImages : []
    if (videos.length > 0 && !isAdmin) {
      return { code: -1, msg: '仅管理员可发布视频' }
    }

    const campusIdPost =
      typeof data.campusId === 'string' && data.campusId.trim()
        ? data.campusId.trim()
        : (user.campusId || DEFAULT_CAMPUS_ID)
    const displayCollege = user.campusName || user.college || '未设置'

    const newPost = {
      _openid: openid,
      nickname: user.nickName || '未知用户',
      avatar: user.avatarUrl || '/images/avatar_default.png',
      college: displayCollege,
      campusId: campusIdPost,
      userId: openid,
      category: data.category || '校园生活',
      title: data.title || '',
      content: data.content,
      images,
      thumbImages,
      videos,
      image: images.length > 0 ? images[0] : '',
      likes: 0,
      comments: 0,
      isAnonymous: false,
      location: data.location || '',
      isTop: false,
      status: videos.length > 0 ? 'pending' : 'active',
      createTime: db.serverDate()
    }

    if (typeof getEventsModule === 'function') {
      const eventsMod = getEventsModule()
      if (eventsMod && typeof eventsMod.resolveActivityTagsForPost === 'function') {
        Object.assign(newPost, await eventsMod.resolveActivityTagsForPost(campusIdPost, newPost.category))
      }
    }

    const addRes = await db.collection('posts').add({ data: newPost })
    await db.collection('users').where({ _openid: openid }).update({
      data: { postCount: _.inc(1) }
    })

    return { code: 0, msg: '发布成功', data: { _id: addRes._id } }
  }

  async function updatePost(openid, data) {
    const user = await getUserForAction(openid, { requireActive: true })
    const postId = data.postId
    const postRes = await db.collection('posts').doc(postId).get()
    const post = postRes.data

    if (!post || !post._id || post.status === 'deleted') {
      return { code: -1, msg: '帖子不存在或已删除' }
    }

    const isAdmin = await checkAdmin(openid)
    if (!isAdmin && post._openid !== openid) {
      return { code: -1, msg: '无权编辑该帖子' }
    }

    const title = String(data.title || '').trim()
    const content = String(data.content || '').trim()
    if (!content) return { code: -1, msg: '正文不能为空' }

    const textToCheck = `${title} ${content}`.trim()
    const localCheck = checkBannedWords(textToCheck)
    if (!localCheck.pass) return { code: -2, msg: `内容包含违规词"${localCheck.word}"`, word: localCheck.word }

    const images = Array.isArray(data.images) ? data.images : []
    const imagePromise = wxImageBatchCheck(openid, images)
    const wxCheck = await wxTextCheck(openid, textToCheck)
    if (!wxCheck.pass) {
      imagePromise.catch((e) => console.warn('updatePost: image check after text fail', e))
      return { code: -2, msg: '内容未通过安全审核' }
    }
    const wxImageRes = await imagePromise
    if (!wxImageRes.pass) return { code: -2, msg: '图片未通过安全审核' }

    const videos = Array.isArray(data.videos) ? data.videos : []
    const thumbImages = Array.isArray(data.thumbImages) ? data.thumbImages : []
    if (videos.length > 0 && !isAdmin) {
      return { code: -1, msg: '仅管理员可发布视频' }
    }

    const campusIdUpdate =
      typeof data.campusId === 'string' && data.campusId.trim()
        ? data.campusId.trim()
        : (post.campusId || user.campusId || DEFAULT_CAMPUS_ID)
    const displayCollegeUpdate = user.campusName || user.college || post.college || '未设置'

    const updateData = {
      title,
      content,
      category: data.category || post.category || '校园生活',
      images,
      thumbImages,
      videos,
      image: images.length > 0 ? images[0] : '',
      isAnonymous: false,
      location: data.location || '',
      nickname: user.nickName || post.nickname || '未知用户',
      avatar: user.avatarUrl || post.avatar || '/images/avatar_default.png',
      college: displayCollegeUpdate,
      campusId: campusIdUpdate,
      updateTime: db.serverDate()
    }

    if (JSON.stringify(post.videos || []) !== JSON.stringify(videos)) {
      updateData.status = videos.length > 0 ? 'pending' : 'active'
    }

    if (typeof getEventsModule === 'function') {
      const eventsMod = getEventsModule()
      if (eventsMod && typeof eventsMod.resolveActivityTagsForPost === 'function') {
        Object.assign(updateData, await eventsMod.resolveActivityTagsForPost(campusIdUpdate, updateData.category, post))
      }
    }

    await db.collection('posts').doc(postId).update({ data: updateData })
    return { code: 0, msg: '更新成功' }
  }

  async function deletePost(openid, postId) {
    await getUserForAction(openid, { requireActive: true })
    const isAdmin = await checkAdmin(openid)
    let postRes
    try {
      postRes = await db.collection('posts').doc(postId).get()
    } catch (err) {
      return { code: -1, msg: '帖子不存在' }
    }
    const post = postRes && postRes.data
    if (!post || !post._id) return { code: -1, msg: '帖子不存在' }

    if (!isAdmin && post._openid !== openid) {
      return { code: -1, msg: '无权删除该帖子' }
    }

    await db.collection('posts').doc(postId).update({
      data: { status: 'deleted' }
    })
    return { code: 0, msg: '删除成功' }
  }

  async function toggleTopPost(openid, postId) {
    await getUserForAction(openid, { requireActive: true })
    const isAdmin = await checkAdmin(openid)
    if (!isAdmin) return { code: -1, msg: '无管理员权限' }

    let postRes
    try {
      postRes = await db.collection('posts').doc(postId).get()
    } catch (err) {
      return { code: -1, msg: '帖子不存在' }
    }
    const post = postRes && postRes.data
    if (!post || !post._id) return { code: -1, msg: '帖子不存在' }

    const newIsTop = !post.isTop
    await db.collection('posts').doc(postId).update({
      data: { isTop: newIsTop }
    })
    return { code: 0, data: { isTop: newIsTop } }
  }

  async function getComments(postId, sortBy = 'hot') {
    let query = db.collection('comments').where({ postId, status: 'active' })
    if (sortBy === 'hot') {
      query = query.orderBy('likes', 'desc')
    } else {
      query = query.orderBy('createTime', 'desc')
    }
    const res = await query.limit(100).get()
    return { code: 0, data: res.data }
  }

  async function addComment(openid, data) {
    const actor = await getUserForAction(openid, { requireActive: true })
    if (actor.isMuted) return { code: -1, msg: '您已被禁言，无法评论' }

    const postPre = await db.collection('posts').doc(data.postId).get().catch(() => ({ data: null }))
    const postAuthor = postPre && postPre.data && postPre.data._openid
    const postOk = postPre && postPre.data && postPre.data.status === 'active'
    if (!postOk || !postAuthor) return { code: -1, msg: '帖子不存在或已删除' }
    if (await contentDetailBlocked(openid, postAuthor)) {
      return { code: -1, msg: '无法评论该帖子' }
    }

    const canComment = await checkRateLimit(openid, 'comments', 1, 5)
    if (!canComment) return { code: -1, msg: '评论太频繁，请稍后再试' }

    const localCheck = checkBannedWords(data.content)
    if (!localCheck.pass) return { code: -2, msg: `评论包含违规词"${localCheck.word}"`, word: localCheck.word }

    const wxCheck = await wxTextCheck(openid, data.content)
    if (!wxCheck.pass) return { code: -2, msg: '评论未通过安全审核' }

    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data[0] || {}

    const newComment = {
      _openid: openid,
      postId: data.postId,
      nickname: user.nickName || '未知用户',
      avatar: user.avatarUrl || '/images/avatar_default.png',
      content: data.content,
      likes: 0,
      replyTo: data.replyTo || null,
      status: 'active',
      createTime: db.serverDate()
    }

    const addRes = await db.collection('comments').add({ data: newComment })
    await db.collection('posts').doc(data.postId).update({
      data: { comments: _.inc(1) }
    })

    const postRes = await db.collection('posts').doc(data.postId).get().catch(() => ({ data: null }))
    const post = postRes.data || {}

    await addNotification({
      toOpenid: post._openid,
      fromOpenid: openid,
      type: 'post_comment',
      targetType: 'post',
      targetId: data.postId,
      postId: data.postId,
      commentId: addRes._id,
      content: trimSnippet(data.content),
      itemTitle: trimSnippet(post.title || post.content || '帖子')
    })
    await triggerSubscribeNotify({
      toOpenid: post._openid,
      sceneType: 'comment',
      actorName: user.nickName || '有人',
      summary: `评论了你的帖子：${trimSnippet(post.title || post.content || '帖子')}`,
      page: `/pages/detail/detail?id=${data.postId}`
    })

    if (data.replyTo && data.replyTo.commentId) {
      const parentCommentRes = await db.collection('comments').doc(data.replyTo.commentId).get().catch(() => ({ data: null }))
      const parentComment = parentCommentRes.data || {}
      await addNotification({
        toOpenid: parentComment._openid,
        fromOpenid: openid,
        type: 'comment_reply',
        targetType: 'post',
        targetId: data.postId,
        postId: data.postId,
        commentId: addRes._id,
        content: trimSnippet(data.content),
        itemTitle: trimSnippet(post.title || post.content || '帖子')
      })
      await triggerSubscribeNotify({
        toOpenid: parentComment._openid,
        sceneType: 'comment',
        actorName: user.nickName || '有人',
        summary: `回复了你的评论：${trimSnippet(post.title || post.content || '帖子')}`,
        page: `/pages/detail/detail?id=${data.postId}`
      })
    }

    newComment._id = addRes._id
    return { code: 0, msg: '评论成功', data: newComment }
  }

  async function toggleLikePost(openid, postId) {
    const user = await getUserForAction(openid, { requireActive: true })
    if (user.isLikeBanned) return { code: -1, msg: '您已被限制点赞' }

    const postPeek = await db.collection('posts').doc(postId).get().catch(() => ({ data: null }))
    const peek = postPeek && postPeek.data
    if (!peek || !peek._openid || peek.status !== 'active') {
      return { code: -1, msg: '帖子不存在或已删除' }
    }
    if (await contentDetailBlocked(openid, peek._openid)) {
      return { code: -1, msg: '无法点赞该帖子' }
    }

    const likeId = makeDeterministicId('like', openid, 'post', postId)
    const existingDoc = await db.collection('likes').doc(likeId).get().catch(() => ({ data: null }))

    if (existingDoc && existingDoc.data) {
      const removed = await db.collection('likes').doc(likeId).remove().catch(() => ({ stats: { removed: 0 } }))
      if (removed && removed.stats && removed.stats.removed > 0) {
        await db.collection('posts').doc(postId).update({ data: { likes: _.inc(-1) } })
      }
      return { code: 0, data: { isLiked: false } }
    } else {
      let added = false
      try {
        await db.collection('likes').add({
          data: { _id: likeId, _openid: openid, targetId: postId, targetType: 'post', createTime: db.serverDate() }
        })
        added = true
      } catch (err) {
        const msg = (err && (err.errMsg || err.message)) || ''
        if (!/duplicate|already exist|exists/i.test(String(msg))) throw err
      }
      if (!added) return { code: 0, data: { isLiked: true } }

      await db.collection('posts').doc(postId).update({ data: { likes: _.inc(1) } })
      const postRes = await db.collection('posts').doc(postId).get().catch(() => ({ data: null }))
      const post = postRes.data || {}
      await addNotification({
        toOpenid: post._openid,
        fromOpenid: openid,
        type: 'post_like',
        targetType: 'post',
        targetId: postId,
        postId,
        itemTitle: trimSnippet(post.title || post.content || '帖子'),
        content: '赞了你的帖子'
      })
      await triggerSubscribeNotify({
        toOpenid: post._openid,
        sceneType: 'like',
        actorName: user.nickName || '有人',
        itemTitle: trimSnippet(post.title || post.content || '帖子'),
        summary: '点赞了你的帖子',
        page: `/pages/detail/detail?id=${postId}`
      })
      return { code: 0, data: { isLiked: true } }
    }
  }

  async function toggleLikeComment(openid, commentId) {
    const user = await getUserForAction(openid, { requireActive: true })
    if (user.isLikeBanned) return { code: -1, msg: '您已被限制点赞' }

    const commentPeek = await db.collection('comments').doc(commentId).get().catch(() => ({ data: null }))
    const peekComment = commentPeek && commentPeek.data
    if (!peekComment || peekComment.status === 'deleted' || peekComment.status === 'hidden') {
      return { code: -1, msg: '评论不存在或已删除' }
    }

    const likeId = makeDeterministicId('like', openid, 'comment', commentId)
    const existingDoc = await db.collection('likes').doc(likeId).get().catch(() => ({ data: null }))

    if (existingDoc && existingDoc.data) {
      const removed = await db.collection('likes').doc(likeId).remove().catch(() => ({ stats: { removed: 0 } }))
      if (removed && removed.stats && removed.stats.removed > 0) {
        await db.collection('comments').doc(commentId).update({ data: { likes: _.inc(-1) } })
      }
      return { code: 0, data: { isLiked: false } }
    } else {
      let added = false
      try {
        await db.collection('likes').add({
          data: { _id: likeId, _openid: openid, targetId: commentId, targetType: 'comment', createTime: db.serverDate() }
        })
        added = true
      } catch (err) {
        const msg = (err && (err.errMsg || err.message)) || ''
        if (!/duplicate|already exist|exists/i.test(String(msg))) throw err
      }
      if (!added) return { code: 0, data: { isLiked: true } }

      await db.collection('comments').doc(commentId).update({ data: { likes: _.inc(1) } })
      const commentRes = await db.collection('comments').doc(commentId).get().catch(() => ({ data: null }))
      const comment = commentRes.data || {}
      await addNotification({
        toOpenid: comment._openid,
        fromOpenid: openid,
        type: 'comment_like',
        targetType: 'comment',
        targetId: commentId,
        postId: comment.postId || '',
        commentId,
        itemTitle: trimSnippet(comment.content || '评论'),
        content: '赞了你的评论'
      })
      await triggerSubscribeNotify({
        toOpenid: comment._openid,
        sceneType: 'like',
        actorName: user.nickName || '有人',
        itemTitle: trimSnippet(comment.content || '评论'),
        summary: '点赞了你的评论',
        page: comment.postId ? `/pages/detail/detail?id=${comment.postId}` : '/pages/message/message'
      })
      return { code: 0, data: { isLiked: true } }
    }
  }

  async function toggleFavorPost(openid, postId) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const existing = await db.collection('favors').where({
      _openid: openid, postId
    }).get()

    if (existing.data.length > 0) {
      await db.collection('favors').doc(existing.data[0]._id).remove()
      return { code: 0, data: { isFavored: false } }
    } else {
      const postPre = await db.collection('posts').doc(postId).get().catch(() => ({ data: null }))
      const pre = postPre && postPre.data
      if (!pre || !pre._openid || pre.status !== 'active') {
        return { code: -1, msg: '帖子不存在或已删除' }
      }
      if (await contentDetailBlocked(openid, pre._openid)) {
        return { code: -1, msg: '无法收藏该帖子' }
      }
      await db.collection('favors').add({
        data: { _openid: openid, postId, createTime: db.serverDate() }
      })
      const postRes = await db.collection('posts').doc(postId).get().catch(() => ({ data: null }))
      const post = postRes.data || {}
      await addNotification({
        toOpenid: post._openid,
        fromOpenid: openid,
        type: 'post_favorite',
        targetType: 'post',
        targetId: postId,
        postId,
        itemTitle: trimSnippet(post.title || post.content || '帖子'),
        content: '收藏了你的帖子'
      })
      await triggerSubscribeNotify({
        toOpenid: post._openid,
        sceneType: 'favorite',
        actorName: actor.nickName || '有人',
        itemTitle: trimSnippet(post.title || post.content || '帖子'),
        summary: '收藏了你的帖子',
        page: `/pages/detail/detail?id=${postId}`
      })
      return { code: 0, data: { isFavored: true } }
    }
  }

  async function getFavoredPosts(openid, { page = 1, pageSize = 20 }) {
    const favors = await db.collection('favors').where({ _openid: openid })
      .orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()

    const postIds = favors.data.map((f) => f.postId)
    if (postIds.length === 0) return { code: 0, data: [] }

    const posts = await getPostsByIds(postIds, { status: 'active' })
    const data = await sanitizePostsForClient(posts, openid)
    return { code: 0, data }
  }

  async function getLikedPosts(openid, { page = 1, pageSize = 20 }) {
    const likes = await db.collection('likes').where({ _openid: openid, targetType: 'post' })
      .orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()

    const postIds = likes.data.map((item) => item.targetId)
    if (postIds.length === 0) return { code: 0, data: [] }

    const posts = await getPostsByIds(postIds, { status: 'active' })
    const data = await sanitizePostsForClient(posts, openid)
    return { code: 0, data }
  }

  async function getMyPosts(openid, { page = 1, pageSize = 20 }) {
    const res = await db.collection('posts').where({ _openid: openid, status: 'active' })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize).limit(pageSize).get()
    const rows = await sanitizePostsForClient(res.data || [], openid)
    return { code: 0, data: rows }
  }

  async function getUserPosts(viewerOpenid, targetOpenid, { page = 1, pageSize = 20 }) {
    if (!targetOpenid) return { code: -1, msg: '缺少用户标识' }
    if (
      viewerOpenid &&
      targetOpenid &&
      viewerOpenid !== targetOpenid &&
      await viewerBlockedByAuthor(viewerOpenid, targetOpenid)
    ) {
      return { code: 0, data: [] }
    }
    const viewingOther = !!(viewerOpenid && targetOpenid && viewerOpenid !== targetOpenid)
    const base = viewingOther
      ? _.and([
        { _openid: targetOpenid, status: 'active' },
        { isAnonymous: _.neq(true) }
      ])
      : { _openid: targetOpenid, status: 'active' }

    const res = await db.collection('posts').where(base)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize).limit(pageSize).get()

    const rows = await sanitizePostsForClient(res.data || [], viewerOpenid)
    return { code: 0, data: rows }
  }

  return {
    getPosts,
    getPostById,
    addPost,
    updatePost,
    deletePost,
    toggleTopPost,
    getComments,
    addComment,
    toggleLikePost,
    toggleLikeComment,
    toggleFavorPost,
    getFavoredPosts,
    getLikedPosts,
    getMyPosts,
    getUserPosts,
    sanitizePostsForClient,
    getPostsByIds,
    attachPostEngagement
  }
}

module.exports = createPostsModule
