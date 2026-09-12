// packageRide/pages/ride-matches/ride-matches.js - 发布成功后的推荐同行
const app = getApp()
const { formatRideTime, formatFlexible, departureLabel } = require('../../../utils/ride-format')

Page({
  data: {
    rideId: '',
    matchCount: 0,
    rides: [],
    loading: true
  },

  onLoad(options = {}) {
    this.setData({ rideId: options.rideId || '' })
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  async load() {
    if (!this.data.rideId) {
      this.setData({ loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await app.callDB('getRideMatches', { rideId: this.data.rideId })
      const data = (result && result.data) || {}
      const rides = (data.rides || []).map(ride => ({
        id: ride.id,
        percent: ride.matchPercent,
        authorName: (ride.author && ride.author.nickName) || '同学',
        authorAvatar: (ride.author && ride.author.avatarUrl) || '/images/avatar_default.png',
        originName: (ride.origin && (ride.origin.shortName || ride.origin.name)) || '',
        destinationName: (ride.destination && (ride.destination.shortName || ride.destination.name)) || '',
        timeText: formatRideTime(ride.departureTime),
        departLabel: departureLabel(ride),
        flexLabel: ride.departureMode === 'SCHEDULED' ? formatFlexible(ride.flexibleMinutes) : '',
        peopleText: `${ride.currentPeople}/${ride.maxPeople}`
      }))
      this.setData({ rides, matchCount: rides.length })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '获取匹配失败', icon: 'none' })
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
      this.setData({
        rides: this.data.rides.map(item => item.id === id ? { ...item, applied: true } : item)
      })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '申请失败', icon: 'none' })
    }
  },

  goSquare() {
    wx.redirectTo({ url: '/packageRide/pages/ride-square/ride-square' })
  }
})
