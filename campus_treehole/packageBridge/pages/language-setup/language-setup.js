// packageBridge/pages/language-setup/language-setup.js - 双语档案配置
const app = getApp()
const { SUPPORTED_LANGUAGES, PROFICIENCY_LEVELS } = require('../../../utils/domain/language')

Page({
  data: {
    studentType: 'chineseStudent',
    country: '中国',
    languages: SUPPORTED_LANGUAGES,
    nativeLanguages: ['zh'],
    targetLanguages: ['en'],
    proficiencyLevels: { zh: 'native', en: 'beginner' },
    exchangeMode: 'offline',
    bio: '',
    submitting: false
  },

  onLoad() {
    this.initProfile()
  },

  initProfile() {
    const userInfo = (app.globalData && app.globalData.userInfo) || {}
    const lp = userInfo.languageProfile
    if (lp) {
      this.setData({
        studentType: lp.studentType || 'chineseStudent',
        country: lp.country || '中国',
        nativeLanguages: lp.nativeLanguages || ['zh'],
        targetLanguages: lp.targetLanguages || ['en'],
        proficiencyLevels: lp.proficiencyLevels || { zh: 'native', en: 'beginner' },
        exchangeMode: lp.exchangeMode || 'offline',
        bio: lp.bio || ''
      })
    }
  },

  onStudentTypeChange(e) {
    this.setData({ studentType: e.detail.value })
  },

  onCountryInput(e) {
    this.setData({ country: e.detail.value })
  },

  onToggleNativeLang(e) {
    const code = e.currentTarget.dataset.code
    let list = [...this.data.nativeLanguages]
    if (list.includes(code)) {
      if (list.length > 1) list = list.filter((c) => c !== code)
      else wx.showToast({ title: '至少保留一种熟练语言', icon: 'none' })
    } else {
      list.push(code)
    }
    this.setData({ nativeLanguages: list })
  },

  onToggleTargetLang(e) {
    const code = e.currentTarget.dataset.code
    let list = [...this.data.targetLanguages]
    if (list.includes(code)) {
      if (list.length > 1) list = list.filter((c) => c !== code)
      else wx.showToast({ title: '至少保留一种想学语言', icon: 'none' })
    } else {
      list.push(code)
    }
    this.setData({ targetLanguages: list })
  },

  onModeChange(e) {
    this.setData({ exchangeMode: e.detail.value })
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value })
  },

  async onSave() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...' })

    const payload = {
      studentType: this.data.studentType,
      country: this.data.country.trim() || '中国',
      nativeLanguages: this.data.nativeLanguages,
      targetLanguages: this.data.targetLanguages,
      proficiencyLevels: this.data.proficiencyLevels,
      exchangeMode: this.data.exchangeMode,
      bio: this.data.bio.trim()
    }

    try {
      const res = await app.callDB('updateLanguageProfile', payload)
      wx.hideLoading()
      this.setData({ submitting: false })

      if (res && res.code === 0) {
        if (app.globalData && app.globalData.userInfo) {
          app.globalData.userInfo.languageProfile = payload
        }
        wx.showToast({ title: '档案已更新', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } else {
        wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  }
})
