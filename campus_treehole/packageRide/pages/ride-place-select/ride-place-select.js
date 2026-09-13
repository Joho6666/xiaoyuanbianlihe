// packageRide/pages/ride-place-select/ride-place-select.js - 拼车地点选择
// 服务端 searchRidePlaces：配置 TENCENT_LBS_KEY 走腾讯 POI，否则预置目录
const app = getApp()
const { nearestRidePlaces } = require('../../../utils/domain/ride-places')

Page({
  data: {
    field: 'destination',           // origin | destination
    keyword: '',
    categories: [],
    currentCategory: 'all',
    places: [],
    loading: false,
    locating: false,
    locError: ''
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

  // §13: 400ms debounce 防抖搜索
  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => {
      this.search()
    }, 400)
  },

  onSearchConfirm() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
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

  // §12: 主动定位 - 获取当前位置并计算离我最近的常用上车点
  onUseCurrentLocation() {
    this.setData({ locating: true, locError: '' })
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const nearest = nearestRidePlaces(res.latitude, res.longitude, 6)
        if (nearest && nearest.length) {
          this.setData({
            places: nearest,
            currentCategory: 'nearby',
            locating: false
          })
          wx.showToast({ title: '已找到附近上车点', icon: 'none' })
        } else {
          this.setData({ locating: false })
          wx.showToast({ title: '附近暂无推荐点', icon: 'none' })
        }
      },
      fail: (err) => {
        console.warn('getLocation fail:', err)
        this.setData({ locating: false, locError: '未获取到定位权限' })
        wx.showToast({ title: '获取位置失败，可手动搜索', icon: 'none' })
      }
    })
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
