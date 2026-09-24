// packageRide/pages/ride-home/ride-home.js - 拼车同行首页
const app = getApp()
const { getHotRidePlaces } = require('../../../utils/domain/ride-places')
const { formatRideTime, departureLabel, formatFlexible } = require('../../../utils/ride-format')

Page({
  data: {
    hotPlaces: [],
    recentRides: [],
    loading: true
  },

  onLoad() {
    this.setData({ hotPlaces: getHotRidePlaces(8) })
  },

  onShow() {
    this.loadRecent()
  },

  async loadRecent() {
    try {
      const result = await app.callDB('getRideSquare', { tab: 'all', page: 1, pageSize: 3 })
      const list = ((result && result.data && result.data.list) || []).map(ride => ({
        id: ride.id,
        originName: (ride.origin && (ride.origin.shortName || ride.origin.name)) || '',
        destinationName: (ride.destination && (ride.destination.shortName || ride.destination.name)) || '',
        timeText: formatRideTime(ride.departureTime),
        departLabel: departureLabel(ride),
        peopleText: `${ride.currentPeople}/${ride.maxPeople}`
      }))
      this.setData({ recentRides: list, loading: false })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  goPublish() {
    wx.navigateTo({ url: '/packageRide/pages/ride-publish/ride-publish' })
  },

  goSquare() {
    wx.navigateTo({ url: '/packageRide/pages/ride-square/ride-square' })
  },

  goMyRides() {
    wx.navigateTo({ url: '/packageRide/pages/my-rides/my-rides' })
  },

  onHotPlaceTap(e) {
    const { poiid } = e.currentTarget.dataset
    wx.navigateTo({ url: `/packageRide/pages/ride-publish/ride-publish?destination=${encodeURIComponent(poiid || '')}` })
  },

  onRecentTap(e) {
    const { id } = e.currentTarget.dataset
    if (id) wx.navigateTo({ url: `/packageRide/pages/ride-detail/ride-detail?rideId=${id}` })
  }
})
