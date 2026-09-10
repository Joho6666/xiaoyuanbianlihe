const app = getApp()

const requestId = () => `express_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

function maskPhone(phone) {
  const value = String(phone || '')
  return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
}

function decorateProfile(profile) {
  return { ...profile, maskedPhone: maskPhone(profile.contactPhone) }
}

Page({
  data: {
    settings: { acceptingOrders: false, configured: false, serviceStatus: 'LOADING', pickupPoints: [], deliveryCampuses: [] },
    selectedPointIndex: -1, selectedPointName: '',
    profiles: [], selectedProfile: null, showCacheMigration: false,
    quote: null, clientRequestId: requestId(), loadError: false, loadErrorMsg: '',
    form: { packageCount: 1, pickupCode: '', note: '' },
    submitting: false, quoting: false
  },
  onLoad() { this.loadSettings() },
  onShow() {
    const pendingId = wx.getStorageSync('express_selected_profile_id')
    if (pendingId) {
      wx.removeStorageSync('express_selected_profile_id')
      this.applyProfile(pendingId)
    } else if (this._loaded) {
      this.loadProfiles()
    }
  },
  async loadSettings() {
    try {
      const selectedCampus = (typeof app.getSelectedCampusId === 'function' && app.getSelectedCampusId()) || 'guit-hangtian'
      const res = await app.callDB('getExpressServiceConfig', { campusId: selectedCampus })
      const settings = (res && res.data) || {}
      const saved = wx.getStorageSync('express_delivery_address') || {}
      const pointIndex = (settings.pickupPoints || []).findIndex((item) => item.id === saved.pickupPointId)
      this.setData({ settings, loadError: false, loadErrorMsg: '', selectedPointIndex: pointIndex, selectedPointName: pointIndex >= 0 ? settings.pickupPoints[pointIndex].name : '' })
      await this.loadProfiles()
      if (pointIndex >= 0) this.refreshQuote()
    } catch (e) {
      console.error('[loadSettings] 加载配置失败:', e)
      const errorMsg = (e && (e.msg || e.errMsg || e.message)) || '请检查网络后重试，暂未创建订单'
      this.setData({ loadError: true, loadErrorMsg: errorMsg, settings: { acceptingOrders: false, configured: false, serviceStatus: 'ERROR', pickupPoints: [], deliveryCampuses: [] } })
    }
  },
  async loadProfiles() {
    try {
      const res = await app.callDB('getMyExpressDeliveryProfiles', {})
      const profiles = (res.data || []).map(decorateProfile)
      const selected = profiles.find((item) => item._id === (this.data.selectedProfile && this.data.selectedProfile._id)) || profiles.find((item) => item.isDefault) || profiles[0] || null
      const cached = wx.getStorageSync('express_delivery_address') || {}
      this.setData({ profiles, selectedProfile: selected, showCacheMigration: profiles.length === 0 && !!(cached.phone && cached.deliveryCampus) })
      this._loaded = true
    } catch (e) {
      console.warn('[loadProfiles] 配送信息暂不可用:', e)
      this.setData({ profiles: [], selectedProfile: null, showCacheMigration: false })
    }
  },
  applyProfile(profileId) {
    const profile = this.data.profiles.find((item) => item._id === profileId)
    if (profile) this.setData({ selectedProfile: profile, showCacheMigration: false })
  },
  onRetry() { if (!this.data.loadError) return; this.loadSettings() },
  onBack() { wx.navigateBack() },
  onPointChange(e) { const index = Number(e.detail.value); const point = (this.data.settings.pickupPoints || [])[index]; if (point) this.setData({ selectedPointIndex: index, selectedPointName: point.name }, () => this.refreshQuote()) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  adjustCount(e) { const delta = Number(e.currentTarget.dataset.delta); const count = Math.min(20, Math.max(1, Number(this.data.form.packageCount || 1) + delta)); this.setData({ 'form.packageCount': count }, () => this.refreshQuote()) },
  async refreshQuote() { if (this.data.selectedPointIndex < 0 || this.data.quoting) return; this.setData({ quoting: true }); try { const point = this.data.settings.pickupPoints[this.data.selectedPointIndex]; const res = await app.callDB('getExpressQuote', { campusId: this.data.selectedProfile && this.data.selectedProfile.campusId, pickupPointId: point && point.id, packageCount: Number(this.data.form.packageCount) }); this.setData({ quote: res.data }) } catch (e) { this.setData({ quote: null }) } finally { this.setData({ quoting: false }) } },
  onChooseProfile() { wx.navigateTo({ url: `/packageExpress/pages/delivery-profiles/delivery-profiles?mode=select&recipientMode=${this.data.selectedProfile && this.data.selectedProfile.isSelf ? 'self' : 'other'}&selectedProfileId=${this.data.selectedProfile ? encodeURIComponent(this.data.selectedProfile._id) : ''}` }) },
  onAddProfile() { wx.navigateTo({ url: '/packageExpress/pages/delivery-profile-edit/delivery-profile-edit?mode=select&isSelf=1' }) },
  onMigrateCache() { wx.navigateTo({ url: '/packageExpress/pages/delivery-profile-edit/delivery-profile-edit?mode=select&isSelf=1&migrate=1' }) },
  async onSubmit() {
    if (!app.requestComplianceForAction() || this.data.submitting) return
    if (!this.data.selectedProfile) return wx.showToast({ title: '请先添加配送信息', icon: 'none' })
    const point = this.data.settings.pickupPoints[this.data.selectedPointIndex]
    if (!point) return wx.showToast({ title: '请选择快递点', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const res = await app.callDB('createExpressOrder', { deliveryProfileId: this.data.selectedProfile._id, campusId: this.data.selectedProfile.campusId, pickupPointId: point.id, pickupCode: this.data.form.pickupCode, packageCount: Number(this.data.form.packageCount), note: this.data.form.note, clientRequestId: this.data.clientRequestId })
      wx.setStorageSync('express_delivery_address', { deliveryCampus: this.data.selectedProfile.deliveryCampus, dormArea: this.data.selectedProfile.dormArea, dormBuildingId: this.data.selectedProfile.dormBuildingId, roomNumber: this.data.selectedProfile.roomNumber, phone: this.data.selectedProfile.contactPhone, pickupPointId: point.id })
      wx.redirectTo({ url: `/packageExpress/pages/detail/detail?orderId=${encodeURIComponent(res.data._id)}` })
    } catch (e) { wx.showToast({ title: e.msg || '订单提交失败', icon: 'none' }) } finally { this.setData({ submitting: false }) }
  }
})
