// packageRide/pages/ride-detail/ride-detail.js - 行程详情
const app = getApp()
const { formatRideTime, formatFlexible, departureLabel, rideStatusLabel } = require('../../../utils/ride-format')

Page({
  data: {
    rideId: '',
    ride: null,
    timeText: '',
    statusLabel: '',
    statusClass: '',
    markers: [],
    mapCenter: { latitude: 25.3, longitude: 110.3 },
    loading: true,
    applying: false
  },

  onLoad(options = {}) {
    this.setData({ rideId: options.rideId || '' })
  },

  onShow() {
    if (this.data.rideId) this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  async load() {
    if (!this.data.rideId) {
      this.setData({ loading: false })
      return
    }
    try {
      const result = await app.callDB('getRideById', { rideId: this.data.rideId })
      const ride = result && result.data
      if (!ride) throw (result || {})
      const markers = []
      if (ride.origin && ride.origin.latitude != null) {
        markers.push({ id: 1, latitude: ride.origin.latitude, longitude: ride.origin.longitude, title: ride.origin.name, iconPath: '/images/icon_location.png', width: 24, height: 24 })
      }
      if (ride.destination && ride.destination.latitude != null) {
        markers.push({ id: 2, latitude: ride.destination.latitude, longitude: ride.destination.longitude, title: ride.destination.name, iconPath: '/images/icon_location.png', width: 24, height: 24 })
      }
      const points = markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }))
      const statusLabel = rideStatusLabel(ride.status)
      this.setData({
        ride,
        markers: markers.length ? markers : [],
        mapCenter: points.length ? {
          latitude: (points[0].latitude + points[points.length - 1].latitude) / 2,
          longitude: (points[0].longitude + points[points.length - 1].longitude) / 2
        } : this.data.mapCenter,
        timeText: formatRideTime(ride.departureTime),
        flexText: ride.departureMode === 'NOW' ? '约30分钟内出发' : formatFlexible(ride.flexibleMinutes),
        statusLabel,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: (err && err.msg) || '行程加载失败', icon: 'none' })
    }
  },

  async onApply() {
    if (this.data.applying) return
    if (!app.requestComplianceForAction()) return
    this.setData({ applying: true })
    try {
      const result = await app.callDB('applyRideJoin', { rideId: this.data.rideId })
      wx.showToast({ title: '申请已发送', icon: 'success' })
      this.load()
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '申请失败', icon: 'none' })
    } finally {
      this.setData({ applying: false })
    }
  },

  onCancelApply() {
    wx.showModal({
      title: '撤销申请',
      content: '确定撤销加入申请吗？',
      confirmColor: '#2f76ff',
      success: async res => {
        if (!res.confirm) return
        try {
          await app.callDB('cancelRideJoin', { rideId: this.data.rideId })
          wx.showToast({ title: '已撤销', icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: (err && err.msg) || '撤销失败', icon: 'none' })
        }
      }
    })
  },

  onLeave() {
    wx.showModal({
      title: '退出行程',
      content: '确定退出行程吗？名额将回补给其他同学。',
      confirmColor: '#2f76ff',
      success: async res => {
        if (!res.confirm) return
        try {
          await app.callDB('leaveRide', { rideId: this.data.rideId })
          wx.showToast({ title: '已退出', icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: (err && err.msg) || '退出失败', icon: 'none' })
        }
      }
    })
  },

  onDepart() {
    this.authorAction('depart', '确定标记为已出发吗？')
  },

  onComplete() {
    this.authorAction('complete', '确定完成本次行程吗？')
  },

  onCancelRide() {
    this.authorAction('cancel', '确定取消行程吗？已接受的成员将收到通知。')
  },

  authorAction(action, content) {
    wx.showModal({
      title: '操作确认',
      content,
      confirmColor: '#2f76ff',
      success: async res => {
        if (!res.confirm) return
        try {
          await app.callDB('updateRideStatus', { rideId: this.data.rideId, action })
          app.globalData.rideNeedsRefresh = true
          this.load()
        } catch (err) {
          wx.showToast({ title: (err && err.msg) || '操作失败', icon: 'none' })
        }
      }
    })
  },

  onViewRequests() {
    wx.navigateTo({ url: `/packageRide/pages/ride-requests/ride-requests?rideId=${this.data.rideId}` })
  },

  async onMemberTap(e) {
    const { targetuserid, name, cancontact } = e.currentTarget.dataset
    if (!cancontact || !targetuserid) return
    try {
      await app.callDB('startRideContact', { rideId: this.data.rideId, targetUserId: targetuserid })
      wx.navigateTo({
        url: `/pages/chat/chat?targetUserId=${encodeURIComponent(targetuserid)}&title=${encodeURIComponent(name || '同路人')}&context=Ride&rideId=${this.data.rideId}`
      })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '无法发起私信', icon: 'none' })
    }
  },

  onReport() {
    wx.showActionSheet({
      itemList: ['虚假行程', '垃圾营销', '人身攻击', '其他'],
      success: async res => {
        const reasons = ['虚假行程', '垃圾营销', '人身攻击', '其他']
        try {
          await app.callDB('reportContent', {
            targetId: this.data.rideId,
            targetType: 'ride',
            reason: reasons[res.tapIndex] || '其他'
          })
          wx.showToast({ title: '已举报', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: (err && err.msg) || '举报失败', icon: 'none' })
        }
      }
    })
  }
})
