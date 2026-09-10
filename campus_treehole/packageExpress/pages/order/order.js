const app = getApp()

const requestId = () => `express_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
const emptyPickupItem = (index = 1) => ({ id: `pickup_item_${Date.now()}_${index}`, pickupCode: '', packageCount: 1, focus: index === 1 })
const emptyPickupGroup = () => ({ pickupPointId: '', pickupPointName: '', pointIndex: -1, items: [emptyPickupItem()] })

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
    pickupGroups: [emptyPickupGroup()],
    profiles: [], visibleProfiles: [], profileFilter: 'self', selectedProfile: null, showProfileSheet: false, inlineDelivery: true,
    deliveryMode: 'self', deliveryForm: { label: '我的宿舍', recipientName: '', contactPhone: '', deliveryCampus: '', deliveryCampusName: '', dormArea: '', dormAreaName: '', dormBuildingId: '', dormBuildingName: '', roomNumber: '' },
    areaOptions: [], buildingOptions: [], selectedCampusIndex: -1, selectedAreaIndex: -1, selectedBuildingIndex: -1,
    inlineErrors: {}, saveDeliveryProfile: false,
    quote: null, clientRequestId: requestId(), loadError: false, loadErrorMsg: '',
    form: { note: '' }, submitting: false, quoting: false
  },
  onLoad() { this.loadSettings() },
  onUnload() { if (this.quoteTimer) clearTimeout(this.quoteTimer) },
  async loadSettings() {
    try {
      const selectedCampus = (typeof app.getSelectedCampusId === 'function' && app.getSelectedCampusId()) || 'guit-hangtian'
      const res = await app.callDB('getExpressServiceConfig', { campusId: selectedCampus })
      const settings = (res && res.data) || {}
      const cached = wx.getStorageSync('express_delivery_address') || {}
      const points = settings.pickupPoints || []
      const savedPoint = points.find((item) => item.id === cached.pickupPointId) || points.find((item) => item.enabled !== false)
      this.setData({ settings, loadError: false, loadErrorMsg: '', pickupGroups: [{ pickupPointId: savedPoint ? savedPoint.id : '', pickupPointName: savedPoint ? savedPoint.name : '', pointIndex: savedPoint ? points.findIndex((item) => item.id === savedPoint.id) : -1, items: [emptyPickupItem()] }] })
      await this.loadProfiles(cached)
      this.scheduleQuote()
    } catch (e) {
      console.error('[loadSettings] 加载配置失败:', e)
      const errorMsg = (e && (e.msg || e.errMsg || e.message)) || '请检查网络后重试，暂未创建订单'
      this.setData({ loadError: true, loadErrorMsg: errorMsg, settings: { acceptingOrders: false, configured: false, serviceStatus: 'ERROR', pickupPoints: [], deliveryCampuses: [] } })
    }
  },
  async loadProfiles(cached = {}) {
    try {
      const res = await app.callDB('getMyExpressDeliveryProfiles', {})
      const profiles = (res.data || []).map(decorateProfile)
      const selected = profiles.find((item) => item.isDefault) || profiles[0] || null
      const profileFilter = selected && selected.isSelf ? 'self' : 'other'
      this.setData({ profiles, visibleProfiles: this.filterProfiles(profiles, profileFilter), profileFilter, selectedProfile: selected, inlineDelivery: !selected, showProfileSheet: false, showCacheMigration: false })
      if (selected) this.setData({ 'deliveryForm.deliveryCampus': selected.deliveryCampus, 'deliveryForm.deliveryCampusName': selected.deliveryCampusName, 'deliveryForm.dormArea': selected.dormArea, 'deliveryForm.dormAreaName': selected.dormAreaName, 'deliveryForm.dormBuildingId': selected.dormBuildingId, 'deliveryForm.dormBuildingName': selected.dormBuildingName, 'deliveryForm.roomNumber': selected.roomNumber, 'deliveryForm.recipientName': selected.recipientName, 'deliveryForm.contactPhone': selected.contactPhone, deliveryMode: selected.isSelf ? 'self' : 'other' })
      else if (cached.deliveryCampus) this.prefillCachedDelivery(cached)
    } catch (e) {
      console.warn('[loadProfiles] 配送信息暂不可用:', e)
      if (cached.deliveryCampus) this.prefillCachedDelivery(cached)
    }
  },
  prefillCachedDelivery(cached) {
    const userInfo = app.globalData && app.globalData.userInfo
    this.setData({ inlineDelivery: true, deliveryMode: 'self', 'deliveryForm.recipientName': (userInfo && (userInfo.nickName || userInfo.nickname)) || '', 'deliveryForm.contactPhone': cached.phone || '', 'deliveryForm.deliveryCampus': cached.deliveryCampus || '', 'deliveryForm.dormArea': cached.dormArea || '', 'deliveryForm.dormBuildingId': cached.dormBuildingId || '', 'deliveryForm.roomNumber': cached.roomNumber || '', 'deliveryForm.label': '我的宿舍' })
    this.syncDeliveryIndexes()
  },
  syncDeliveryIndexes() {
    const campuses = this.data.settings.deliveryCampuses || []
    const selectedCampusIndex = campuses.findIndex((item) => item.id === this.data.deliveryForm.deliveryCampus && item.enabled !== false)
    const campus = campuses[selectedCampusIndex]
    const areaOptions = campus ? (campus.dormAreas || []) : []
    const selectedAreaIndex = areaOptions.findIndex((item) => item.id === this.data.deliveryForm.dormArea && item.enabled !== false)
    const area = areaOptions[selectedAreaIndex]
    const buildingOptions = area ? (area.buildings || []) : []
    const selectedBuildingIndex = buildingOptions.findIndex((item) => item.id === this.data.deliveryForm.dormBuildingId && item.enabled !== false)
    this.setData({ areaOptions, buildingOptions, selectedCampusIndex, selectedCampusName: campus ? campus.name : '', selectedAreaIndex, selectedAreaName: area ? area.name : '', selectedBuildingIndex, selectedBuildingName: buildingOptions[selectedBuildingIndex] ? buildingOptions[selectedBuildingIndex].name : '', 'deliveryForm.deliveryCampusName': campus ? campus.name : '', 'deliveryForm.dormAreaName': area ? area.name : '', 'deliveryForm.dormBuildingName': buildingOptions[selectedBuildingIndex] ? buildingOptions[selectedBuildingIndex].name : '' })
  },
  onRetry() { if (!this.data.loadError) return; this.loadSettings() },
  onBack() { wx.navigateBack() },
  onGroupPointChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex)
    const point = (this.data.settings.pickupPoints || [])[Number(e.detail.value)]
    if (!point) return
    const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.slice() }))
    const existingIndex = groups.findIndex((group, index) => index !== groupIndex && group.pickupPointId === point.id)
    if (existingIndex >= 0) {
      groups[existingIndex].items = groups[existingIndex].items.concat(groups[groupIndex].items)
      groups.splice(groupIndex, 1)
    } else {
      groups[groupIndex].pickupPointId = point.id
      groups[groupIndex].pickupPointName = point.name
      groups[groupIndex].pointIndex = (this.data.settings.pickupPoints || []).findIndex((item) => item.id === point.id)
    }
    this.setData({ pickupGroups: groups }, () => this.scheduleQuote())
  },
  onPickupInput(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex); const itemIndex = Number(e.currentTarget.dataset.itemIndex)
    const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.slice() }))
    groups[groupIndex].items[itemIndex] = { ...groups[groupIndex].items[itemIndex], pickupCode: e.detail.value }
    this.setData({ pickupGroups: groups, 'inlineErrors.pickup': '' }, () => this.scheduleQuote())
  },
  onItemCountChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex); const itemIndex = Number(e.currentTarget.dataset.itemIndex); const delta = Number(e.currentTarget.dataset.delta)
    const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.slice() })); const item = groups[groupIndex].items[itemIndex]
    item.packageCount = Math.min(20, Math.max(1, Number(item.packageCount || 1) + delta))
    this.setData({ pickupGroups: groups }, () => this.scheduleQuote())
  },
  addPickupCode(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex); const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, focus: false })) }))
    groups[groupIndex].items.push(emptyPickupItem(groups[groupIndex].items.length + 1))
    this.setData({ pickupGroups: groups }, () => { this.scheduleQuote(); setTimeout(() => this.clearPickupFocus(), 600) })
  },
  clearPickupFocus() { this.setData({ pickupGroups: this.data.pickupGroups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, focus: false })) })) }) },
  removePickupItem(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex); const itemIndex = Number(e.currentTarget.dataset.itemIndex); const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.slice() }))
    if (groups[groupIndex].items.length > 1) groups[groupIndex].items.splice(itemIndex, 1)
    else if (groups.length > 1) groups.splice(groupIndex, 1)
    else groups[0].items[0] = emptyPickupItem()
    this.setData({ pickupGroups: groups }, () => this.scheduleQuote())
  },
  addPickupPoint() {
    const points = (this.data.settings.pickupPoints || []).filter((point) => point.enabled !== false)
    if (!points.length) return wx.showToast({ title: '暂无可用快递点', icon: 'none' })
    wx.showActionSheet({ itemList: points.map((point) => point.name), success: (result) => {
      const point = points[result.tapIndex]
      const existing = this.data.pickupGroups.findIndex((group) => group.pickupPointId === point.id)
      if (existing >= 0) return this.addPickupCode({ currentTarget: { dataset: { groupIndex: existing } } })
      const groups = this.data.pickupGroups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, focus: false })) }))
      groups.push({ pickupPointId: point.id, pickupPointName: point.name, pointIndex: (this.data.settings.pickupPoints || []).findIndex((item) => item.id === point.id), items: [emptyPickupItem()] })
      this.setData({ pickupGroups: groups }, () => { this.scheduleQuote(); setTimeout(() => this.clearPickupFocus(), 600) })
    } })
  },
  onChooseProfile() { this.setData({ showProfileSheet: true }) },
  closeProfileSheet() { this.setData({ showProfileSheet: false }) },
  filterProfiles(profiles = this.data.profiles, filter = this.data.profileFilter) { return profiles.filter((item) => filter === 'self' ? item.isSelf === true : item.isSelf !== true) },
  onProfileFilterChange(e) { const profileFilter = e.currentTarget.dataset.mode === 'other' ? 'other' : 'self'; this.setData({ profileFilter, visibleProfiles: this.filterProfiles(this.data.profiles, profileFilter) }) },
  onSelectProfile(e) {
    const profile = this.data.profiles.find((item) => item._id === e.currentTarget.dataset.id)
    if (!profile) return
    this.setData({ selectedProfile: profile, inlineDelivery: false, showProfileSheet: false, deliveryMode: profile.isSelf ? 'self' : 'other', inlineErrors: {} }, () => this.scheduleQuote())
  },
  onNewInlineProfile() { const deliveryMode = this.data.profileFilter === 'self' ? 'self' : 'other'; this.setData({ showProfileSheet: false, selectedProfile: null, inlineDelivery: true, deliveryMode, 'deliveryForm.label': deliveryMode === 'self' ? '我的宿舍' : '', 'deliveryForm.recipientName': '', 'deliveryForm.contactPhone': '', 'deliveryForm.deliveryCampus': '', 'deliveryForm.deliveryCampusName': '', 'deliveryForm.dormArea': '', 'deliveryForm.dormAreaName': '', 'deliveryForm.dormBuildingId': '', 'deliveryForm.dormBuildingName': '', 'deliveryForm.roomNumber': '', saveDeliveryProfile: deliveryMode === 'self', inlineErrors: {} }) },
  onDeliveryModeChange(e) {
    const deliveryMode = e.currentTarget.dataset.mode === 'other' ? 'other' : 'self'
    this.setData({ deliveryMode, 'deliveryForm.isSelf': deliveryMode === 'self', 'deliveryForm.label': deliveryMode === 'self' ? '我的宿舍' : '', saveDeliveryProfile: deliveryMode === 'self', inlineErrors: {} })
  },
  onDeliveryInput(e) { this.setData({ [`deliveryForm.${e.currentTarget.dataset.key}`]: e.detail.value, [`inlineErrors.${e.currentTarget.dataset.key}`]: '' }) },
  onSaveDeliveryChange(e) { this.setData({ saveDeliveryProfile: !!e.detail.value }) },
  onDeliveryCampusChange(e) { const index = Number(e.detail.value); const campus = (this.data.settings.deliveryCampuses || [])[index]; if (!campus) return; this.setData({ selectedCampusIndex: index, selectedCampusName: campus.name, areaOptions: campus.dormAreas || [], buildingOptions: [], selectedAreaIndex: -1, selectedBuildingIndex: -1, 'deliveryForm.deliveryCampus': campus.id, 'deliveryForm.deliveryCampusName': campus.name, 'deliveryForm.dormArea': '', 'deliveryForm.dormAreaName': '', 'deliveryForm.dormBuildingId': '', 'deliveryForm.dormBuildingName': '' }) },
  onDeliveryAreaChange(e) { const index = Number(e.detail.value); const area = this.data.areaOptions[index]; if (!area) return; this.setData({ selectedAreaIndex: index, selectedAreaName: area.name, buildingOptions: area.buildings || [], selectedBuildingIndex: -1, 'deliveryForm.dormArea': area.id, 'deliveryForm.dormAreaName': area.name, 'deliveryForm.dormBuildingId': '', 'deliveryForm.dormBuildingName': '' }) },
  onDeliveryBuildingChange(e) { const index = Number(e.detail.value); const building = this.data.buildingOptions[index]; if (!building) return; this.setData({ selectedBuildingIndex: index, selectedBuildingName: building.name, 'deliveryForm.dormBuildingId': building.id, 'deliveryForm.dormBuildingName': building.name }) },
  scheduleQuote() { if (this.quoteTimer) clearTimeout(this.quoteTimer); this.quoteTimer = setTimeout(() => this.refreshQuote(), 400) },
  flattenPickupItems() { return this.data.pickupGroups.flatMap((group) => group.items.map((item) => ({ pickupPointId: group.pickupPointId, pickupCode: item.pickupCode, packageCount: Number(item.packageCount) }))) },
  async refreshQuote() {
    if (this.data.quoting) return
    const pickupItems = this.flattenPickupItems().filter((item) => item.pickupPointId && item.pickupCode)
    if (!pickupItems.length) return this.setData({ quote: null })
    this.setData({ quoting: true })
    try { const res = await app.callDB('getExpressQuote', { campusId: (this.data.selectedProfile && this.data.selectedProfile.campusId) || (typeof app.getSelectedCampusId === 'function' && app.getSelectedCampusId()), deliveryCampus: (this.data.selectedProfile && this.data.selectedProfile.deliveryCampus) || this.data.deliveryForm.deliveryCampus, pickupItems }); this.setData({ quote: res.data }) } catch (e) { this.setData({ quote: null }) } finally { this.setData({ quoting: false }) }
  },
  validateInlineDelivery() {
    if (!this.data.inlineDelivery) return true
    const form = this.data.deliveryForm; const errors = {}
    if (!String(form.recipientName || '').trim()) errors.recipientName = '请填写收件人姓名'
    if (!/^1\d{10}$/.test(String(form.contactPhone || '').trim())) errors.contactPhone = '请填写有效手机号'
    if (!form.deliveryCampus) errors.deliveryCampus = '请选择配送校区'
    if (!form.dormArea) errors.dormArea = '请选择宿舍园区'
    if (!form.dormBuildingId) errors.dormBuildingId = '请选择楼栋'
    if (!String(form.roomNumber || '').trim()) errors.roomNumber = '请填写房间号'
    this.setData({ inlineErrors: errors })
    if (Object.keys(errors).length) { wx.pageScrollTo({ selector: '#delivery-error', duration: 200 }); return false }
    return true
  },
  async onSubmit() {
    if (!app.requestComplianceForAction() || this.data.submitting) return
    const pickupItems = this.flattenPickupItems()
    if (!pickupItems.some((item) => item.pickupPointId && item.pickupCode)) return wx.showToast({ title: '请至少填写一个取件码', icon: 'none' })
    if (!this.validateInlineDelivery()) return
    const point = this.data.pickupGroups.find((group) => group.pickupPointId)
    if (!point) return wx.showToast({ title: '请选择快递点', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const payload = { campusId: (this.data.selectedProfile && this.data.selectedProfile.campusId) || (typeof app.getSelectedCampusId === 'function' && app.getSelectedCampusId()), pickupItems, note: this.data.form.note, clientRequestId: this.data.clientRequestId }
      if (this.data.selectedProfile) payload.deliveryProfileId = this.data.selectedProfile._id
      else { payload.deliveryData = { ...this.data.deliveryForm, isSelf: this.data.deliveryMode === 'self' }; payload.saveDeliveryProfile = this.data.deliveryMode === 'self' || this.data.saveDeliveryProfile }
      const res = await app.callDB('createExpressOrder', payload)
      const address = this.data.selectedProfile || this.data.deliveryForm
      wx.setStorageSync('express_delivery_address', { deliveryCampus: address.deliveryCampus, dormArea: address.dormArea, dormBuildingId: address.dormBuildingId, roomNumber: address.roomNumber, phone: address.contactPhone, pickupPointId: point.pickupPointId })
      wx.redirectTo({ url: `/packageExpress/pages/detail/detail?orderId=${encodeURIComponent(res.data._id)}` })
    } catch (e) { wx.showToast({ title: e.msg || '订单提交失败', icon: 'none' }) } finally { this.setData({ submitting: false }) }
  },
  stopPropagation() {}
})
