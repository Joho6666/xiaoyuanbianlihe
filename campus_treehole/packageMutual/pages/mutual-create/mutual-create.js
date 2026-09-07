// packageMutual/pages/mutual-create/mutual-create.js - 发布校园互助或失物寻物
const app = getApp()
const { HELP_CATEGORIES, LOST_CATEGORIES } = require('../../../utils/domain/mutual')

Page({
  data: {
    type: 'help', // 'help', 'lost', 'found'
    helpCategories: HELP_CATEGORIES,
    lostCategories: LOST_CATEGORIES,
    category: 'errand',
    title: '',
    content: '',
    reward: '',
    location: '',
    images: [],
    submitting: false
  },

  onLoad(options) {
    if (options && options.type) {
      const t = options.type
      this.setData({
        type: t,
        category: t === 'help' ? 'errand' : 'card'
      })
    }
  },

  onTypeChange(e) {
    const val = e.detail.value
    this.setData({
      type: val,
      category: val === 'help' ? 'errand' : 'card'
    })
  },

  onSelectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.id })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onRewardInput(e) {
    this.setData({ reward: e.detail.value })
  },

  onLocationInput(e) {
    this.setData({ location: e.detail.value })
  },

  async onChooseImages() {
    const remain = 4 - this.data.images.length
    if (remain <= 0) return

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        wx.showLoading({ title: '上传图片中...' })
        const uploaded = []

        for (const f of files) {
          try {
            const ext = f.tempFilePath.split('.').pop() || 'jpg'
            const cloudPath = `mutual/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
            const upRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: f.tempFilePath
            })
            if (upRes.fileID) uploaded.push(upRes.fileID)
          } catch (e) {
            console.error('上传图片失败:', e)
          }
        }

        wx.hideLoading()
        this.setData({
          images: [...this.data.images, ...uploaded]
        })
      }
    })
  },

  onDeleteImage(e) {
    const idx = e.currentTarget.dataset.index
    const list = [...this.data.images]
    list.splice(idx, 1)
    this.setData({ images: list })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const title = this.data.title.trim()
    const content = this.data.content.trim()

    if (!title || title.length < 2) {
      wx.showToast({ title: '标题至少 2 个字', icon: 'none' })
      return
    }
    if (!content || content.length < 5) {
      wx.showToast({ title: '详细说明至少 5 个字', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中...' })

    try {
      const res = await app.callDB('addMutualPost', {
        type: this.data.type,
        category: this.data.category,
        title,
        content,
        reward: this.data.reward.trim(),
        location: this.data.location.trim(),
        images: this.data.images
      })

      wx.hideLoading()
      this.setData({ submitting: false })

      if (res && res.code === 0 && res.data && res.data.id) {
        wx.showToast({ title: '发布成功！', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/packageMutual/pages/mutual-detail/mutual-detail?id=${res.data.id}`
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
