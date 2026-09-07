// packageBuddy/pages/buddy-square/buddy-square.js - 同频搭子广场
const app = getApp()
const { BUDDY_CATEGORIES } = require('../../../utils/domain/buddy')

Page({
  data: {
    categories: [{ id: 'all', name: '全部' }, ...BUDDY_CATEGORIES],
    currentCategory: 'all',
    statusFilter: 'OPEN', // 'OPEN' or 'all'
    posts: [],
    loading: false,
    page: 1,
    pageSize: 15,
    hasMore: true,
    keyword: ''
  },

  onLoad() {
    this.loadPosts(true)
  },

  onPullDownRefresh() {
    this.loadPosts(true, () => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPosts(false)
    }
  },

  onSelectCategory(e) {
    const cat = e.currentTarget.dataset.id
    if (cat === this.data.currentCategory) return
    this.setData({ currentCategory: cat })
    this.loadPosts(true)
  },

  onToggleStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.statusFilter) return
    this.setData({ statusFilter: status })
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
      const res = await app.callDB('getBuddyPosts', {
        page,
        pageSize: this.data.pageSize,
        category: this.data.currentCategory,
        status: this.data.statusFilter,
        keyword: this.data.keyword
      })

      const list = (res && res.data) || []
      const formatted = list.map((item) => ({
        ...item,
        timeDisplay: this.formatTime(item.startAt)
      }))

      this.setData({
        posts: reset ? formatted : [...this.data.posts, ...formatted],
        page,
        hasMore: list.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('加载搭子列表失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (typeof callback === 'function') callback()
    }
  },

  formatTime(isoStr) {
    if (!isoStr) return '待定'
    const d = new Date(isoStr)
    if (Number.isNaN(d.getTime())) return isoStr
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hours}:${mins}`
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageBuddy/pages/buddy-detail/buddy-detail?id=${id}`
    })
  },

  goToCreate() {
    wx.navigateTo({
      url: '/packageBuddy/pages/buddy-create/buddy-create'
    })
  }
})
