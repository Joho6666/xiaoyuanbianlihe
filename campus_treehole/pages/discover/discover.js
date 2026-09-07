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

  // 4. 打开同频找搭子预告与功能预览
  onOpenTongpin() {
    this.setData({
      showModal: true,
      modalData: {
        title: '同频 · 校园找搭子',
        badgeText: '核心并网中',
        badgeClass: 'tag-upcoming',
        description: 'Tongpin 同频搭子系统正在全量合并入校园便利盒。未来你将无需下载单独 App，即可在此一键组局与找搭子。',
        features: [
          '全场景分类：羽毛球/网球运动、图书馆自习、食堂干饭、周末拼车出游',
          '严格 5 态成局机制：招募中、满员锁定、线下出发、履约结束、互相评价',
          '校园真实信誉体系：防止放鸽子，建立真实可信的同学圈子'
        ],
        isUniBridge: false
      }
    })
  },

  // 5. 打开友桥 UniBridge 预告与功能预览
  onOpenUniBridge() {
    this.setData({
      showModal: true,
      modalData: {
        title: '友桥 UniBridge · 跨文化伙伴',
        badgeText: '中英双语',
        badgeClass: 'tag-bilingual',
        description: 'UniBridge 友桥频道为中国学生与在华留学生提供纯粹、安全、双向的语言交换与文化交流空间。',
        features: [
          '中英文全界面无缝切换（支持留学生英文原生入驻）',
          '按母语与学习目标精准匹配：如“母语英语学中文 ⇄ 母语中文学英语”',
          '定期 English Corner、跨文化工作坊与线下语言咖啡角'
        ],
        isUniBridge: true
      }
    })
  },

  // 双语预览语言切换演示
  toggleBilingualLang() {
    const next = this.data.currentLang === 'zh-CN' ? 'en-US' : 'zh-CN'
    i18n.setLocale(next)
    this.setData({ currentLang: next })
  },

  // 快速提示（互助、失物招领）
  onShowQuickTip(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'help') {
      wx.showToast({ title: '校园互助通道筹备中', icon: 'none' })
    } else if (type === 'lost') {
      wx.showToast({ title: '失物招领通道筹备中', icon: 'none' })
    }
  },

  closeModal() {
    this.setData({ showModal: false })
  },

  stopBubble() {
    // 阻止点击弹窗内容冒泡关闭
  }
})
