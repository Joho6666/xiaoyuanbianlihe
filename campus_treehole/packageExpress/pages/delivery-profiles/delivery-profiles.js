const app = getApp()

function maskPhone(phone) {
  const value = String(phone || '')
  return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
}

function decorate(profile) {
  return { ...profile, maskedPhone: maskPhone(profile.contactPhone) }
}

Page({
  data: { mode: 'manage', recipientMode: 'self', profiles: [], visibleProfiles: [], selectedProfileId: '', loading: false },
  onLoad(options = {}) {
    const mode = options.mode === 'select' ? 'select' : 'manage'
    this.setData({ mode, recipientMode: options.recipientMode === 'other' ? 'other' : 'self', selectedProfileId: options.selectedProfileId || '' })
    this.load()
  },
  onShow() { if (this._loaded) this.load() },
  onBack() { wx.navigateBack() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const res = await app.callDB('getMyExpressDeliveryProfiles', {})
      const profiles = (res.data || []).map(decorate)
      this.setData({ profiles, visibleProfiles: this.filterProfiles(profiles) })
      this._loaded = true
    } catch (e) {
      wx.showToast({ title: e.msg || '配送信息加载失败', icon: 'none' })
    } finally { this.setData({ loading: false }) }
  },
  filterProfiles(profiles = this.data.profiles) {
    if (this.data.mode !== 'select') return profiles
    return profiles.filter((item) => this.data.recipientMode === 'self' ? item.isSelf === true : item.isSelf !== true)
  },
  onModeChange(e) {
    const recipientMode = e.currentTarget.dataset.mode === 'other' ? 'other' : 'self'
    this.setData({ recipientMode, visibleProfiles: this.filterProfiles(this.data.profiles) })
  },
  onSelectProfile(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    if (this.data.mode === 'select') {
      wx.setStorageSync('express_selected_profile_id', id)
      wx.navigateBack()
    }
  },
  onAdd() {
    wx.navigateTo({ url: `/packageExpress/pages/delivery-profile-edit/delivery-profile-edit?mode=${this.data.mode}&isSelf=${this.data.recipientMode === 'self' ? '1' : '0'}` })
  },
  onEdit(e) { wx.navigateTo({ url: `/packageExpress/pages/delivery-profile-edit/delivery-profile-edit?profileId=${encodeURIComponent(e.currentTarget.dataset.id)}` }) },
  async onSetDefault(e) {
    try { await app.callDB('setDefaultExpressDeliveryProfile', { profileId: e.currentTarget.dataset.id }); await this.load(); wx.showToast({ title: '已设为默认', icon: 'success' }) } catch (err) { wx.showToast({ title: err.msg || '设置失败', icon: 'none' }) }
  },
  onArchive(e) {
    const profileId = e.currentTarget.dataset.id
    wx.showModal({ title: '归档配送信息', content: '归档后不会影响历史订单，确定继续吗？', success: async (result) => {
      if (!result.confirm) return
      try { await app.callDB('archiveExpressDeliveryProfile', { profileId }); await this.load(); wx.showToast({ title: '已归档', icon: 'success' }) } catch (err) { wx.showToast({ title: err.msg || '归档失败', icon: 'none' }) }
    } })
  },
  stopTap() {}
})
