// modules/market.js - 校园集市业务模块
// 拆分自 dbOperations/index.js，保持 100% 协议与行为兼容

function createMarketModule({ db, _, cloud, helpers }) {
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
    buildMarketCategoryWhere,
    normalizePublishCategory
  } = helpers

  // 1. 获取集市商品列表
  async function getMarketGoods({ category, keyword, page = 1, pageSize = 20, campusId: campusIdRaw }) {
    const campusIdRead = resolveCampusIdForRead({ campusId: campusIdRaw })
    if (campusIdRead === null) {
      return { code: 0, data: [] }
    }
    const parts = [{ status: 'active' }]
    const cw = campusWhereClause(campusIdRead)
    if (cw) parts.push(cw)
    if (category) {
      const catWhere = buildMarketCategoryWhere(_, category)
      if (catWhere) parts.push(catWhere)
    }

    if (keyword && keyword.trim()) {
      const regex = db.RegExp({
        regexp: escapeRegExp(keyword.trim()),
        options: 'i'
      })
      parts.push(_.or([
        { title: regex },
        { description: regex }
      ]))
    }

    const cond = parts.length === 1 ? parts[0] : _.and(parts)

    const res = await db.collection('market_goods').where(cond)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    let rows = res.data || []
    const { OPENID } = cloud.getWXContext()
    if (OPENID && rows.length > 0) {
      const hide = await findAuthorsHiddenByBlockRelation(OPENID, rows.map((r) => r._openid))
      rows = rows.filter((r) => !hide.has(r._openid))
    }

    return { code: 0, data: rows }
  }

  // 2. 获取单件商品详情
  async function getMarketGoodsById(goodsId, openid) {
    const res = await db.collection('market_goods').doc(goodsId).get()
    let goods = res.data
    if (!goods || !goods._id || goods.status !== 'active') {
      return { code: -1, msg: '商品不存在或已下架' }
    }

    const sellerOpenid = goods._openid
    if (sellerOpenid && openid && sellerOpenid !== openid) {
      if (await contentDetailBlocked(openid, sellerOpenid)) {
        return { code: -1, msg: '无法查看该商品' }
      }
    }

    const userRes = await db.collection('users').where({ _openid: goods._openid }).limit(1).get()
    const seller = userRes.data[0] || {}
    goods = {
      ...goods,
      numericId: goods.numericId || seller.numericId || ''
    }

    let isFavored = false
    if (openid) {
      try {
        const favorRes = await db.collection('market_favors').where({
          _openid: openid, goodsId
        }).count()
        isFavored = favorRes.total > 0
      } catch (e) {
        // 集合未建立时忽略
      }
    }

    return { code: 0, data: goods, isFavored }
  }

  // 3. 获取商品留言评论
  async function getMarketComments(goodsId) {
    try {
      const res = await db.collection('market_comments').where({
        goodsId,
        status: 'active'
      }).orderBy('createTime', 'desc').limit(100).get()

      return { code: 0, data: res.data }
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        return { code: 0, data: [] }
      }
      throw err
    }
  }

  // 4. 管理员获取商品列表
  async function getAdminMarketGoods(data) {
    const parts = []
    if (data.status) parts.push({ status: data.status })
    else parts.push({ status: _.neq('deleted') })
    if (data.category) {
      const catWhere = buildMarketCategoryWhere(_, data.category)
      if (catWhere) parts.push(catWhere)
    }
    const cond = parts.length === 1 ? parts[0] : _.and(parts)

    try {
      const res = await db.collection('market_goods').where(cond).orderBy('createTime', 'desc').limit(50).get()
      return { code: 0, data: res.data }
    } catch (e) {
      if (e.message && e.message.includes('not exist')) {
        return { code: 0, data: [] }
      }
      return { code: -1, msg: e.message }
    }
  }

  // 5. 发布闲置商品
  async function addMarketGoods(openid, data) {
    const user = await getUserForAction(openid, { requireActive: true })
    const canPost = await checkRateLimit(openid, 'market_goods', 5, 3)
    if (!canPost) return { code: -1, msg: '发布太频繁，请稍后再试' }

    const price = Number(data.price)
    const originalPrice =
      data.originalPrice === null ||
      data.originalPrice === undefined ||
      data.originalPrice === ''
        ? null
        : Number(data.originalPrice)

    if (!data.title || !String(data.title).trim()) {
      return { code: -1, msg: '标题不能为空' }
    }
    if (!Number.isFinite(price) || price <= 0) {
      return { code: -1, msg: '价格必须大于 0' }
    }
    if (originalPrice !== null) {
      if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
        return { code: -1, msg: '原价必须大于 0' }
      }
      if (originalPrice < price) {
        return { code: -1, msg: '原价不能低于现价' }
      }
    }
    if (!Array.isArray(data.images) || data.images.length === 0) {
      return { code: -1, msg: '请至少上传一张图片' }
    }

    // 内容审核
    const textToCheck = (data.title || '') + ' ' + (data.description || '')
    const localCheck = checkBannedWords(textToCheck)
    if (!localCheck.pass) return { code: -2, msg: `内容包含违规词"${localCheck.word}"` }

    const imagePromise = wxImageBatchCheck(openid, data.images || [])
    const wxCheck = await wxTextCheck(openid, textToCheck)
    if (!wxCheck.pass) {
      imagePromise.catch((e) => console.warn('addMarketGoods: image check after text fail', e))
      return { code: -2, msg: '内容未通过安全审核' }
    }
    const wxImageRes = await imagePromise
    if (!wxImageRes.pass) return { code: -2, msg: '商品图片未通过安全审核' }

    const campusIdGoods =
      typeof data.campusId === 'string' && data.campusId.trim()
        ? data.campusId.trim()
        : (user.campusId || DEFAULT_CAMPUS_ID)

    const newGoods = {
      _openid: openid,
      numericId: user.numericId || '',
      campusId: campusIdGoods,
      nickname: user.nickName || '未知卖家',
      avatar: user.avatarUrl || '/images/avatar_default.png',
      title: data.title,
      description: data.description || '',
      price,
      originalPrice,
      images: data.images || [],
      category: normalizePublishCategory(data.category),
      condition: data.condition || '未说明',
      tradeMethod: data.tradeMethod || '均可',
      bargain: data.bargain !== undefined ? data.bargain : true,
      wantCount: 0,
      commentCount: 0,
      status: 'active',
      createTime: db.serverDate()
    }

    let addRes
    try {
      addRes = await db.collection('market_goods').add({ data: newGoods })
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        await db.createCollection('market_goods').catch(e => console.error('建集市表失败', e))
        addRes = await db.collection('market_goods').add({ data: newGoods })
      } else {
        throw err
      }
    }
    return { code: 0, msg: '发布成功', data: { _id: addRes._id } }
  }

  // 6. 收藏/取消收藏商品
  async function toggleFavorGoods(openid, goodsId) {
    const actor = await getUserForAction(openid, { requireActive: true })
    const existing = await db.collection('market_favors').where({
      _openid: openid, goodsId
    }).get()

    if (existing.data.length > 0) {
      await db.collection('market_favors').doc(existing.data[0]._id).remove()
      return { code: 0, data: { isFavored: false } }
    } else {
      await db.collection('market_favors').add({
        data: { _openid: openid, goodsId, createTime: db.serverDate() }
      })
      const goodsRes = await db.collection('market_goods').doc(goodsId).get().catch(() => ({ data: null }))
      const goods = goodsRes.data || {}
      await addNotification({
        toOpenid: goods._openid,
        fromOpenid: openid,
        type: 'goods_favorite',
        targetType: 'goods',
        targetId: goodsId,
        goodsId,
        itemTitle: trimSnippet(goods.title || '商品'),
        itemImage: Array.isArray(goods.images) && goods.images.length ? goods.images[0] : '',
        itemPrice: goods.price,
        content: '收藏了你的商品'
      })
      await triggerSubscribeNotify({
        toOpenid: goods._openid,
        sceneType: 'favorite',
        actorName: actor.nickName || '有人',
        itemTitle: trimSnippet(goods.title || '商品'),
        summary: '收藏了你的商品',
        page: `/packageMarket/pages/market-detail/market-detail?id=${goodsId}`
      })
      return { code: 0, data: { isFavored: true } }
    }
  }

  // 7. 我想要该商品
  async function wantMarketGoods(openid, goodsId) {
    await getUserForAction(openid, { requireActive: true })
    const wantId = makeDeterministicId('want', openid, goodsId)
    const existingDoc = await db.collection('market_wants').doc(wantId).get().catch(() => ({ data: null }))
    if (existingDoc && existingDoc.data) return { code: 0, msg: '已标记' }

    let added = false
    try {
      await db.collection('market_wants').add({
        data: { _id: wantId, _openid: openid, goodsId, createTime: db.serverDate() }
      })
      added = true
    } catch (err) {
      const msg = (err && (err.errMsg || err.message)) || ''
      if (!/duplicate|already exist|exists/i.test(String(msg))) throw err
    }
    if (!added) {
      return { code: 0, msg: '已标记' }
    }

    await db.collection('market_goods').doc(goodsId).update({
      data: { wantCount: _.inc(1) }
    })
    const goodsRes = await db.collection('market_goods').doc(goodsId).get().catch(() => ({ data: null }))
    const goods = goodsRes.data || {}
    if (goods._openid && goods._openid !== openid) {
      await addNotification({
        toOpenid: goods._openid,
        fromOpenid: openid,
        type: 'goods_want',
        targetType: 'goods',
        targetId: goodsId,
        goodsId,
        itemTitle: trimSnippet(goods.title || '商品'),
        itemImage: Array.isArray(goods.images) && goods.images.length ? goods.images[0] : '',
        itemPrice: goods.price,
        content: '对你的商品标记了想要'
      })
    }
    return { code: 0, msg: '标记成功' }
  }

  // 8. 下架/删除商品
  async function deleteMarketGoods(openid, goodsId) {
    await getUserForAction(openid, { requireActive: true })
    const goodsRes = await db.collection('market_goods').doc(goodsId).get()
    const goods = goodsRes.data

    if (!goods || !goods._id || goods.status !== 'active') {
      return { code: -1, msg: '商品不存在或已下架' }
    }

    const isAdmin = await checkAdmin(openid)
    if (!isAdmin && goods._openid !== openid) {
      return { code: -1, msg: '无权下架该商品' }
    }

    await db.collection('market_goods').doc(goodsId).update({
      data: {
        status: 'deleted',
        deleteTime: db.serverDate()
      }
    })

    const favorRes = await db.collection('market_favors').where({ goodsId }).get().catch(() => ({ data: [] }))
    const wantRes = await db.collection('market_wants').where({ goodsId }).get().catch(() => ({ data: [] }))
    const receiverSet = new Set()
    ;(favorRes.data || []).forEach((item) => {
      if (item && item._openid && item._openid !== openid) receiverSet.add(item._openid)
    })
    ;(wantRes.data || []).forEach((item) => {
      if (item && item._openid && item._openid !== openid) receiverSet.add(item._openid)
    })
    const receivers = Array.from(receiverSet)
    for (const toOpenid of receivers) {
      await triggerSubscribeNotify({
        toOpenid,
        sceneType: 'offshelf',
        itemTitle: trimSnippet(goods.title || '商品'),
        reason: '商品已下架',
        summary: '你关注的内容已下架，可查看其他在售内容',
        page: '/pages/market/market'
      })
    }

    return { code: 0, msg: '商品已下架' }
  }

  // 9. 添加商品留言
  async function addMarketComment(openid, data) {
    const user = await getUserForAction(openid, { requireActive: true })
    if (user.isMuted) return { code: -1, msg: '您已被禁言，无法评论' }

    const goodsId = data.goodsId
    const content = String(data.content || '').trim()

    if (!goodsId) return { code: -1, msg: '商品参数缺失' }
    if (!content) return { code: -1, msg: '评论内容不能为空' }

    // 检查是否被商品发布者拉黑
    const goodsRes = await db.collection('market_goods').doc(goodsId).get()
    const goods = goodsRes.data
    if (!goods || goods.status !== 'active') return { code: -1, msg: '商品不存在或已下架' }

    if (goods._openid !== openid) {
      if (await viewerBlockedByAuthor(openid, goods._openid)) {
        return { code: -1, msg: '对方设置了权限，无法发表评论' }
      }
    }

    const localCheck = checkBannedWords(content)
    if (!localCheck.pass) return { code: -2, msg: `内容包含违规词"${localCheck.word}"` }

    const wxCheck = await wxTextCheck(openid, content)
    if (!wxCheck.pass) return { code: -2, msg: '内容未通过安全审核' }

    const replyTo = data.replyTo || null
    const newComment = {
      _openid: openid,
      goodsId,
      content,
      nickname: user.nickName || '同学',
      avatar: user.avatarUrl || '/images/avatar_default.png',
      numericId: user.numericId || '',
      replyTo: replyTo ? {
        commentId: replyTo.commentId,
        openid: replyTo.openid,
        nickname: replyTo.nickname || '同学'
      } : null,
      status: 'active',
      createTime: db.serverDate()
    }

    let addRes
    try {
      addRes = await db.collection('market_comments').add({ data: newComment })
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        await db.createCollection('market_comments').catch(e => console.error('建评论表失败', e))
        addRes = await db.collection('market_comments').add({ data: newComment })
      } else {
        throw err
      }
    }

    await db.collection('market_goods').doc(goodsId).update({
      data: { commentCount: _.inc(1) }
    })

    const targetOpenid = replyTo ? replyTo.openid : goods._openid
    if (targetOpenid && targetOpenid !== openid) {
      await addNotification({
        toOpenid: targetOpenid,
        fromOpenid: openid,
        type: replyTo ? 'goods_comment_reply' : 'goods_comment',
        targetType: 'goods',
        targetId: goodsId,
        goodsId,
        itemTitle: trimSnippet(goods.title || '商品'),
        itemImage: Array.isArray(goods.images) && goods.images.length ? goods.images[0] : '',
        itemPrice: goods.price,
        content: content
      })

      await triggerSubscribeNotify({
        toOpenid: targetOpenid,
        sceneType: 'comment',
        actorName: user.nickName || '有人',
        itemTitle: trimSnippet(goods.title || '商品'),
        summary: trimSnippet(content, 20),
        page: `/packageMarket/pages/market-detail/market-detail?id=${goodsId}`
      })
    }

    return { code: 0, msg: '评论成功', data: { _id: addRes._id, ...newComment } }
  }

  // 10. 用户个人中心：TA 的闲置商品
  async function getUserMarketGoods(viewerOpenid, targetOpenid, { page = 1, pageSize = 15 }) {
    if (!targetOpenid) {
      return { code: -1, msg: '缺少用户标识' }
    }
    if (
      viewerOpenid &&
      targetOpenid &&
      viewerOpenid !== targetOpenid &&
      await viewerBlockedByAuthor(viewerOpenid, targetOpenid)
    ) {
      return { code: 0, data: [], total: 0 }
    }
    const where = { _openid: targetOpenid, status: 'active' }
    let total = 0
    try {
      const c = await db.collection('market_goods').where(where).count()
      total = c.total
    } catch (e) {
      console.warn('getUserMarketGoods count:', e)
    }
    const res = await db.collection('market_goods').where(where)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    return { code: 0, data: res.data, total }
  }

  return {
    getMarketGoods,
    getMarketGoodsById,
    getMarketComments,
    getAdminMarketGoods,
    addMarketGoods,
    toggleFavorGoods,
    wantMarketGoods,
    deleteMarketGoods,
    addMarketComment,
    getUserMarketGoods
  }
}

module.exports = createMarketModule
