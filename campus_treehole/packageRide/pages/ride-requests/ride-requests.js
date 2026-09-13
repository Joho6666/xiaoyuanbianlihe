// packageRide/pages/ride-requests/ride-requests.js - 拼车申请管理
const app = getApp()
const { formatRideTime } = require('../../../utils/ride-format')

const REQUEST_STATUS_LABELS = {
  PENDING: '待处理',
  ACCEPTED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已撤销'
}

Page({
  data: {
    currentTab: 'received',        // received | sent
    list: [],
    loading: true
  },

  onLoad(options = {}) {
    if (options.tab === 'sent') this.setData({ currentTab: 'sent' })
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
      const result = await app.callDB('getRideRequests', { tab: this.data.currentTab })
      const list = ((result && result.data && result.data.list) || []).map(item => ({
        ...item,
        statusLabel: REQUEST_STATUS_LABELS[item.status] || item.status,
        timeText: item.ride ? formatRideTime(item.ride.departureTime) : '',
        isPending: item.status === 'PENDING'
      }))
      this.setData({ list })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRideTap(e) {
    const { rideid } = e.currentTarget.dataset
    if (rideid) wx.navigateTo({ url: `/packageRide/pages/ride-detail/ride-detail?rideId=${rideid}` })
  },

  onAccept(e) {
    this.review(e, 'accept', '接受')
  },

  onReject(e) {
    this.review(e, 'reject', '拒绝')
  },

  review(e, decision, label) {
    const { requestid, name } = e.currentTarget.dataset
    if (!requestid) return
    wx.showModal({
      title: `${label}申请`,
      content: `确定${label}「${name || '同学'}」的加入申请吗？`,
      confirmColor: '#2f76ff',
      success: async res => {
        if (!res.confirm) return
        try {
          await app.callDB('reviewRideJoin', { requestId: requestid, decision })
          wx.showToast({ title: `已${label}`, icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: (err && err.msg) || '操作失败', icon: 'none' })
        }
      }
    })
  }
})
