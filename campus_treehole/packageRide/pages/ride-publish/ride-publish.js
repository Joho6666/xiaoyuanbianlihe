// packageRide/pages/ride-publish/ride-publish.js - 发布拼车行程
const app = getApp()
const { RIDE_FLEXIBLE_OPTIONS, RIDE_MIN_PEOPLE, RIDE_MAX_PEOPLE, RIDE_NOTE_MAX_LENGTH } = require('../../../utils/domain/ride')
const { getRidePlaceById } = require('../../../utils/domain/ride-places')

Page({
  data: {
    origin: null,
    destination: null,
    departureMode: 'NOW',           // NOW | SCHEDULED
    scheduleDate: '',
    scheduleTime: '',
    flexibleOptions: RIDE_FLEXIBLE_OPTIONS,
    flexibleMinutes: 30,
    maxPeople: 3,
    minPeople: RIDE_MIN_PEOPLE,
    maxPeopleLimit: RIDE_MAX_PEOPLE,
    note: '',
    noteMaxLength: RIDE_NOTE_MAX_LENGTH
  },

  onLoad(options = {}) {
    // P1-6: 默认起点设为真实地点对象（桂航南校门），不再是空指针假 placeholder
    const defaultOrigin = getRidePlaceById('guat-south-gate')
    if (defaultOrigin) {
      this.setData({ origin: defaultOrigin })
    }
    if (options.destination) {
      const place = getRidePlaceById(decodeURIComponent(options.destination))
      if (place) this.setData({ destination: place })
    }
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ scheduleDate: today, minDate: today })
  },

  openPlacePicker(e) {
    const field = e.currentTarget.dataset.field
    wx.navigateTo({
      url: `/packageRide/pages/ride-place-select/ride-place-select?field=${field}`,
      events: {
        selectPlace: payload => {
          if (!payload || !payload.place) return
          this.setData({ [payload.field || field]: payload.place })
        }
      }
    })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.departureMode) return
    this.setData({ departureMode: mode })
  },

  onDateChange(e) {
    this.setData({ scheduleDate: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ scheduleTime: e.detail.value })
  },

  pickFlexible(e) {
    this.setData({ flexibleMinutes: Number(e.currentTarget.dataset.value) })
  },

  incPeople() {
    if (this.data.maxPeople < this.data.maxPeopleLimit) {
      this.setData({ maxPeople: this.data.maxPeople + 1 })
    }
  },

  decPeople() {
    if (this.data.maxPeople > this.data.minPeople) {
      this.setData({ maxPeople: this.data.maxPeople - 1 })
    }
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  buildScheduledTime() {
    // 校园位于桂林（UTC+8），拼接带时区的 ISO 时间
    const raw = `${this.data.scheduleDate}T${this.data.scheduleTime || '08:00'}:00+08:00`
    const ms = new Date(raw).getTime()
    if (!Number.isFinite(ms)) return null
    return new Date(ms).toISOString()
  },

  validate() {
    const { origin, destination, departureMode, scheduleDate, scheduleTime } = this.data
    if (!origin) return '请选择出发地'
    if (!destination) return '请选择目的地'
    if (origin.poiId && origin.poiId === destination.poiId) return '出发地和目的地不能相同'
    if (departureMode === 'SCHEDULED') {
      if (!scheduleDate || !scheduleTime) return '请选择预约出发日期和时间'
    }
    return ''
  },

  async onSubmit() {
    const error = this.validate()
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return
    }
    if (!app.requestComplianceForAction()) return

    const { origin, destination, departureMode, flexibleMinutes, maxPeople, note } = this.data
    const payload = {
      departureMode,
      origin: {
        poiId: origin.poiId,
        name: origin.name,
        address: origin.address,
        latitude: origin.latitude,
        longitude: origin.longitude
      },
      destination: {
        poiId: destination.poiId,
        name: destination.name,
        address: destination.address,
        latitude: destination.latitude,
        longitude: destination.longitude
      },
      flexibleMinutes,
      maxPeople,
      note: note.trim(),
      campusId: app.getSelectedCampusId()
    }
    if (departureMode === 'SCHEDULED') {
      payload.departureTime = this.buildScheduledTime()
    }

    wx.showLoading({ title: '发布中' })
    try {
      const result = await app.callDB('publishRide', payload)
      wx.hideLoading()
      app.globalData.rideNeedsRefresh = true
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: `/packageRide/pages/ride-matches/ride-matches?rideId=${result.data.rideId}` })
      }, 600)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.msg) || '发布失败，请重试', icon: 'none' })
    }
  }
})
