// packageBridge/pages/language-setup/language-setup.js - 友桥极简双语档案配置
const app = getApp()
const { SUPPORTED_LANGUAGES } = require('../../../utils/domain/language')

Page({
  data: {
    languages: SUPPORTED_LANGUAGES,
    // 2 个核心必填项
    nativeLanguages: ['zh'],
    targetLanguages: ['en'],

    // 选填项
    showMoreOptions: false,
    studentType: 'chineseStudent',
    country: '',
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
        nativeLanguages: (Array.isArray(lp.nativeLanguages) && lp.nativeLanguages.length > 0) ? lp.nativeLanguages : ['zh'],
        targetLanguages: (Array.isArray(lp.targetLanguages) && lp.targetLanguages.length > 0) ? lp.targetLanguages : ['en'],
        studentType: lp.studentType || 'chineseStudent',
        country: lp.country || '',
        exchangeMode: lp.exchangeMode || 'offline',
        bio: lp.bio || '',
        showMoreOptions: !!(lp.country || lp.bio || (lp.studentType && lp.studentType !== 'chineseStudent'))
      })
    }
  },

  onToggleMoreOptions() {
    this.setData({ showMoreOptions: !this.data.showMoreOptions })
  },

  onToggleNativeLang(e) {
    const code = e.currentTarget.dataset.code
    let list = [...this.data.nativeLanguages]
    if (list.includes(code)) {
      if (list.length > 1) list = list.filter((c) => c !== code)
      else wx.showToast({ title: '至少保留一种母语/精通语言', icon: 'none' })
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
      else wx.showToast({ title: '至少保留一种想学习的语言', icon: 'none' })
    } else {
      list.push(code)
    }
    this.setData({ targetLanguages: list })
  },

  onStudentTypeChange(e) {
    this.setData({ studentType: e.detail.value })
  },

  onCountryInput(e) {
    this.setData({ country: e.detail.value })
  },

  onModeChange(e) {
    this.setData({ exchangeMode: e.detail.value })
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value })
  },

  async onSave() {
    if (this.data.submitting) return
    if (!this.data.nativeLanguages || this.data.nativeLanguages.length === 0) {
      wx.showToast({ title: '请选择您的母语', icon: 'none' })
      return
    }
    if (!this.data.targetLanguages || this.data.targetLanguages.length === 0) {
      wx.showToast({ title: '请选择想学的语言', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...' })

    const payload = {
      nativeLanguages: this.data.nativeLanguages,
      targetLanguages: this.data.targetLanguages,
      studentType: this.data.studentType,
      country: this.data.country.trim(),
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
        wx.showToast({ title: '语言档案已开启！', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
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
