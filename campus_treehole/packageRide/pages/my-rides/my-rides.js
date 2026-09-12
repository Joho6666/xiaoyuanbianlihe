// packageRide/pages/my-rides/my-rides.js - 我的拼车行程
const app = getApp()
const { formatRideTime, formatFlexible, departureLabel, rideStatusLabel } = require('../../../utils/ride-format')

Page({
  data: {
    currentTab: 'published',       // published | joined
    list: [],
    loading: true
  },

  onLoad(options = {}) {
    if (options.tab === 'joined') this.setData({ currentTab: 'joined' })
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.id
    if (tab === this.data.currentTab) return
    this.setData({ currentTab: tab, list: [] })
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const result = await app.callDB('getMyRides', { tab: this.data.currentTab })
      const list = ((result && result.data && result.data.rides) || []).map(ride => ({
        id: ride.id,
        originName: (ride.origin && (ride.origin.shortName || ride.origin.name)) || '',
        destinationName: (ride.destination && (ride.destination.shortName || ride.destination.name)) || '',
        timeText: formatRideTime(ride.departureTime),
        departLabel: departureLabel(ride),
        flexLabel: ride.departureMode === 'SCHEDULED' ? formatFlexible(ride.flexibleMinutes) : '',
        peopleText: `${ride.currentPeople}/${ride.maxPeople}`,
        status: ride.status,
        statusLabel: rideStatusLabel(ride.status),
        isActive: ride.status === 'OPEN' || ride.status === 'FULL',
        isDeparted: ride.status === 'DEPARTED',
        isClosed: ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(ride.status)
      }))
      this.setData({ list })
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

  onRequestsTap() {
    wx.navigateTo({ url: '/packageRide/pages/ride-requests/ride-requests' })
  },

  goPublish() {
    wx.navigateTo({ url: '/packageRide/pages/ride-publish/ride-publish' })
  }
})
