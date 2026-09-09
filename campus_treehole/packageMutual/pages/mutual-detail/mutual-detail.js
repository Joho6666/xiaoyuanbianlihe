// packageMutual/pages/mutual-detail/mutual-detail.js - 互助与失物详情
const app = getApp()

Page({
  data: {
    id: '',
    post: null,
    loading: true
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadDetail()
    } else {
      wx.showToast({ title: '缺少条目 ID', icon: 'none' })
    }
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await app.callDB('getMutualPostById', { id: this.data.id })
      if (res && res.code === 0 && res.data) {
        this.setData({
          post: {
            ...res.data,
            timeDisplay: this.formatTime(res.data.createTime)
          },
          loading: false
        })
      } else {
        wx.showToast({ title: (res && res.msg) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载互助详情失败:', err)
      this.setData({ loading: false })
    }
  },

  formatTime(isoStr) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    if (Number.isNaN(d.getTime())) return ''
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}月${day}日 ${h}:${min}`
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url
    wx.previewImage({
      current,
      urls: this.data.post.images || []
    })
  },

  async onMarkResolved() {
    wx.showModal({
      title: '确认完成',
      content: '确认将本条互助/寻物信息标记为已解决吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '更新中...' })
          try {
            const upd = await app.callDB('updateMutualPostStatus', {
              id: this.data.id,
              status: 'resolved'
            })
            wx.hideLoading()
            if (upd && upd.code === 0) {
              wx.showToast({ title: '已标记解决', icon: 'success' })
              this.loadDetail()
            }
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  async onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后信息将无法恢复，确认删除吗？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            const del = await app.callDB('deleteMutualPost', { id: this.data.id })
            wx.hideLoading()
            if (del && del.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              setTimeout(() => wx.navigateBack(), 800)
            }
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  async contactAuthor() {
    if (!this.data.post || !this.data.post.userId) return
    try { await app.callDB('startMutualContact', { postId: this.data.post._id || this.data.post.id }) } catch (err) { wx.showToast({ title: (err && err.message) || '当前条目不可联系', icon: 'none' }); return }
    wx.navigateTo({
      url: `/pages/chat/chat?targetUserId=${encodeURIComponent(this.data.post.userId)}&title=${encodeURIComponent(this.data.post.author.nickName || '发布者')}`
    })
  }
})
