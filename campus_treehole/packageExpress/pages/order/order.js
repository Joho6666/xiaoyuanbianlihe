const app = getApp()

const requestId = () => `express_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

Page({
  data: {
    settings: { acceptingOrders: false, configured: false, serviceStatus: 'LOADING', pickupPoints: [], deliveryCampuses: [] },
    selectedPointIndex: -1, selectedPointName: '', selectedCampusIndex: -1, selectedCampusName: '',
    selectedAreaIndex: -1, selectedAreaName: '', selectedBuildingIndex: -1, selectedBuildingName: '',
    areaOptions: [], buildingOptions: [],
    quote: null, clientRequestId: requestId(), loadError: false,
    form: { packageCount: 1, pickupCode: '', dormBuildingId: '', dormArea: '', deliveryCampus: '', roomNumber: '', phone: '', note: '' },
    submitting: false, quoting: false
  },
  onLoad() { this.loadSettings() },
  async loadSettings() {
    try {
      const res = await app.callDB('getExpressServiceConfig', {}); const settings = res.data || {}; const saved = wx.getStorageSync('express_delivery_address') || {}
      const campuses = settings.deliveryCampuses || []; const campusIndex = campuses.findIndex((item) => item.id === saved.deliveryCampus && item.enabled !== false); const campus = campusIndex >= 0 ? campuses[campusIndex] : null
      const areaIndex = campus ? (campus.dormAreas || []).findIndex((item) => item.id === saved.dormArea && item.enabled !== false) : -1; const area = areaIndex >= 0 ? campus.dormAreas[areaIndex] : null
      const buildingIndex = area ? (area.buildings || []).findIndex((item) => item.id === saved.dormBuildingId && item.enabled !== false) : -1; const building = buildingIndex >= 0 ? area.buildings[buildingIndex] : null
      const pointIndex = (settings.pickupPoints || []).findIndex((item) => item.id === saved.pickupPointId)
      this.setData({ settings, loadError: false, areaOptions: campus ? (campus.dormAreas || []) : [], buildingOptions: area ? (area.buildings || []) : [], selectedPointIndex: pointIndex, selectedPointName: pointIndex >= 0 ? settings.pickupPoints[pointIndex].name : '', selectedCampusIndex: campusIndex, selectedCampusName: campus ? campus.name : '', selectedAreaIndex: areaIndex, selectedAreaName: area ? area.name : '', selectedBuildingIndex: buildingIndex, selectedBuildingName: building ? building.name : '', 'form.deliveryCampus': campus ? campus.id : '', 'form.dormArea': area ? area.id : '', 'form.dormBuildingId': building ? building.id : '', 'form.dormBuilding': building ? building.name : '', 'form.roomNumber': saved.roomNumber || '', 'form.phone': saved.phone || '', 'form.note': '' })
    } catch (e) { this.setData({ loadError: true, settings: { acceptingOrders: false, configured: false, serviceStatus: 'ERROR', pickupPoints: [], deliveryCampuses: [] } }) }
  },
  onRetry() { if (!this.data.loadError) return; this.loadSettings() },
  onBack() { wx.navigateBack() },
  onPointChange(e) { const index = Number(e.detail.value); const point = (this.data.settings.pickupPoints || [])[index]; if (point) this.setData({ selectedPointIndex: index, selectedPointName: point.name }, () => this.refreshQuote()) },
  onCampusChange(e) { const index = Number(e.detail.value); const campus = (this.data.settings.deliveryCampuses || [])[index]; if (!campus) return; this.setData({ selectedCampusIndex: index, selectedCampusName: campus.name, areaOptions: campus.dormAreas || [], buildingOptions: [], selectedAreaIndex: -1, selectedAreaName: '', selectedBuildingIndex: -1, selectedBuildingName: '', 'form.deliveryCampus': campus.id, 'form.dormArea': '', 'form.dormBuildingId': '', 'form.dormBuilding': '' }) },
  onAreaChange(e) { const index = Number(e.detail.value); const area = this.data.areaOptions[index]; if (!area) return; this.setData({ selectedAreaIndex: index, selectedAreaName: area.name, buildingOptions: area.buildings || [], selectedBuildingIndex: -1, selectedBuildingName: '', 'form.dormArea': area.id, 'form.dormBuildingId': '', 'form.dormBuilding': '' }) },
  onBuildingChange(e) { const index = Number(e.detail.value); const building = this.data.buildingOptions[index]; if (!building) return; this.setData({ selectedBuildingIndex: index, selectedBuildingName: building.name, 'form.dormBuildingId': building.id, 'form.dormBuilding': building.name }) },
  onInput(e) { const key = e.currentTarget.dataset.key; this.setData({ [`form.${key}`]: e.detail.value }, () => { if (key === 'packageCount') this.refreshQuote() }) },
  adjustCount(e) { const delta = Number(e.currentTarget.dataset.delta); const count = Math.min(20, Math.max(1, Number(this.data.form.packageCount || 1) + delta)); this.setData({ 'form.packageCount': count }, () => this.refreshQuote()) },
  async refreshQuote() { if (this.data.selectedPointIndex < 0 || this.data.quoting) return; this.setData({ quoting: true }); try { const res = await app.callDB('getExpressQuote', { pickupPointId: this.data.settings.pickupPoints[this.data.selectedPointIndex].id, packageCount: Number(this.data.form.packageCount) }); this.setData({ quote: res.data }) } catch (e) { this.setData({ quote: null }) } this.setData({ quoting: false }) },
  async onSubmit() {
    if (!app.requestComplianceForAction() || this.data.submitting) return; this.setData({ submitting: true })
    try { const point = this.data.settings.pickupPoints[this.data.selectedPointIndex]; const res = await app.callDB('createExpressOrder', { ...this.data.form, packageCount: Number(this.data.form.packageCount), pickupPointId: point && point.id, clientRequestId: this.data.clientRequestId }); wx.setStorageSync('express_delivery_address', { deliveryCampus: this.data.form.deliveryCampus, dormArea: this.data.form.dormArea, dormBuildingId: this.data.form.dormBuildingId, roomNumber: this.data.form.roomNumber, phone: this.data.form.phone, pickupPointId: point && point.id }); wx.redirectTo({ url: `/packageExpress/pages/detail/detail?orderId=${encodeURIComponent(res.data._id)}` }) } catch (e) { wx.showToast({ title: e.msg || '订单提交失败', icon: 'none' }) }
    this.setData({ submitting: false })
  }
})
