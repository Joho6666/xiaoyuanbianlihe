// packageRide/pages/ride-place-select/ride-place-select.js - 拼车地点选择
// 服务端 searchRidePlaces：配置 TENCENT_LBS_KEY 走腾讯 POI，否则预置目录
const app = getApp()

Page({
  data: {
    field: 'destination',           // origin | destination
    keyword: '',
    categories: [],
    currentCategory: 'all',
    places: [],
    loading: false
  },

  onLoad(options = {}) {
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    this._opener = eventChannel || null
    this.setData({
      field: options.field === 'origin' ? 'origin' : 'destination'
    })
    this.loadCatalog()
    if (options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) })
      this.search()
    }
  },

  async loadCatalog() {
    try {
      const result = await app.callDB('getRidePlaces', {})
      const data = (result && result.data) || {}
      this.setData({
        categories: [{ id: 'all', name: '全部' }].concat((data.categories || [])
          .filter(cat => cat.id !== 'all' && cat.id !== 'nearby')),
        places: data.places || []
      })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '地点加载失败', icon: 'none' })
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.search()
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.id
    if (category === this.data.currentCategory) return
    this.setData({ currentCategory: category })
    this.search(category)
  },

  async search(category) {
    const kw = this.data.keyword.trim()
    const cat = category || this.data.currentCategory
    if (!kw && (cat === 'all')) {
      this.loadCatalog()
      return
    }
    this.setData({ loading: true })
    try {
      const result = await app.callDB('searchRidePlaces', { keyword: kw, category: kw ? 'all' : cat })
      this.setData({ places: ((result && result.data && result.data.places) || []) })
    } catch (err) {
      wx.showToast({ title: (err && err.msg) || '搜索失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onPick(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    if (this._opener && this._opener.emit) {
      this._opener.emit('selectPlace', { field: this.data.field, place })
    }
    wx.navigateBack()
  }
})
