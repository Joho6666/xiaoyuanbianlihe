// packageBuddy/pages/buddy-create/buddy-create.js - 发起搭子组局
const app = getApp()
const { BUDDY_CATEGORIES } = require('../../../utils/domain/buddy')

Page({
  data: {
    categories: BUDDY_CATEGORIES,
    category: 'sports',
    title: '',
    description: '',
    startDate: '',
    startTime: '',
    minDate: '',
    location: '',
    minPeople: 2,
    maxPeople: 4,
    genderRequirement: 'any',
    submitting: false
  },

  onLoad() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String((now.getHours() + 1) % 24).padStart(2, '0')
    const min = '00'

    const todayStr = `${y}-${m}-${d}`
    this.setData({
      startDate: todayStr,
      startTime: `${h}:${min}`,
      minDate: todayStr
    })
  },

  onSelectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.id })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value })
  },

  onLocationInput(e) {
    this.setData({ location: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ startDate: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ startTime: e.detail.value })
  },

  onMaxPeopleChange(e) {
    const val = Number(e.detail.value)
    this.setData({ maxPeople: val })
  },

  onGenderChange(e) {
    this.setData({ genderRequirement: e.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const title = this.data.title.trim()
    if (!title || title.length < 3) {
      wx.showToast({ title: '标题至少 3 个字', icon: 'none' })
      return
    }

    const startAtStr = `${this.data.startDate} ${this.data.startTime}:00`
    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中...' })

    try {
      const res = await app.callDB('addBuddyPost', {
        title,
        description: this.data.description.trim(),
        category: this.data.category,
        startAt: startAtStr,
        location: this.data.location.trim(),
        minPeople: this.data.minPeople,
        maxPeople: this.data.maxPeople,
        genderRequirement: this.data.genderRequirement
      })

      wx.hideLoading()
      this.setData({ submitting: false })

      if (res && res.code === 0 && res.data && res.data.id) {
        wx.showToast({ title: '发布成功！', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/packageBuddy/pages/buddy-detail/buddy-detail?id=${res.data.id}`
          })
        }, 800)
      } else {
        wx.showToast({ title: (res && res.msg) || '发布失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  }
})
