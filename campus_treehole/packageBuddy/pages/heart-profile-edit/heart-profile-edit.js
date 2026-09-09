const app = getApp()

const PRESET_INTERESTS = [
  '羽毛球', '摄影', 'City Walk', '自习', '咖啡',
  '骑行', '电影', '游戏', '音乐', '旅行', '美食', '猫咪'
]

const PRESET_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三']

Page({
  data: {
    busy: false,
    error: '',
    photos: [],
    bio: '',
    lookingFor: '',
    grade: '',
    interestList: [],
    presetInterests: PRESET_INTERESTS,
    presetGrades: PRESET_GRADES,
    genders: [
      { id: 'male', label: '男生', icon: '👦' },
      { id: 'female', label: '女生', icon: '👧' },
      { id: 'other', label: '其他', icon: '✨' }
    ],
    genderValues: ['male', 'female', 'other'],
    genderIndex: 0,
    preferences: [],
    maleSelected: false,
    femaleSelected: false,
    otherSelected: false,
    adultDeclared: false,
    enabled: false,
    allowFateCard: false,
    customInterestInput: ''
  },

  async onLoad() {
    try {
      const r = await app.callDB('getHeartProfile')
      if (r.code !== 0) throw new Error(r.msg)
      const p = r.data
      if (p && p.enabled) {
        const interests = Array.isArray(p.interestIds) ? p.interestIds : []
        const prefs = Array.isArray(p.interestedIn) ? p.interestedIn : []
        const gIdx = this.data.genderValues.indexOf(p.gender)
        this.setData({
          ...p,
          interestList: interests,
          genderIndex: gIdx >= 0 ? gIdx : 0,
          preferences: prefs,
          maleSelected: prefs.includes('male'),
          femaleSelected: prefs.includes('female'),
          otherSelected: prefs.includes('other'),
          adultDeclared: p.adultDeclared === true,
          enabled: p.enabled === true,
          allowFateCard: p.allowFateCard === true
        })
      }
    } catch (e) {
      this.setData({ error: e.message })
    }
  },

  input(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  selectGender(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (!Number.isNaN(idx) && idx >= 0 && idx < this.data.genderValues.length) {
      this.setData({ genderIndex: idx })
    }
  },

  togglePreference(e) {
    const val = e.currentTarget.dataset.val
    let prefs = this.data.preferences.slice()
    if (prefs.includes(val)) {
      prefs = prefs.filter(x => x !== val)
    } else {
      prefs.push(val)
    }
    this.setData({
      preferences: prefs,
      maleSelected: prefs.includes('male'),
      femaleSelected: prefs.includes('female'),
      otherSelected: prefs.includes('other')
    })
  },

  selectGrade(e) {
    const g = e.currentTarget.dataset.grade
    this.setData({ grade: g })
  },

  togglePresetInterest(e) {
    const item = e.currentTarget.dataset.interest
    let list = this.data.interestList.slice()
    if (list.includes(item)) {
      list = list.filter(x => x !== item)
    } else {
      if (list.length >= 12) {
        wx.showToast({ title: '最多添加12个兴趣', icon: 'none' })
        return
      }
      list.push(item)
    }
    this.setData({ interestList: list })
  },

  addCustomInterest() {
    const raw = String(this.data.customInterestInput || '').trim()
    if (!raw) return
    let list = this.data.interestList.slice()
    const parts = raw.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (part.length > 20) continue
      if (!list.includes(part)) {
        if (list.length >= 12) {
          wx.showToast({ title: '最多添加12个兴趣', icon: 'none' })
          break
        }
        list.push(part)
      }
    }
    this.setData({
      interestList: list,
      customInterestInput: ''
    })
  },

  removeInterest(e) {
    const idx = Number(e.currentTarget.dataset.index)
    let list = this.data.interestList.slice()
    list.splice(idx, 1)
    this.setData({ interestList: list })
  },

  toggleConsent(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: !this.data[key] })
  },

  async photos() {
    if (this.data.busy) return
    if (this.data.photos.length >= 3) {
      wx.showToast({ title: '最多上传3张照片', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    try {
      const selected = await wx.chooseMedia({
        count: 3 - this.data.photos.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      })
      const files = []
      for (const file of selected.tempFiles) {
        wx.showLoading({ title: '安全上传中...' })
        const r = await wx.cloud.uploadFile({
          cloudPath: 'heart/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg',
          filePath: file.tempFilePath
        })
        files.push(r.fileID)
      }
      wx.hideLoading()
      this.setData({ photos: this.data.photos.concat(files) })
    } catch (e) {
      wx.hideLoading()
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      this.setData({ error: e.errMsg || e.message })
    } finally {
      this.setData({ busy: false })
    }
  },

  remove(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const photos = this.data.photos.slice()
    photos.splice(idx, 1)
    this.setData({ photos })
  },

  async save() {
    if (this.data.busy) return
    const d = this.data

    if (!d.photos.length) {
      wx.showToast({ title: '请至少上传1张照片', icon: 'none' })
      return
    }
    if (!d.preferences.length) {
      wx.showToast({ title: '请选择希望认识的人', icon: 'none' })
      return
    }
    if (!d.adultDeclared) {
      wx.showToast({ title: '需确认年满18周岁', icon: 'none' })
      return
    }
    if (!d.enabled) {
      wx.showToast({ title: '请勾选开启心动模式', icon: 'none' })
      return
    }

    this.setData({ busy: true, error: '' })
    try {
      const payload = {
        enabled: d.enabled,
        adultDeclared: d.adultDeclared,
        allowFateCard: d.allowFateCard,
        gender: d.genderValues[d.genderIndex],
        interestedIn: d.preferences,
        grade: d.grade,
        photos: d.photos,
        bio: d.bio,
        lookingFor: d.lookingFor,
        interestIds: d.interestList
      }
      const r = await app.callDB('updateHeartProfile', payload)
      if (r.code !== 0) throw new Error(r.msg)
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (e) {
      this.setData({ error: e.message })
    } finally {
      this.setData({ busy: false })
    }
  }
})
