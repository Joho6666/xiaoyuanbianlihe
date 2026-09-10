const app = getApp()

Page({
  data: {
    profileId: '', mode: 'manage', saving: false, error: '', settings: { deliveryCampuses: [] }, areaOptions: [], buildingOptions: [], selectedCampusIndex: -1, selectedCampusName: '', selectedAreaIndex: -1, selectedAreaName: '', selectedBuildingIndex: -1, selectedBuildingName: '',
    form: { label: '', recipientName: '', contactPhone: '', deliveryCampus: '', dormArea: '', dormBuildingId: '', roomNumber: '', isSelf: true, isDefault: false }
  },
  async onLoad(options = {}) {
    const isSelf = options.isSelf !== '0'
    this.setData({ profileId: options.profileId || '', mode: options.mode === 'select' ? 'select' : 'manage', 'form.isSelf': isSelf, 'form.label': isSelf ? '我的宿舍' : '' })
    await this.loadSettings()
    if (options.profileId) await this.loadProfile(options.profileId)
    else if (options.migrate === '1') this.loadCachedAddress()
  },
  onBack() { wx.navigateBack() },
  async loadSettings() {
    try { const res = await app.callDB('getExpressServiceConfig', {}); this.setData({ settings: res.data || {} }) } catch (e) { this.setData({ error: e.msg || '服务配置加载失败' }) }
  },
  async loadProfile(profileId) {
    try {
      const res = await app.callDB('getMyExpressDeliveryProfiles', {})
      const profile = (res.data || []).find((item) => item._id === profileId)
      if (!profile) throw { msg: '配送信息不存在' }
      this.setData({ form: { label: profile.label || '', recipientName: profile.recipientName || '', contactPhone: profile.contactPhone || '', deliveryCampus: profile.deliveryCampus || '', dormArea: profile.dormArea || '', dormBuildingId: profile.dormBuildingId || '', roomNumber: profile.roomNumber || '', isSelf: profile.isSelf === true, isDefault: profile.isDefault === true } })
      this.syncAddressIndexes()
    } catch (e) { this.setData({ error: e.msg || '配送信息加载失败' }) }
  },
  loadCachedAddress() {
    const cached = wx.getStorageSync('express_delivery_address') || {}
    const userInfo = app.globalData && app.globalData.userInfo
    this.setData({ form: { ...this.data.form, recipientName: (userInfo && (userInfo.nickName || userInfo.nickname)) || '', contactPhone: cached.phone || '', deliveryCampus: cached.deliveryCampus || '', dormArea: cached.dormArea || '', dormBuildingId: cached.dormBuildingId || '', roomNumber: cached.roomNumber || '', isSelf: true, isDefault: true } })
    this.syncAddressIndexes()
  },
  syncAddressIndexes() {
    const campuses = this.data.settings.deliveryCampuses || []
    const selectedCampusIndex = campuses.findIndex((item) => item.id === this.data.form.deliveryCampus && item.enabled !== false)
    const campus = campuses[selectedCampusIndex]
    const areaOptions = campus ? (campus.dormAreas || []) : []
    const selectedAreaIndex = areaOptions.findIndex((item) => item.id === this.data.form.dormArea && item.enabled !== false)
    const area = areaOptions[selectedAreaIndex]
    const buildingOptions = area ? (area.buildings || []) : []
    const selectedBuildingIndex = buildingOptions.findIndex((item) => item.id === this.data.form.dormBuildingId && item.enabled !== false)
    const building = buildingOptions[selectedBuildingIndex]
    this.setData({ areaOptions, buildingOptions, selectedCampusIndex, selectedCampusName: campus ? campus.name : '', selectedAreaIndex, selectedAreaName: area ? area.name : '', selectedBuildingIndex, selectedBuildingName: building ? building.name : '' })
  },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value, error: '' }) },
  onSelfChange(e) { this.setData({ 'form.isSelf': !!e.detail.value }) },
  onDefaultChange(e) { this.setData({ 'form.isDefault': !!e.detail.value }) },
  onCampusChange(e) { const index = Number(e.detail.value); const campus = (this.data.settings.deliveryCampuses || [])[index]; if (!campus) return; this.setData({ selectedCampusIndex: index, selectedCampusName: campus.name, areaOptions: campus.dormAreas || [], buildingOptions: [], selectedAreaIndex: -1, selectedAreaName: '', selectedBuildingIndex: -1, selectedBuildingName: '', 'form.deliveryCampus': campus.id, 'form.dormArea': '', 'form.dormBuildingId': '' }) },
  onAreaChange(e) { const index = Number(e.detail.value); const area = this.data.areaOptions[index]; if (!area) return; this.setData({ selectedAreaIndex: index, selectedAreaName: area.name, buildingOptions: area.buildings || [], selectedBuildingIndex: -1, selectedBuildingName: '', 'form.dormArea': area.id, 'form.dormBuildingId': '' }) },
  onBuildingChange(e) { const index = Number(e.detail.value); const building = this.data.buildingOptions[index]; if (!building) return; this.setData({ selectedBuildingIndex: index, selectedBuildingName: building.name, 'form.dormBuildingId': building.id }) },
  async onSave() {
    if (this.data.saving) return
    this.setData({ saving: true, error: '' })
    try {
      const action = this.data.profileId ? 'updateExpressDeliveryProfile' : 'createExpressDeliveryProfile'
      const payload = { ...this.data.form, campusId: (typeof app.getSelectedCampusId === 'function' && app.getSelectedCampusId()) || 'guit-hangtian' }
      if (this.data.profileId) payload.profileId = this.data.profileId
      await app.callDB(action, payload)
      wx.setStorageSync('express_delivery_address', { deliveryCampus: this.data.form.deliveryCampus, dormArea: this.data.form.dormArea, dormBuildingId: this.data.form.dormBuildingId, roomNumber: this.data.form.roomNumber, phone: this.data.form.contactPhone })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } catch (e) { this.setData({ error: e.msg || '保存失败' }) } finally { this.setData({ saving: false }) }
  },
  onArchive() {
    wx.showModal({ title: '归档配送信息', content: '归档后不会影响历史订单，确定继续吗？', success: async (result) => {
      if (!result.confirm) return
      try { await app.callDB('archiveExpressDeliveryProfile', { profileId: this.data.profileId }); wx.navigateBack() } catch (e) { this.setData({ error: e.msg || '归档失败' }) }
    } })
  }
})
