const app = getApp()
Page({
  data: { settings: { acceptingOrders: false, pickupPoints: [] }, selectedPointId: '', selectedPointName: '', form: { packageCount: 1 }, submitting: false },
  onLoad() { this.loadSettings() },
  async loadSettings() { try { const res = await app.callDB('getExpressServiceConfig', {}); this.setData({ settings: res.data || {} }) } catch (e) { this.setData({ settings: { acceptingOrders: false, pickupPoints: [] } }) } },
  onBack() { wx.navigateBack() },
  onPointChange(e) { const point = (this.data.settings.pickupPoints || [])[Number(e.detail.value)]; if (point) this.setData({ selectedPointId: point.id, selectedPointName: point.name }) },
  onInput(e) { const key = e.currentTarget.dataset.key; this.setData({ [`form.${key}`]: e.detail.value }) },
  async onSubmit() {
    if (!app.requestComplianceForAction() || this.data.submitting) return
    this.setData({ submitting: true })
    try { const res = await app.callDB('createExpressOrder', { ...this.data.form, packageCount: Number(this.data.form.packageCount), pickupPointId: this.data.selectedPointId }); wx.redirectTo({ url: `/packageExpress/pages/detail/detail?orderId=${encodeURIComponent(res.data._id)}` }) }
    catch (e) { wx.showToast({ title: e.msg || '订单提交失败', icon: 'none' }) }
    this.setData({ submitting: false })
  }
})
