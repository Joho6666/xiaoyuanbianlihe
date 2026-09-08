// packageBuddy/pages/buddy-create/buddy-create.js - Tongpin 同频三步极速发起搭子
const app = getApp()
const { BUDDY_CATEGORIES } = require('../../../utils/domain/buddy')

const TITLE_SUGGESTIONS = {
  meal: [
    '今晚食堂二楼有人一起吃吗？',
    '中午二楼麻辣烫拼个单',
    '周末校外探店寻美食搭子',
    '晚上夜市小吃街逛吃'
  ],
  sport: [
    '今晚体育馆羽毛球缺1人双打',
    '下午操场打篮球半场来人',
    '晚上操场夜跑 5km 互相监督',
    '乒乓球馆约打球练球'
  ],
  study: [
    '图书馆三楼沉浸自习搭子',
    '考研/期末高数复习刷题互勉',
    '四六级听力打卡自律搭子',
    '空教室背书刷真题'
  ],
  game: [
    '王者荣耀开黑上分缺辅助/打野',
    '无畏契约/瓦罗兰特五排缺一',
    '英雄联盟大乱斗开黑来人',
    'Steam 联机双人成行搭子'
  ],
  travel: [
    '周末桂林两江四湖骑行',
    '阳朔一日游拼车搭子',
    '周末露营看日出结伴',
    '周边短途徒步散心'
  ],
  citywalk: [
    '周末桂林老街巷漫步拍照',
    '漓江边散步吹风放空',
    '东西巷/正阳步行街慢节奏走走',
    '校园周边探索小众路线'
  ],
  movie: [
    '周五晚电影院新片结伴',
    '周末高分院线电影同看',
    '周末露天草坪电影聚会',
    '影院最新热门悬疑片'
  ],
  photo: [
    '校园银杏/春花人像互拍',
    '日落时刻摄影胶片互拍',
    '校内红楼复古风采风互拍',
    '摄影小白互相练习找角度'
  ],
  custom: [
    '找个搭子一起做点有趣的事',
    '周末同城拼车回南宁/柳州',
    '校内二手乐器交流弹唱',
    '求顺路代取大件快递'
  ]
}

const WHEN_PRESETS = [
  { id: 'now', label: '现在' },
  { id: 'today', label: '今天' },
  { id: 'tonight', label: '今晚' },
  { id: 'tomorrow', label: '明天' },
  { id: 'weekend', label: '周末' },
  { id: 'custom', label: '自定义' }
]

const PLACE_PRESETS = ['体育馆', '操场', '食堂二楼', '图书馆', '商业街', '校门口']

function getPresetTimeRange(whenId, customDate, customTime) {
  const now = new Date()
  const formatTimeStr = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:00`
  }

  if (whenId === 'now') {
    const start = new Date(now.getTime() + 15 * 60 * 1000)
    return formatTimeStr(start)
  }
  if (whenId === 'today') {
    const start = new Date(now)
    start.setHours(18, 0, 0, 0)
    return formatTimeStr(start)
  }
  if (whenId === 'tonight') {
    const start = new Date(now)
    start.setHours(19, 30, 0, 0)
    return formatTimeStr(start)
  }
  if (whenId === 'tomorrow') {
    const start = new Date(now.getTime() + 24 * 3600 * 1000)
    start.setHours(19, 0, 0, 0)
    return formatTimeStr(start)
  }
  if (whenId === 'weekend') {
    const day = now.getDay()
    const offset = day === 6 ? 0 : day === 0 ? 6 : 6 - day
    const start = new Date(now.getTime() + offset * 24 * 3600 * 1000)
    start.setHours(10, 0, 0, 0)
    return formatTimeStr(start)
  }

  // custom
  if (customDate && customTime) {
    return `${customDate} ${customTime}:00`
  }
  return formatTimeStr(new Date(now.getTime() + 3600 * 1000))
}

Page({
  data: {
    currentStep: 1, // 1: 想做什么, 2: 什么时候/在哪里, 3: 差几个人
    categories: BUDDY_CATEGORIES,
    category: 'sport',
    titleSuggestions: TITLE_SUGGESTIONS.sport,
    title: '今晚体育馆羽毛球缺1人双打',
    description: '',

    // Step 2
    whenPresets: WHEN_PRESETS,
    selectedWhen: 'tonight',
    customDate: '',
    customTime: '19:30',
    minDate: '',
    placePresets: PLACE_PRESETS,
    location: '体育馆',

    // Step 3
    maxPeople: 4,
    genderRequirement: 'any',
    submitting: false,

    // 预览数据
    previewTimeLabel: '今晚 19:30',
    previewRemainText: '还差 3 人'
  },

  onLoad(options) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`

    const catParam = options && options.category ? options.category : 'sport'
    const validCat = BUDDY_CATEGORIES.some((c) => c.id === catParam) ? catParam : 'sport'
    const suggestions = TITLE_SUGGESTIONS[validCat] || TITLE_SUGGESTIONS.sport

    this.setData({
      category: validCat,
      titleSuggestions: suggestions,
      title: suggestions[0] || '组局找搭子',
      customDate: todayStr,
      minDate: todayStr
    })
    this.updatePreview()
  },

  updatePreview() {
    let timeLabel = ''
    if (this.data.selectedWhen === 'now') timeLabel = '15分钟内马上开始'
    else if (this.data.selectedWhen === 'tonight') timeLabel = '今晚 19:30'
    else if (this.data.selectedWhen === 'today') timeLabel = '今天傍晚 18:00'
    else if (this.data.selectedWhen === 'tomorrow') timeLabel = '明天 19:00'
    else if (this.data.selectedWhen === 'weekend') timeLabel = '本周末 10:00'
    else timeLabel = `${this.data.customDate} ${this.data.customTime}`

    const remain = Math.max(1, this.data.maxPeople - 1)
    this.setData({
      previewTimeLabel: timeLabel,
      previewRemainText: `还差 ${remain} 人 (共${this.data.maxPeople}人)`
    })
  },

  onSelectCategory(e) {
    const cat = e.currentTarget.dataset.id
    const suggestions = TITLE_SUGGESTIONS[cat] || TITLE_SUGGESTIONS.custom
    this.setData({
      category: cat,
      titleSuggestions: suggestions,
      title: suggestions[0] || this.data.title
    })
    this.updatePreview()
  },

  onSelectSuggestion(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ title: text })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value })
  },

  onSelectWhenPreset(e) {
    this.setData({ selectedWhen: e.currentTarget.dataset.id }, () => {
      this.updatePreview()
    })
  },

  onCustomDateChange(e) {
    this.setData({ customDate: e.detail.value }, () => {
      this.updatePreview()
    })
  },

  onCustomTimeChange(e) {
    this.setData({ customTime: e.detail.value }, () => {
      this.updatePreview()
    })
  },

  onSelectPlacePreset(e) {
    this.setData({ location: e.currentTarget.dataset.place })
  },

  onLocationInput(e) {
    this.setData({ location: e.detail.value })
  },

  onSelectPeopleQuick(e) {
    const val = Number(e.currentTarget.dataset.num)
    this.setData({ maxPeople: val }, () => {
      this.updatePreview()
    })
  },

  onMaxPeopleChange(e) {
    this.setData({ maxPeople: Number(e.detail.value) }, () => {
      this.updatePreview()
    })
  },

  onGenderChange(e) {
    this.setData({ genderRequirement: e.detail.value })
  },

  onNextStep() {
    if (this.data.currentStep === 1) {
      if (!this.data.title.trim()) {
        wx.showToast({ title: '先起个吸引人的标题吧', icon: 'none' })
        return
      }
      this.setData({ currentStep: 2 })
    } else if (this.data.currentStep === 2) {
      if (!this.data.location.trim()) {
        wx.showToast({ title: '请选择或填写集合地点', icon: 'none' })
        return
      }
      this.setData({ currentStep: 3 })
    }
  },

  onPrevStep() {
    if (this.data.currentStep > 1) {
      this.setData({ currentStep: this.data.currentStep - 1 })
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '请填写活动标题', icon: 'none' })
      return
    }
    const location = this.data.location.trim() || '校内商定'
    const startAtStr = getPresetTimeRange(this.data.selectedWhen, this.data.customDate, this.data.customTime)

    this.setData({ submitting: true })
    wx.showLoading({ title: '极速发起中...' })

    try {
      const res = await app.callDB('addBuddyPost', {
        title,
        description: this.data.description.trim(),
        category: this.data.category,
        startAt: startAtStr,
        location,
        minPeople: 2,
        maxPeople: this.data.maxPeople,
        genderRequirement: this.data.genderRequirement,
        campusId: app.getSelectedCampusId ? app.getSelectedCampusId() : ''
      })

      wx.hideLoading()
      this.setData({ submitting: false })

      if (res && res.code === 0 && res.data && res.data.id) {
        wx.showToast({ title: '发起成功！', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/packageBuddy/pages/buddy-detail/buddy-detail?id=${res.data.id}`
          })
        }, 600)
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
