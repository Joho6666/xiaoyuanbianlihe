// packageRide/pages/ride-square/ride-square.js - 拼车广场
const app = getApp()
const { formatRideTime, formatRelativeTime, departureLabel, formatFlexible } = require('../../../utils/ride-format')

const TABS = [
  { id: 'all', name: '全部' },
  { id: 'now', name: '现在出发' },
  { id: 'today', name: '今天' },
  { id: 'tomorrow', name: '明天' }
]

Page({
  data: {
    tabs: TABS,
    currentTab: 'all',
    keyword: '',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this._shownCampus = app.getSelectedCampusId()
    this.load(true)
  },

  onShow() {
    const campusId = app.getSelectedCampusId()
    if (app.globalData.rideNeedsRefresh || this._shownCampus !== campusId) {
      this._shownCampus = campusId
      app.globalData.rideNeedsRefresh = false
      this.load(true)
    }
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(false)
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.id
    if (tab === this.data.currentTab) return
    this.setData({ currentTab: tab })
    this.load(true)
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.load(true)
  },

  async load(reset = false) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true, ...(reset ? { page: 1, list: [], hasMore: true } : {}) })
    try {
      const result = await app.callDB('getRideSquare', {
        tab: this.data.currentTab,
        keyword: this.data.keyword,
        page,
        pageSize: this.data.pageSize
      })
      const incoming = ((result && result.data && result.data.list) || []).map(ride => ({
        id: ride.id,
        authorName: (ride.author && ride.author.nickName) || '同学',
        authorAvatar: (ride.author && ride.author.avatarUrl) || '/images/avatar_default.png',
        originName: (ride.origin && (ride.origin.shortName || ride.origin.name)) || '',
        destinationName: (ride.destination && (ride.destination.shortName || ride.destination.name)) || '',
        timeText: formatRideTime(ride.departureTime),
        timeAgo: formatRelativeTime(ride.createdAt),
        departLabel: departureLabel(ride),
        flexLabel: ride.departureMode === 'SCHEDULED' ? formatFlexible(ride.flexibleMinutes) : '约30分钟内出发',
        peopleText: `${ride.currentPeople}/${ride.maxPeople}`,
        remainPeople: ride.remainPeople
      }))
      this.setData({
        list: reset ? incoming : this.data.list.concat(incoming),
        page,
        hasMore: !!(result && result.data && result.data.hasMore)
      })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRideTap(e) {
    const { id } = e.currentTarget.dataset
    if (id) wx.navigateTo({ url: `/packageRide/pages/ride-detail/ride-detail?rideId=${id}` })
  },

  async onApplyTap(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    if (!app.requestComplianceForAction()) return
    try {
      await app.callDB('applyRideJoin', { rideId: id })
      wx.showToast({ title: '申请已发送', icon: 'success' })
      app.globalData.rideNeedsRefresh = true
      this.setData({
        list: this.data.list.map(item => item.id === id ? { ...item, applied: true } : item)
      })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '申请失败', icon: 'none' })
    }
  },

  goPublish() {
    wx.navigateTo({ url: '/packageRide/pages/ride-publish/ride-publish' })
  }
})
