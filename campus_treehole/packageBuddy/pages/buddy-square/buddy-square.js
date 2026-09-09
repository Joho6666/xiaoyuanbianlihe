// packageBuddy/pages/buddy-square/buddy-square.js - Tongpin 同频搭子广场
const app = getApp()
const { BUDDY_CATEGORIES } = require('../../../utils/domain/buddy')

Page({
  data: {
    categories: [{ id: 'all', name: '全部', emoji: '✨' }, ...BUDDY_CATEGORIES],
    currentCategory: 'all',
    statusFilter: 'OPEN', // 'OPEN' or 'all'
    posts: [],
    loading: false,
    page: 1,
    pageSize: 15,
    hasMore: true,
    keyword: ''
  },

  onLoad(options = {}) {
    if (this.data.categories.some(c => c.id === options.category)) this.setData({currentCategory: options.category})
    this._shownCampus = app.getSelectedCampusId()
    this.loadPosts(true)
  },

  onShow() {
    const campusId = app.getSelectedCampusId()
    if (this._shownCampus !== campusId) {
      this._shownCampus = campusId
      this.setData({ posts: [], loading: false, page: 1, hasMore: true })
      this.loadPosts(true)
    }
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
      const campusId = app.getSelectedCampusId ? app.getSelectedCampusId() : ''
      const res = await app.callDB('getBuddyPosts', {
        page,
        pageSize: this.data.pageSize,
        category: this.data.currentCategory,
        status: this.data.statusFilter,
        keyword: this.data.keyword,
        campusId
      })

      const list = (res && res.data) || []
      const categoryMap = {}
      BUDDY_CATEGORIES.forEach((c) => {
        categoryMap[c.id] = c
      })

      const formatted = list.map((item) => {
        const catInfo = categoryMap[item.category] || { name: item.category || '搭子', emoji: '🤝' }
        const accepted = Number(item.acceptedCount) || 1
        const max = Number(item.maxPeople) || 2
        const remain = Math.max(0, max - accepted)

        return {
          ...item,
          categoryName: catInfo.name,
          categoryEmoji: catInfo.emoji,
          acceptedCount: accepted,
          maxPeople: max,
          remainPeople: remain,
          timeDisplay: this.formatSmartTime(item.startAt)
        }
      })

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

  formatSmartTime(isoStr) {
    if (!isoStr) return '待定'
    const target = new Date(isoStr)
    if (Number.isNaN(target.getTime())) return isoStr

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const tomorrow = today + 24 * 3600 * 1000
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()

    const hours = String(target.getHours()).padStart(2, '0')
    const mins = String(target.getMinutes()).padStart(2, '0')
    const timeClock = `${hours}:${mins}`

    if (targetDay === today) {
      return `今天 ${timeClock}`
    }
    if (targetDay === tomorrow) {
      return `明天 ${timeClock}`
    }

    const m = target.getMonth() + 1
    const d = target.getDate()
    return `${m}月${d}日 ${timeClock}`
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
