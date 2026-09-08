// modules/bridge.js - 友桥 UniBridge 跨文化与语伴交换业务模块
// 负责语伴发现、双语档案维护与互补语言匹配计算
// 严格杜绝基于 gender 推测国籍/语言假数据

const { evaluateLanguageExchangeMatch } = require('../../../../shared/domain/language')

function createBridgeModule({ db, _, cloud, helpers }) {
  const {
    getUserForAction,
    isCollectionNotExistError,
    campusWhereClause,
    resolveCampusIdForRead,
    DEFAULT_CAMPUS_ID
  } = helpers

  /**
   * 查询语伴列表（仅展示已真实完善语言资料的用户，按互补匹配优先排序）
   */
  async function getLanguagePartners({ page = 1, pageSize = 20, studentType, nativeLang, learningLang, campusId, currentOpenid }) {
    try {
      let query = db.collection('users')
      const parts = [{ status: 'active' }]
      const targetCampus = resolveCampusIdForRead(campusId)
      const cw = campusWhereClause(targetCampus)
      if (cw) parts.push(cw)

      if (studentType && ['chineseStudent', 'internationalStudent'].includes(studentType)) {
        parts.push({ 'languageProfile.studentType': studentType })
      }

      // 仅查询设置了有效语言档案的用户
      if (_ && typeof _.exists === 'function') {
        parts.push({ 'languageProfile.nativeLanguages': _.exists(true) })
      }

      const condition = parts.length === 1 ? parts[0] : _.and(parts)

      const skip = (Math.max(1, page) - 1) * pageSize
      const res = await query
        .where(condition)
        .orderBy('lastLoginTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      let currentUserProfile = null
      if (currentOpenid) {
        try {
          const meRes = await db.collection('users').where({ _openid: currentOpenid }).limit(1).get()
          if (meRes.data && meRes.data.length > 0) {
            currentUserProfile = meRes.data[0].languageProfile || null
          }
        } catch (e) {}
      }

      // 真实过滤：剔除自己与无真实语言资料的用户，杜绝任何假数据推断
      const realPartners = (res.data || []).filter((u) => {
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

      const partners = realPartners.map((u) => {
        const lp = u.languageProfile

        let matchResult = { isMatch: false, score: 0 }
        if (currentUserProfile && currentUserProfile.nativeLanguages && currentUserProfile.targetLanguages) {
          const myLangs = [
            ...(currentUserProfile.nativeLanguages || []).map((code) => ({ languageCode: code, proficiency: 'native', isLearning: false })),
            ...(currentUserProfile.targetLanguages || []).map((code) => ({ languageCode: code, proficiency: 'beginner', isLearning: true }))
          ]
          const partnerLangs = [
            ...(lp.nativeLanguages || []).map((code) => ({ languageCode: code, proficiency: 'native', isLearning: false })),
            ...(lp.targetLanguages || []).map((code) => ({ languageCode: code, proficiency: 'beginner', isLearning: true }))
          ]
          matchResult = evaluateLanguageExchangeMatch(myLangs, partnerLangs)
        }

        // 对外屏蔽内部 openid，输出安全 userId 与公开资料
        return {
          id: u._id,
          userId: u._id,
          nickName: u.nickName || '语伴同学',
          avatarUrl: u.avatarUrl || '/images/avatar_default.png',
          gender: u.gender || 0,
          campusId: u.campusId || DEFAULT_CAMPUS_ID,
          languageProfile: {
            studentType: lp.studentType || 'chineseStudent',
            country: lp.country || '',
            nativeLanguages: lp.nativeLanguages || [],
            targetLanguages: lp.targetLanguages || [],
            proficiencyLevels: lp.proficiencyLevels || {},
            exchangeMode: lp.exchangeMode || 'offline',
            bio: lp.bio || ''
          },
          isMatch: matchResult.isMatch,
          matchScore: matchResult.score
        }
      })

      // 互补匹配优先排序
      partners.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

      return { code: 0, data: partners }
    } catch (err) {
      if (isCollectionNotExistError(err)) return { code: 0, data: [] }
      console.error('getLanguagePartners error:', err)
      return { code: -1, msg: '获取语伴列表失败: ' + err.message, data: [] }
    }
  }

  /**
   * 查询指定语伴详情与匹配分析
   */
  async function getLanguagePartnerProfile({ partnerId, currentOpenid }) {
    if (!partnerId) return { code: -1, msg: '缺少语伴 ID' }
    try {
      const res = await db.collection('users').doc(partnerId).get()
      const u = (res && res.data) || null
      if (!u) return { code: -1, msg: '用户不存在' }

      const lp = u.languageProfile
      if (!lp || !Array.isArray(lp.nativeLanguages) || lp.nativeLanguages.length === 0) {
        return { code: -1, msg: '该同学尚未完善语言资料' }
      }

      let matchAnalysis = { isMatch: false, score: 0, reason: '完善双语档案后即可生成专属互补分析' }
      if (currentOpenid) {
        const meRes = await db.collection('users').where({ _openid: currentOpenid }).limit(1).get()
        if (meRes.data && meRes.data.length > 0 && meRes.data[0].languageProfile) {
          const myLp = meRes.data[0].languageProfile
          const myLangs = [
            ...(myLp.nativeLanguages || []).map((code) => ({ languageCode: code, proficiency: 'native', isLearning: false })),
            ...(myLp.targetLanguages || []).map((code) => ({ languageCode: code, proficiency: 'beginner', isLearning: true }))
          ]
          const partnerLangs = [
            ...(lp.nativeLanguages || []).map((code) => ({ languageCode: code, proficiency: 'native', isLearning: false })),
            ...(lp.targetLanguages || []).map((code) => ({ languageCode: code, proficiency: 'beginner', isLearning: true }))
          ]
          const m = evaluateLanguageExchangeMatch(myLangs, partnerLangs)
          matchAnalysis = {
            isMatch: m.isMatch,
            score: m.score,
            aTeachesB: m.aTeachesB,
            bTeachesA: m.bTeachesA,
            reason: m.isMatch
              ? '你们的母语与学习目标完美互补，是最佳搭档！'
              : '可互相了解对方的校园日常与学习心得'
          }
        }
      }

      return {
        code: 0,
        data: {
          id: u._id,
          userId: u._id,
          nickName: u.nickName,
          avatarUrl: u.avatarUrl,
          gender: u.gender,
          campusId: u.campusId,
          languageProfile: lp,
          matchAnalysis
        }
      }
    } catch (err) {
      return { code: -1, msg: '查询语伴失败: ' + err.message }
    }
  }

  /**
   * 极简更新双语档案 (只需选择母语与想学语言 2 个核心字段即可完成冷启动)
   */
  async function updateLanguageProfile(openid, profileData = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const user = await getUserForAction(openid)

    const nativeLanguages = Array.isArray(profileData.nativeLanguages) && profileData.nativeLanguages.length > 0
      ? profileData.nativeLanguages
      : []
    const targetLanguages = Array.isArray(profileData.targetLanguages) && profileData.targetLanguages.length > 0
      ? profileData.targetLanguages
      : []

    if (nativeLanguages.length === 0) {
      return { code: -1, msg: '请选择您的母语或精通语言' }
    }
    if (targetLanguages.length === 0) {
      return { code: -1, msg: '请选择您想学习交流的目标语言' }
    }

    const languageProfile = {
      nativeLanguages,
      targetLanguages,
      studentType: ['chineseStudent', 'internationalStudent', 'alumni'].includes(profileData.studentType)
        ? profileData.studentType
        : 'chineseStudent',
      country: String(profileData.country || '').trim(),
      proficiencyLevels: profileData.proficiencyLevels || {},
      exchangeMode: ['offline', 'online', 'hybrid'].includes(profileData.exchangeMode) ? profileData.exchangeMode : 'offline',
      bio: String(profileData.bio || '').trim(),
      updatedAt: db.serverDate()
    }

    await db.collection('users').doc(user._id).update({
      data: {
        languageProfile,
        profileCompleted: true
      }
    })

    return { code: 0, msg: '双语档案保存成功', data: languageProfile }
  }

  return {
    getLanguagePartners,
    getLanguagePartnerProfile,
    updateLanguageProfile
  }
}

module.exports = createBridgeModule
