const app = getApp()
const PARCEL_SIZE_LABELS = { SMALL: '小件', MEDIUM: '中件', LARGE: '大件' }

const decorate = (row) => {
  if (!row) return row
  const firstItem = row.pickupItems && row.pickupItems[0]
  const size = (firstItem && firstItem.parcelSize) || null
  const decoratedItems = (row.pickupItems || []).map((it) => ({
    ...it,
    parcelSizeLabel: PARCEL_SIZE_LABELS[it.parcelSize] || '旧订单/未分类'
  }))
  return {
    ...row,
    pickupItems: decoratedItems,
    parcelSizeLabel: PARCEL_SIZE_LABELS[size] || '旧订单/未分类',
    expectedParcelSizeLabel: PARCEL_SIZE_LABELS[row.expectedParcelSize] || row.expectedParcelSize || '未记录',
    actualParcelSizeLabel: PARCEL_SIZE_LABELS[row.actualParcelSize] || row.actualParcelSize || '未记录',
    priceText: (Number(row.amountCents || 0) / 100).toFixed(2),
    statusLabel: ({ WAIT_PAYMENT: '待支付', WAIT_PICKUP: '待取件', DELIVERING: '配送中', COMPLETED: '已完成', CANCELLED: '已取消' }[row.orderStatus] || row.orderStatus),
    tone: row.orderStatus === 'COMPLETED' ? 'success' : row.orderStatus === 'CANCELLED' ? 'danger' : 'warn'
  }
}

Page({
  data: { order: null, capabilities: {} },
  onLoad(options) { this.orderId = options.orderId; this.load() },
  onBack() { wx.navigateBack() },
  async load() {
    try {
      const [caps, order] = await Promise.all([
        app.callDB('getMyStaffCapabilities', {}),
        app.callDB('staffGetExpressOrderDetail', { orderId: this.orderId })
      ])
      this.setData({ capabilities: caps.data, order: decorate(order.data) })
    } catch (e) {
      wx.showToast({ title: e.msg || '无权限', icon: 'none' })
    }
  },
  async updateStatus(e) {
    const status = e.currentTarget.dataset.status
    if (!status) return
    try {
      const res = await app.callDB('staffUpdateExpressOrderStatus', { orderId: this.orderId, status })
      this.setData({ order: decorate(res.data) })
      wx.showToast({ title: '状态已更新', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.msg || '更新失败', icon: 'none' })
    }
  },
  onReportMismatch() {
    const options = [
      { size: 'SMALL', label: '实际为小件 (¥1)' },
      { size: 'MEDIUM', label: '实际为中件 (¥3)' },
      { size: 'LARGE', label: '实际为大件 (¥6)' }
    ]
    wx.showActionSheet({
      itemList: options.map((opt) => opt.label),
      success: async (res) => {
        const selected = options[res.tapIndex]
        if (!selected) return
        try {
          const resCall = await app.callDB('staffRecordExpressParcelMismatch', {
            orderId: this.orderId,
            actualParcelSize: selected.size,
            expectedParcelSize: (this.data.order && this.data.order.pickupItems && this.data.order.pickupItems[0] && this.data.order.pickupItems[0].parcelSize) || 'SMALL',
            note: `工作人员现场核验标记为${selected.label}`
          })
          this.setData({ order: decorate(resCall.data) })
          wx.showToast({ title: '已记录规格差异', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.msg || '记录失败', icon: 'none' })
        }
      }
    })
  }
})
