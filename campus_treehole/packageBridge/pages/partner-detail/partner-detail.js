// packageBridge/pages/partner-detail/partner-detail.js - 语伴详细资料与互补匹配分析
const app = getApp()
const i18n = require('../../../utils/i18n')

Page({
  data: {
    id: '',
    partner: null,
    loading: true,
    currentLang: 'zh-CN'
  },

  onLoad(options) {
    this.setData({ currentLang: i18n.getLocale() })
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadDetail()
    } else {
      wx.showToast({ title: '缺少语伴 ID', icon: 'none' })
    }
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await app.callDB('getLanguagePartnerProfile', {
        partnerId: this.data.id
      })
      if (res && res.code === 0 && res.data) {
        this.setData({ partner: res.data, loading: false })
      } else {
        wx.showToast({ title: (res && res.msg) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载语伴详情失败:', err)
      this.setData({ loading: false })
    }
  },

  contactPartner() {
    if (!this.data.partner || !this.data.partner.openid) return
    wx.navigateTo({
      url: `/pages/chat/chat?targetOpenid=${this.data.partner.openid}&title=${encodeURIComponent(this.data.partner.nickName || '语伴')}`
    })
  }
})
