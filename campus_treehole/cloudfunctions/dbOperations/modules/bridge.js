// modules/bridge.js - 友桥 UniBridge 跨文化与语伴交换业务模块
// 负责语伴发现、双语档案维护与互补语言匹配计算

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
   * 查询语伴列表
   */
  async function getLanguagePartners({ page = 1, pageSize = 20, studentType, nativeLang, learningLang, campusId, currentOpenid }) {
    try {
      let query = db.collection('users')
      const targetCampus = resolveCampusIdForRead(campusId)
      let condition = campusWhereClause(targetCampus)

      // 只展示正常状态且已填写或设置了语言档案的用户（或已发布过语言互助的用户）
      condition.status = 'active'
      if (studentType && ['chineseStudent', 'internationalStudent'].includes(studentType)) {
        condition['languageProfile.studentType'] = studentType
      }

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

      const partners = (res.data || []).map((u) => {
        const lp = u.languageProfile || {
          studentType: u.studentType || (u.gender === 1 ? 'chineseStudent' : 'internationalStudent'),
          country: u.country || (u.gender === 1 ? '中国' : '法国'),
          nativeLanguages: u.nativeLanguages || [u.gender === 1 ? 'zh' : 'en'],
          targetLanguages: u.targetLanguages || [u.gender === 1 ? 'en' : 'zh'],
          proficiencyLevels: u.proficiencyLevels || { zh: 'native', en: 'fluent' },
          exchangeMode: u.exchangeMode || 'offline',
          bio: u.bio || '期待在校园交流语言与文化，相互进步！'
        }

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

        return {
          id: u._id,
          openid: u._openid,
          nickName: u.nickName || '语伴同学',
          avatarUrl: u.avatarUrl || '/images/avatar_default.png',
          gender: u.gender || 0,
          campusId: u.campusId || DEFAULT_CAMPUS_ID,
          languageProfile: lp,
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

      const lp = u.languageProfile || {
        studentType: 'chineseStudent',
        country: '中国',
        nativeLanguages: ['zh'],
        targetLanguages: ['en'],
        proficiencyLevels: { zh: 'native', en: 'intermediate' },
        exchangeMode: 'hybrid',
        bio: u.bio || '热爱跨文化交流！'
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
          openid: u._openid,
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
   * 更新我自己的双语档案
   */
  async function updateLanguageProfile(openid, profileData = {}) {
    if (!openid) return { code: -1, msg: '未授权访问' }
    const user = await getUserForAction(openid)

    const languageProfile = {
      studentType: ['chineseStudent', 'internationalStudent', 'alumni'].includes(profileData.studentType)
        ? profileData.studentType
        : 'chineseStudent',
      country: String(profileData.country || '中国').trim(),
      nativeLanguages: Array.isArray(profileData.nativeLanguages) && profileData.nativeLanguages.length > 0
        ? profileData.nativeLanguages
        : ['zh'],
      targetLanguages: Array.isArray(profileData.targetLanguages) && profileData.targetLanguages.length > 0
        ? profileData.targetLanguages
        : ['en'],
      proficiencyLevels: profileData.proficiencyLevels || { zh: 'native', en: 'beginner' },
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

    return { code: 0, msg: '语言档案保存成功', data: languageProfile }
  }

  return {
    getLanguagePartners,
    getLanguagePartnerProfile,
    updateLanguageProfile
  }
}

module.exports = createBridgeModule
