// packageBuddy/pages/buddy-detail/buddy-detail.js - 搭子详情与成局互动
const app = getApp()

Page({
  data: {
    id: '',
    post: null,
    loading: true,
    showApplyModal: false,
    applyMessage: ''
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadDetail()
    } else {
      wx.showToast({ title: '缺少组局 ID', icon: 'none' })
    }
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh())
  },

  async loadDetail(callback) {
    this.setData({ loading: true })
    try {
      const res = await app.callDB('getBuddyPostById', { id: this.data.id })
      if (res && res.code === 0 && res.data) {
        this.setData({
          post: {
            ...res.data,
            timeDisplay: this.formatTime(res.data.startAt)
          },
          loading: false
        })
      } else {
        wx.showToast({ title: (res && res.msg) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载搭子详情失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (typeof callback === 'function') callback()
    }
  },

  formatTime(isoStr) {
    if (!isoStr) return '待定'
    const d = new Date(isoStr)
    if (Number.isNaN(d.getTime())) return isoStr
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}月${day}日 ${h}:${min}`
  },

  onOpenApply() {
    this.setData({ showApplyModal: true, applyMessage: '' })
  },

  onCloseApply() {
    this.setData({ showApplyModal: false })
  },

  onApplyInput(e) {
    this.setData({ applyMessage: e.detail.value })
  },

  async onSubmitApply() {
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await app.callDB('applyBuddyPost', {
        postId: this.data.id,
        message: this.data.applyMessage
      })
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '申请已发送', icon: 'success' })
        this.onCloseApply()
        this.loadDetail()
      } else {
        wx.showToast({ title: (res && res.msg) || '申请失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  async onHandleApp(e) {
    const { id, action } = e.currentTarget.dataset
    const actionText = action === 'ACCEPT' ? '通过' : '婉拒'
    wx.showLoading({ title: '处理中...' })
    try {
      const res = await app.callDB('handleBuddyApplication', {
        applicationId: id,
        action
      })
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: `已${actionText}`, icon: 'success' })
        this.loadDetail()
      } else {
        wx.showToast({ title: (res && res.msg) || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '处理失败', icon: 'none' })
    }
  },

  async onUpdateStatus(e) {
    const targetStatus = e.currentTarget.dataset.status
    wx.showLoading({ title: '更新中...' })
    try {
      const res = await app.callDB('updateBuddyPostStatus', {
        postId: this.data.id,
        targetStatus
      })
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '状态已更新', icon: 'success' })
        this.loadDetail()
      } else {
        wx.showToast({ title: (res && res.msg) || '更新失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  contactAuthor() {
    if (!this.data.post) return
    const targetId = this.data.post.authorId || this.data.post._openid
    if (!targetId) return
    const name = (this.data.post.author && this.data.post.author.nickName) || '发起人'
    wx.navigateTo({
      url: `/pages/chat/chat?targetOpenid=${targetId}&targetUserId=${targetId}&title=${encodeURIComponent(name)}`
    })
  },

  contactMember(e) {
    const { id, name } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({
      url: `/pages/chat/chat?targetOpenid=${id}&targetUserId=${id}&title=${encodeURIComponent(name || '搭子成员')}`
    })
  },

  async onCancelApply() {
    const userApp = this.data.post && this.data.post.userApplication
    if (!userApp || !userApp._id) return
    wx.showModal({
      title: '撤销申请',
      content: '确定要撤销加入该搭子组局的申请吗？',
      confirmColor: '#426089',
      success: async (m) => {
        if (m.confirm) {
          wx.showLoading({ title: '撤销中...' })
          try {
            const res = await app.callDB('cancelBuddyApplication', { applicationId: userApp._id })
            wx.hideLoading()
            if (res && res.code === 0) {
              wx.showToast({ title: '已撤销申请', icon: 'success' })
              this.loadDetail()
            } else {
              wx.showToast({ title: (res && res.msg) || '撤销失败', icon: 'none' })
            }
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '网络异常', icon: 'none' })
          }
        }
      }
    })
  }
})
