// packageBridge/pages/bridge-home/bridge-home.js - 友桥 UniBridge 语伴广场
const app = getApp()
const i18n = require('../../../utils/i18n')

Page({
  data: {
    currentLang: 'zh-CN',
    studentTypes: [
      { id: 'all', nameZh: '全部伙伴', nameEn: 'All Partners' },
      { id: 'chineseStudent', nameZh: '中国同学', nameEn: 'Chinese Students' },
      { id: 'internationalStudent', nameZh: '国际留学生', nameEn: 'International Students' }
    ],
    selectedType: 'all',
    partners: [],
    loading: false,
    page: 1,
    pageSize: 15,
    hasMore: true
  },

  onLoad() {
    this.setData({ currentLang: i18n.getLocale() })
    this.loadPartners(true)
  },

  onShow() {
    this.setData({ currentLang: i18n.getLocale() })
  },

  onPullDownRefresh() {
    this.loadPartners(true, () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPartners(false)
    }
  },

  toggleLocale() {
    const next = this.data.currentLang === 'zh-CN' ? 'en-US' : 'zh-CN'
    i18n.setLocale(next)
    this.setData({ currentLang: next })
    wx.setNavigationBarTitle({
      title: next === 'zh-CN' ? '友桥 UniBridge 语伴广场' : 'UniBridge Language Exchange'
    })
  },

  onSelectType(e) {
    const type = e.currentTarget.dataset.id
    if (type === this.data.selectedType) return
    this.setData({ selectedType: type })
    this.loadPartners(true)
  },

  async loadPartners(reset = false, callback) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    try {
      const res = await app.callDB('getLanguagePartners', {
        page,
        pageSize: this.data.pageSize,
        studentType: this.data.selectedType === 'all' ? null : this.data.selectedType
      })

      const list = (res && res.data) || []
      this.setData({
        partners: reset ? list : [...this.data.partners, ...list],
        page,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('加载语伴失败:', err)
      this.setData({ loading: false })
    } finally {
      if (typeof callback === 'function') callback()
    }
  },

  goToPartnerDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageBridge/pages/partner-detail/partner-detail?id=${id}`
    })
  },

  goToSetupProfile() {
    wx.navigateTo({
      url: '/packageBridge/pages/language-setup/language-setup'
    })
  }
})
