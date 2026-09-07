// packageMutual/pages/mutual-list/mutual-list.js - 校园互助与失物招领列表
const app = getApp()
const { HELP_CATEGORIES, LOST_CATEGORIES } = require('../../../utils/domain/mutual')

Page({
  data: {
    activeTab: 'help', // 'help' or 'lost'
    lostSubTab: 'all', // 'all', 'lost', 'found'
    helpCategories: [{ id: 'all', name: '全部' }, ...HELP_CATEGORIES],
    lostCategories: [{ id: 'all', name: '全部' }, ...LOST_CATEGORIES],
    selectedCategory: 'all',
    posts: [],
    loading: false,
    page: 1,
    pageSize: 15,
    hasMore: true,
    keyword: ''
  },

  onLoad(options) {
    if (options && options.type) {
      this.setData({
        activeTab: options.type === 'lost' ? 'lost' : 'help'
      })
    }
    this.loadPosts(true)
  },

  onPullDownRefresh() {
    this.loadPosts(true, () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPosts(false)
    }
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({
      activeTab: tab,
      selectedCategory: 'all',
      lostSubTab: 'all'
    })
    this.loadPosts(true)
  },

  onSwitchLostSubTab(e) {
    const sub = e.currentTarget.dataset.sub
    if (sub === this.data.lostSubTab) return
    this.setData({ lostSubTab: sub })
    this.loadPosts(true)
  },

  onSelectCategory(e) {
    const cat = e.currentTarget.dataset.id
    if (cat === this.data.selectedCategory) return
    this.setData({ selectedCategory: cat })
    this.loadPosts(true)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadPosts(true)
  },

  async loadPosts(reset = false, callback) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    try {
      let typeParam = this.data.activeTab
      if (this.data.activeTab === 'lost' && this.data.lostSubTab !== 'all') {
        typeParam = this.data.lostSubTab
      }

      const res = await app.callDB('getMutualPosts', {
        page,
        pageSize: this.data.pageSize,
        type: typeParam,
        category: this.data.selectedCategory,
        keyword: this.data.keyword
      })

      const list = (res && res.data) || []
      const formatted = list.map((item) => ({
        ...item,
        timeDisplay: this.formatTime(item.createTime)
      }))

      this.setData({
        posts: reset ? formatted : [...this.data.posts, ...formatted],
        page,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('加载互助列表失败:', err)
      this.setData({ loading: false })
    } finally {
      if (typeof callback === 'function') callback()
    }
  },

  formatTime(isoStr) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    if (Number.isNaN(d.getTime())) return ''
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}-${day} ${h}:${min}`
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageMutual/pages/mutual-detail/mutual-detail?id=${id}`
    })
  },

  goToCreate() {
    const defaultType = this.data.activeTab === 'lost'
      ? (this.data.lostSubTab === 'found' ? 'found' : 'lost')
      : 'help'
    wx.navigateTo({
      url: `/packageMutual/pages/mutual-create/mutual-create?type=${defaultType}`
    })
  }
})
