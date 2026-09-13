// shared/domain/ride-places.js - 拼车预置地点目录（桂林）
// 纯数据 + 过滤函数；坐标为预置近似值，仅用于距离估算与小地图展示。
// 客户端镜像见 campus_treehole/utils/domain/，云端副本见 cloudfunctions/dbOperations/domain/。
// 腾讯位置服务升级：服务端 searchRidePlaces 检测到 TENCENT_LBS_KEY 时切换 webservice POI 搜索，
// 输出仍为 { poiId, name, address, latitude, longitude } 结构。

const RIDE_PLACE_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'nearby', name: '附近' },
  { id: 'station', name: '车站' },
  { id: 'airport', name: '机场' },
  { id: 'mall', name: '商圈' },
  { id: 'school', name: '学校' },
  { id: 'scenic', name: '景区' }
]

const RIDE_PLACES = [
  { poiId: 'guat-south-gate', name: '桂林航天工业学院（南校门）', shortName: '桂航南门', address: '桂林市七星区金鸡路2号', latitude: 25.3321, longitude: 110.3653, category: 'school', hot: true },
  { poiId: 'guat-north-gate', name: '桂林航天工业学院（北校门）', shortName: '桂航北门', address: '桂林市七星区金鸡路9号', latitude: 25.3352, longitude: 110.3668, category: 'school', hot: false },
  { poiId: 'guilin-station', name: '桂林站', shortName: '桂林站', address: '桂林市象山区中山南路39号', latitude: 25.2692, longitude: 110.2885, category: 'station', hot: true },
  { poiId: 'guilin-north-station', name: '桂林北站', shortName: '桂林北站', address: '桂林市叠彩区站前路2号', latitude: 25.3390, longitude: 110.3135, category: 'station', hot: true },
  { poiId: 'guilin-west-station', name: '桂林西站', shortName: '桂林西站', address: '桂林市临桂区西城北路', latitude: 25.2470, longitude: 110.1780, category: 'station', hot: true },
  { poiId: 'liangjiang-airport', name: '桂林两江国际机场', shortName: '两江机场', address: '桂林市临桂区两江镇', latitude: 25.2181, longitude: 110.0399, category: 'airport', hot: true },
  { poiId: 'wanda-plaza', name: '万达广场（七星区）', shortName: '万达广场', address: '桂林市七星区骖鸾路', latitude: 25.2805, longitude: 110.3165, category: 'mall', hot: true },
  { poiId: 'dongxi-alley', name: '东西巷', shortName: '东西巷', address: '桂林市秀峰区正阳路步行街', latitude: 25.2803, longitude: 110.2987, category: 'mall', hot: false },
  { poiId: 'yangshuo', name: '阳朔', shortName: '阳朔', address: '桂林市阳朔县', latitude: 24.7736, longitude: 110.4887, category: 'scenic', hot: false }
]

function getRidePlaceById(poiId) {
  return RIDE_PLACES.find(place => place.poiId === poiId) || null
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity
  const toRad = value => (value * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 目录内搜索：关键词匹配 名称/简称/地址，可叠加分类过滤。
 */
function filterRidePlaces({ keyword = '', category = 'all', limit = 50 } = {}) {
  const kw = escapeRegExp(keyword).trim()
  const keywordRe = kw ? new RegExp(kw, 'i') : null
  const results = RIDE_PLACES.filter(place => {
    if (category && category !== 'all' && category !== 'nearby' && place.category !== category) return false
    if (!keywordRe) return true
    return keywordRe.test(place.name) || keywordRe.test(place.shortName || '') || keywordRe.test(place.address)
  })
  return results.slice(0, limit)
}

function getHotRidePlaces(limit = 6) {
  return RIDE_PLACES.filter(place => place.hot).slice(0, limit)
}

/**
 * 根据当前经纬度计算预置目录距离并排序（§12: 轻量附近地点推荐）
 */
function nearestRidePlaces(lat, lng, limit = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
  return RIDE_PLACES.map(place => {
    const dist = haversineMeters(lat, lng, place.latitude, place.longitude)
    let distText = ''
    if (dist < 1000) {
      distText = `${Math.round(dist)}m`
    } else {
      distText = `${(dist / 1000).toFixed(1)}km`
    }
    return { ...place, distanceMeters: Math.round(dist), distanceText: distText }
  }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, limit)
}

module.exports = {
  RIDE_PLACE_CATEGORIES,
  RIDE_PLACES,
  getRidePlaceById,
  getHotRidePlaces,
  filterRidePlaces,
  nearestRidePlaces,
  haversineMeters,
  escapeRegExp
}
