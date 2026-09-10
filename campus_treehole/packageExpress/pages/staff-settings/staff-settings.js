const app = getApp()

Page({
  data: { campusId: '', saving: false, form: { acceptingOrders: false, basePriceCents: 300, pricingMode: 'PER_PACKAGE', baseOrderPriceCents: 0, perPackagePriceCents: 300, extraPickupPointPriceCents: 0, cutoffTime: '', deliveryWindow: '', notice: '', pickupJson: '', deliveryJson: '' } },
  onLoad() { this.load() },
  onBack() { wx.navigateBack() },
  async load() {
    try {
      const [caps, config] = await Promise.all([app.callDB('getMyStaffCapabilities', {}), app.callDB('getExpressServiceConfig', {})])
      if (!caps.data || !caps.data.isOwner) throw { msg: '仅 Owner 可访问' }
      const point = (config.data.pickupPoints || [])[0] || {}
      this.setData({ campusId: config.data.campusId, form: { acceptingOrders: !!config.data.acceptingOrders, basePriceCents: config.data.basePriceCents || 0, pricingMode: config.data.pricingMode || 'PER_PACKAGE', baseOrderPriceCents: config.data.baseOrderPriceCents || 0, perPackagePriceCents: config.data.perPackagePriceCents || config.data.basePriceCents || 0, extraPickupPointPriceCents: config.data.extraPickupPointPriceCents || 0, cutoffTime: config.data.cutoffTime || '', deliveryWindow: config.data.deliveryWindow || '', notice: config.data.notice || '', pointName: point.name || '', pickupJson: JSON.stringify(config.data.pickupPoints || [], null, 2), deliveryJson: JSON.stringify(config.data.deliveryCampuses || [], null, 2) } })
    } catch (e) { wx.showToast({ title: e.msg || '无权限', icon: 'none' }) }
  },
  onToggle(e) { this.setData({ 'form.acceptingOrders': !!e.detail.value }) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  async onSave() {
    if (this.data.saving) return
    let deliveryCampuses = []; let pickupPoints = []
    try { deliveryCampuses = JSON.parse(this.data.form.deliveryJson || '[]'); pickupPoints = JSON.parse(this.data.form.pickupJson || '[]') } catch (e) { return wx.showToast({ title: '配置 JSON 格式有误', icon: 'none' }) }
    this.setData({ saving: true })
    try {
      const res = await app.callDB('ownerUpdateExpressSettings', { acceptingOrders: this.data.form.acceptingOrders, basePriceCents: Number(this.data.form.basePriceCents), pricingMode: this.data.form.pricingMode, baseOrderPriceCents: Number(this.data.form.baseOrderPriceCents), perPackagePriceCents: Number(this.data.form.perPackagePriceCents), extraPickupPointPriceCents: Number(this.data.form.extraPickupPointPriceCents), cutoffTime: this.data.form.cutoffTime, deliveryWindow: this.data.form.deliveryWindow, notice: this.data.form.notice, deliveryCampuses, pickupPoints })
      this.setData({ campusId: res.data.campusId }); wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) { wx.showToast({ title: e.msg || '保存失败', icon: 'none' }) } finally { this.setData({ saving: false }) }
  }
})
