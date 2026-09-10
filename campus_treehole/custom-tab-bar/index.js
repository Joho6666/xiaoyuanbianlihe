Component({
  data: {
    selected: 0,
    hidden: false,
    unreadCount: 0,
    list: [
      { pagePath: "/pages/index/index", text: "首页", icon: "home", iconFill: "home-fill" },
      { pagePath: "/pages/discover/discover", text: "发现", icon: "discover", iconFill: "discover-fill" },
      { pagePath: "/pages/post/post", text: "", icon: "plus", iconFill: "plus" },
      { pagePath: "/pages/message/message", text: "消息", icon: "message", iconFill: "message-fill" },
      { pagePath: "/pages/mine/mine", text: "我", icon: "mine", iconFill: "mine-fill" }
    ]
  },
  methods: {
    switchTab(e) {
      if (this.data.hidden) return
      const idx = e.currentTarget.dataset.index
      if (idx === 2) {
        wx.showActionSheet({
          itemList: ['💬 发布校园动态', '🏸 30秒发起搭子', '🛒 发布二手闲置', '🤝 发起求助/失物招领'],
          success: (res) => {
            if (res.tapIndex === 0) {
              wx.switchTab({ url: '/pages/post/post' })
            } else if (res.tapIndex === 1) {
              wx.navigateTo({ url: '/packageBuddy/pages/buddy-create/buddy-create' })
            } else if (res.tapIndex === 2) {
              wx.navigateTo({ url: '/packageMarket/pages/market-post/market-post' })
            } else if (res.tapIndex === 3) {
              wx.navigateTo({ url: '/packageMutual/pages/mutual-create/mutual-create' })
            }
          }
        })
        return
      }
      if (idx === this.data.selected) return
      const item = this.data.list[idx]
      wx.switchTab({ url: item.pagePath })
    }
  }
})
