const app = getApp()

const statusLabel = { WAIT_PAYMENT: '待支付', WAIT_PICKUP: '待取件', DELIVERING: '配送中', COMPLETED: '已完成', CANCELLED: '已取消' }
const decorate = (row) => ({ ...row, statusLabel: statusLabel[row.orderStatus] || row.orderStatus, tone: row.orderStatus === 'COMPLETED' ? 'success' : row.orderStatus === 'CANCELLED' ? 'danger' : 'warn' })
const itemKey = (orderId, itemId) => `${orderId}:${itemId}`

function pickupSummary(order) {
  const counts = new Map()
  ;(order.pickupItems || []).forEach((item) => counts.set(item.pickupPointNameSnapshot || item.pickupPointId, (counts.get(item.pickupPointNameSnapshot || item.pickupPointId) || 0) + item.packageCount))
  return Array.from(counts.entries()).map(([name, count]) => `${name}×${count}`).join(' / ')
}

Page({
  data: { orders: [], activeStatus: '', keyword: '', workMode: 'pickup', pickupGroups: [], deliveryGroups: [], selectedPickupItemIds: [], loading: false },
  onLoad() { this.load() },
  onShow() { if (this._loaded) this.load() },
  onBack() { wx.navigateBack() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const caps = await app.callDB('getMyStaffCapabilities', {})
      if (!caps.data || !caps.data.isStaff) throw { msg: '无权限' }
      const res = await app.callDB('staffGetExpressOrders', { status: this.data.activeStatus, keyword: this.data.keyword })
      const orders = (res.data || []).map(decorate)
      this.setData({ orders, pickupGroups: this.buildPickupGroups(orders), deliveryGroups: this.buildDeliveryGroups(orders) })
      this._loaded = true
    } catch (e) { wx.showToast({ title: e.msg || '订单加载失败', icon: 'none' }) } finally { this.setData({ loading: false }) }
  },
  buildPickupGroups(orders = this.data.orders) {
    const groups = new Map()
    orders.filter((order) => order.orderStatus === 'WAIT_PICKUP').forEach((order) => {
      const selectedCount = (order.pickupItems || []).filter((item) => this.data.selectedPickupItemIds.includes(itemKey(order._id, item.id))).length
      const progressLabel = `${selectedCount}/${(order.pickupItems || []).length} 已勾选`
      ;(order.pickupItems || []).forEach((item) => {
        const key = item.pickupPointId
        if (!groups.has(key)) groups.set(key, { pickupPointId: key, pickupPointName: item.pickupPointNameSnapshot || item.pickupPointId, totalPackages: 0, items: [] })
        const group = groups.get(key); const keyId = itemKey(order._id, item.id); group.totalPackages += item.packageCount
        group.items.push({ ...item, keyId, orderId: order._id, orderNo: order.orderNo, recipientName: order.recipientNameSnapshot || '未填写', destination: `${order.deliveryCampusNameSnapshot || order.deliveryCampus} · ${order.dormAreaNameSnapshot || order.dormArea} · ${order.dormBuildingNameSnapshot || order.dormBuilding} · ${order.roomNumberSnapshot || order.roomNumber}`, progressLabel, selected: this.data.selectedPickupItemIds.includes(keyId) })
      })
    })
    return Array.from(groups.values())
  },
  buildDeliveryGroups(orders = this.data.orders) {
    const groups = new Map()
    orders.filter((order) => order.orderStatus === 'DELIVERING').forEach((order) => {
      const key = [order.deliveryCampus, order.dormArea, order.dormBuildingId || order.dormBuilding, order.roomNumberSnapshot || order.roomNumber].join('|')
      if (!groups.has(key)) groups.set(key, { key, address: `${order.deliveryCampusNameSnapshot || order.deliveryCampus} · ${order.dormAreaNameSnapshot || order.dormArea} · ${order.dormBuildingNameSnapshot || order.dormBuilding} · ${order.roomNumberSnapshot || order.roomNumber}`, orders: [] })
      groups.get(key).orders.push({ ...order, pickupSummary: pickupSummary(order) })
    })
    return Array.from(groups.values())
  },
  onModeChange(e) { const workMode = e.currentTarget.dataset.mode === 'delivery' ? 'delivery' : 'pickup'; this.setData({ workMode }) },
  onFilter(e) { this.setData({ activeStatus: e.currentTarget.dataset.status }, () => this.load()) },
  onKeywordInput(e) { this.setData({ keyword: e.detail.value }) },
  onKeywordConfirm() { this.load() },
  onSelectPickupItem(e) {
    const keyId = e.currentTarget.dataset.keyId
    const selectedPickupItemIds = this.data.selectedPickupItemIds.includes(keyId) ? this.data.selectedPickupItemIds.filter((item) => item !== keyId) : this.data.selectedPickupItemIds.concat(keyId)
    this.setData({ selectedPickupItemIds, pickupGroups: this.buildPickupGroups(this.data.orders) })
  },
  allItemsSelected(order) { return (order.pickupItems || []).length > 0 && order.pickupItems.every((item) => this.data.selectedPickupItemIds.includes(itemKey(order._id, item.id))) },
  async startSelectedDelivery() {
    const readyIds = this.data.orders.filter((order) => order.orderStatus === 'WAIT_PICKUP' && this.allItemsSelected(order)).map((order) => order._id)
    if (!readyIds.length) return wx.showToast({ title: '请先勾选订单的全部取件码', icon: 'none' })
    try { await app.callDB('staffBatchUpdateExpressOrderStatus', { orderIds: readyIds, status: 'DELIVERING' }); this.setData({ selectedPickupItemIds: [] }); await this.load(); wx.showToast({ title: '已开始配送', icon: 'success' }) } catch (e) { wx.showToast({ title: e.msg || '更新失败', icon: 'none' }) }
  },
  async completeDelivery(e) {
    try { await app.callDB('staffUpdateExpressOrderStatus', { orderId: e.currentTarget.dataset.orderId, status: 'COMPLETED' }); await this.load(); wx.showToast({ title: '已标记完成', icon: 'success' }) } catch (err) { wx.showToast({ title: err.msg || '更新失败', icon: 'none' }) }
  },
  onTapOrder(e) { wx.navigateTo({ url: `/packageExpress/pages/staff-order-detail/staff-order-detail?orderId=${encodeURIComponent(e.currentTarget.dataset.id)}` }) }
})
