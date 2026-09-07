// pages/discover/discover.js - 发现全域频道主页
const app = getApp()
const { CAMPUSES } = require('../../utils/campuses.js')
const i18n = require('../../utils/i18n.js')

Page({
  data: {
    campusName: '桂林航天工业学院',
    campusId: 'guit-hangtian',
    showModal: false,
    modalData: {},
    currentLang: 'zh-CN'
  },

  onLoad() {
    this.setData({ currentLang: i18n.getLocale() })
    this.refreshCampusInfo()
  },

  onShow() {
    if (typeof app.ensureComplianceOnTabShow === 'function') {
      if (!app.ensureComplianceOnTabShow({ mode: 'browse' })) return
    }
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) {
      tabBar.setData({ selected: 1 })
      if (typeof app.syncMessageBadge === 'function') {
        app.syncMessageBadge(tabBar)
      }
    }
    this.refreshCampusInfo()
  },

  refreshCampusInfo() {
    const selectedCampusId = wx.getStorageSync('selected_campus_id') || (app.globalData && app.globalData.campusId) || 'guit-hangtian'
    const found = (CAMPUSES || []).find((c) => c.id === selectedCampusId)
    this.setData({
      campusId: selectedCampusId,
      campusName: found ? found.name : '桂林航天工业学院'
    })
  },

  onPullDownRefresh() {
    this.refreshCampusInfo()
    setTimeout(() => {
      wx.stopPullDownRefresh()
      wx.showToast({ title: '已刷新频道推荐', icon: 'none' })
    }, 400)
  },

  // 切换校区提示
  onChangeCampus() {
    wx.showModal({
      title: '校区信息',
      content: `当前选定校区为「${this.data.campusName}」，各频道将优先呈现该校区内的搭子、活动与闲置动态。如需切换请在首页校区栏更换。`,
      showCancel: false,
      confirmColor: '#426089'
    })
  },

  // 1. 进入校园集市 (原有功能，完整保留)
  goToMarket() {
    wx.navigateTo({
      url: '/pages/market/market',
      fail: (err) => {
        console.error('跳转集市失败:', err)
        wx.showToast({ title: '无法打开集市', icon: 'none' })
      }
    })
  },

  // 2. 进入校园活动 (进入活动分包)
  goToEvents() {
    const targetUrl = '/packageEvents/pages/activity/activity'
    wx.navigateTo({
      url: targetUrl,
      fail: (err) => {
        console.error('跳转活动失败:', err)
        wx.showToast({ title: '暂无进行中活动', icon: 'none' })
      }
    })
  },

  // 3. 返回首页树洞
  goToTreehole() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 4. 打开同频找搭子广场
  onOpenTongpin() {
    wx.navigateTo({
      url: '/packageBuddy/pages/buddy-square/buddy-square',
      fail: (err) => {
        console.error('打开搭子广场失败:', err)
        wx.showToast({ title: '无法打开搭子广场', icon: 'none' })
      }
    })
  },

  // 5. 打开友桥 UniBridge 语伴主页
  onOpenUniBridge() {
    wx.navigateTo({
      url: '/packageBridge/pages/bridge-home/bridge-home',
      fail: (err) => {
        console.error('打开友桥失败:', err)
        wx.showToast({ title: '无法打开友桥主页', icon: 'none' })
      }
    })
  },

  toggleTabBar(visible) {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) {
      tabBar.setData({ hidden: !visible })
    }
  },

  // 双语预览语言切换演示
  toggleBilingualLang() {
    const next = this.data.currentLang === 'zh-CN' ? 'en-US' : 'zh-CN'
    i18n.setLocale(next)
    this.setData({ currentLang: next })
  },

  // 校园互助与失物招领通道
  onShowQuickTip(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'help') {
      wx.navigateTo({
        url: '/packageMutual/pages/mutual-list/mutual-list?type=help'
      })
    } else if (type === 'lost') {
      wx.navigateTo({
        url: '/packageMutual/pages/mutual-list/mutual-list?type=lost'
      })
    }
  },

  closeModal() {
    this.setData({ showModal: false })
    this.toggleTabBar(true)
  },

  onHide() {
    if (this.data.showModal) {
      this.closeModal()
    }
  },

  onUnload() {
    this.toggleTabBar(true)
  },

  stopBubble() {
    // 阻止点击弹窗内容冒泡关闭
  }
})
