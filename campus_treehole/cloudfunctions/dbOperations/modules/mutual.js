const { createContentValidator } = require('../shared/content-safety')
// modules/mutual.js - 校园互助生活与失物招领业务模块
// 负责跑腿求助、课业答疑、借物寻物及失物归还全生命周期

function createMutualModule({ db, _, cloud, helpers }) {
  const validateUserContent = createContentValidator(helpers)
  const {
    getUserForAction,
    checkBannedWords,
    wxTextCheck,
    wxImageBatchCheck,
    isCollectionNotExistError,
    ensureCollection,
    campusWhereClause,
    resolveCampusIdForRead,
    DEFAULT_CAMPUS_ID,
    escapeRegExp,
    checkAdmin
  } = helpers

  /**
   * 获取互助/失物列表
   */
  async function getMutualPosts({ page = 1, pageSize = 20, type = 'help', category, status, keyword, campusId }) {
    try {
      let query = db.collection('mutual_posts')
      const parts = []
      const targetCampus = resolveCampusIdForRead(campusId)
      const cw = campusWhereClause(targetCampus)
      if (cw) parts.push(cw)

      if (type && ['help', 'lost', 'found'].includes(type)) {
        parts.push({ type })
      }

      if (category && category !== 'all') {
        parts.push({ category })
      }

      if (status && status !== 'all') {
        parts.push({ status })
      } else if (!status) {
        parts.push({ status: (_ && typeof _.neq === 'function') ? _.neq('closed') : 'open' })
      }

      if (keyword && String(keyword).trim()) {
        const kw = escapeRegExp(String(keyword).trim())
        parts.push({ title: db.RegExp({ regexp: kw, options: 'i' }) })
      }

      const condition = parts.length === 0 ? {} : (parts.length === 1 ? parts[0] : _.and(parts))

      const skip = (Math.max(1, page) - 1) * pageSize
      const res = await query
        .where(condition)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      return { code: 0, data: res.data || [] }
    } catch (err) {
      if (isCollectionNotExistError(err)) return { code: 0, data: [] }
      console.error('getMutualPosts error:', err)
      return { code: -1, msg: '获取互助列表失败: ' + err.message, data: [] }
    }
  }

  /**
   * 获取单条互助/失物详情
   */
  async function getMutualPostById({ id, openid }) {
    if (!id) return { code: -1, msg: '缺少条目 ID' }
    try {
      const res = await db.collection('mutual_posts').doc(id).get()
      const post = (res && res.data) || null
      if (!post) return { code: -1, msg: '互助信息不存在' }

      return {
        code: 0,
        data: {
          ...post,
          isAuthor: openid === post._openid
        }
      }
    } catch (err) {
      if (isCollectionNotExistError(err)) return { code: -1, msg: '暂无该互助记录' }
      return { code: -1, msg: '获取详情失败: ' + err.message }
    }
  }

  /**
   * 发布互助或寻物/失物
   */
  async function addMutualPost(openid, postData = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const title = String(postData.title || '').trim()
    const content = String(postData.content || '').trim()
    if (!title || title.length < 2) return { code: -1, msg: '标题不能少于 2 个字' }
    if (!content || content.length < 5) return { code: -1, msg: '详细说明不能少于 5 个字' }

    const safety = await validateUserContent({ openid, text: [title, content, postData.location, postData.reward].filter(Boolean).join(' '), images: postData.images || [] })
    if (!safety.pass) return { code: safety.code, msg: safety.reason }

    const user = await getUserForAction(openid)
    const campusId = resolveCampusIdForRead(postData.campusId || user.campusId || DEFAULT_CAMPUS_ID)

    const newPost = {
      _openid: openid,
      authorId: openid,
      author: {
        nickName: user.nickName || '同学',
        avatarUrl: user.avatarUrl || '/images/avatar_default.png',
        gender: user.gender || 0
      },
      type: ['help', 'lost', 'found'].includes(postData.type) ? postData.type : 'help',
      category: postData.category || 'other',
      title,
      content,
      images: Array.isArray(postData.images) ? postData.images.slice(0, 4) : [],
      location: String(postData.location || '').trim(),
      reward: String(postData.reward || '').trim(),
      contactPreference: postData.contactPreference || 'in_app',
      campusId,
      status: 'open',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    try {
      const addRes = await db.collection('mutual_posts').add({ data: newPost })
      return { code: 0, msg: '发布成功', data: { id: addRes._id } }
    } catch (err) {
      if (isCollectionNotExistError(err)) {
        await ensureCollection('mutual_posts')
        const addRes = await db.collection('mutual_posts').add({ data: newPost })
        return { code: 0, msg: '发布成功', data: { id: addRes._id } }
      }
      return { code: -1, msg: '发布失败: ' + err.message }
    }
  }

  /**
   * 变更状态 (标记解决 / 进行中 / 关闭)
   */
  async function updateMutualPostStatus(openid, { id, status }) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!id || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return { code: -1, msg: '参数不合法' }
    }

    const res = await db.collection('mutual_posts').doc(id).get()
    const post = (res && res.data) || null
    if (!post) return { code: -1, msg: '条目不存在' }
    if (post._openid !== openid) {
      const isAdmin = await checkAdmin(openid)
      if (!isAdmin) return { code: -1, msg: '无权变更状态' }
    }

    await db.collection('mutual_posts').doc(id).update({
      data: { status, updateTime: db.serverDate() }
    })
    return { code: 0, msg: '状态已更新' }
  }

  /**
   * 删除互助/失物条目
   */
  async function deleteMutualPost(openid, { id }) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    if (!id) return { code: -1, msg: '缺少条目 ID' }

    const res = await db.collection('mutual_posts').doc(id).get()
    const post = (res && res.data) || null
    if (!post) return { code: -1, msg: '条目不存在' }
    if (post._openid !== openid) {
      const isAdmin = await checkAdmin(openid)
      if (!isAdmin) return { code: -1, msg: '无权删除' }
    }

    await db.collection('mutual_posts').doc(id).remove()
    return { code: 0, msg: '已删除' }
  }

  return {
    getMutualPosts,
    getMutualPostById,
    addMutualPost,
    updateMutualPostStatus,
    deleteMutualPost
  }
}

module.exports = createMutualModule
