// modules/campus-now.js - 校园此刻轻量聚合模块
function createCampusNowModule({ db, _, helpers }) {
  const {
    resolveCampusIdForRead,
    campusWhereClause,
    DEFAULT_CAMPUS_ID
  } = helpers

  async function getCampusNowSummary({ campusId, currentOpenid } = {}) {
    const targetCampus = resolveCampusIdForRead(campusId) || DEFAULT_CAMPUS_ID
    const cw = campusWhereClause(targetCampus)
    const now = Date.now()

    let buddyPreview = []
    try {
      const bCond = cw ? _.and([cw, { status: 'OPEN' }]) : { status: 'OPEN' }
      const bRes = await db.collection('buddy_posts')
        .where(bCond)
        .orderBy('startAt', 'asc')
        .limit(5)
        .get()

      buddyPreview = (bRes.data || [])
        .filter((p) => {
          const startMs = p.startAt ? new Date(p.startAt).getTime() : NaN
          if (!Number.isFinite(startMs)) return true
          const graceDeadline = startMs + 2 * 60 * 60 * 1000
          const endMs = p.endAt ? new Date(p.endAt).getTime() : NaN
          const deadline = Number.isFinite(endMs) ? Math.min(graceDeadline, endMs) : graceDeadline
          return now < deadline
        })
        .slice(0, 2)
        .map((p) => {
          const maxP = Number(p.maxPeople) || 2
          const accP = Number(p.acceptedCount) || 1
          const remain = Math.max(0, maxP - accP)
          return {
            id: p._id,
            type: 'buddy',
            badge: '同频',
            emoji: '🏸',
            title: p.title,
            sub: remain > 0 ? ('还差' + remain + '人') : '满员',
            location: p.location || '',
            url: '/packageBuddy/pages/buddy-detail/buddy-detail?id=' + p._id
          }
        })
    } catch (e) {}

    let bridgePreview = []
    try {
      const brCond = cw ? _.and([cw, { status: 'active' }]) : { status: 'active' }
      const brRes = await db.collection('users')
        .where(brCond)
        .orderBy('lastLoginTime', 'desc')
        .limit(6)
        .get()

      bridgePreview = (brRes.data || [])
        .filter((u) => {
          if (currentOpenid && u._openid === currentOpenid) return false
          const lp = u.languageProfile
          return (
            lp &&
            Array.isArray(lp.nativeLanguages) &&
            lp.nativeLanguages.length > 0 &&
            Array.isArray(lp.targetLanguages) &&
            lp.targetLanguages.length > 0
          )
        })
        .slice(0, 2)
        .map((u) => {
          const lp = u.languageProfile
          const nLangs = (lp.nativeLanguages || []).join('/')
          const tLangs = (lp.targetLanguages || []).join('/')
          return {
            id: u._id,
            type: 'bridge',
            badge: '友桥',
            emoji: '🌍',
            title: (u.nickName || '语伴') + ': ' + nLangs.toUpperCase() + ' ⇄ ' + tLangs.toUpperCase(),
            sub: '寻找语言互换伙伴',
            url: '/packageBridge/pages/partner-detail/partner-detail?id=' + u._id
          }
        })
    } catch (e) {}

    let marketPreview = []
    try {
      const mCond = cw ? _.and([cw, { status: 'active' }]) : { status: 'active' }
      const mRes = await db.collection('market_goods')
        .where(mCond)
        .orderBy('createTime', 'desc')
        .limit(2)
        .get()

      marketPreview = (mRes.data || []).map((g) => ({
        id: g._id,
        type: 'market',
        badge: '二手',
        emoji: '🛍️',
        title: g.title,
        sub: '¥' + g.price,
        image: (g.images && g.images[0]) || '',
        url: '/packageMarket/pages/market-detail/market-detail?id=' + g._id
      }))
    } catch (e) {}

    let mutualPreview = []
    try {
      const muCond = cw ? _.and([cw, { status: 'open' }]) : { status: 'open' }
      const muRes = await db.collection('mutual_posts')
        .where(muCond)
        .orderBy('createTime', 'desc')
        .limit(2)
        .get()

      mutualPreview = (muRes.data || []).map((m) => ({
        id: m._id,
        type: 'mutual',
        badge: '互助',
        emoji: '🙋',
        title: m.title,
        sub: m.reward ? ('悬赏 ¥' + m.reward) : (m.type === 'lost' ? '寻物' : (m.type === 'found' ? '招领' : '求助')),
        url: '/packageMutual/pages/mutual-detail/mutual-detail?id=' + m._id
      }))
    } catch (e) {}

    const items = [
      ...buddyPreview.slice(0, 2),
      ...bridgePreview.slice(0, 1),
      ...marketPreview.slice(0, 1),
      ...mutualPreview.slice(0, 1)
    ].slice(0, 5)

    return {
      code: 0,
      data: {
        items,
        buddyPreview,
        bridgePreview,
        marketPreview,
        mutualPreview
      }
    }
  }

  return {
    getCampusNowSummary
  }
}

module.exports = createCampusNowModule
