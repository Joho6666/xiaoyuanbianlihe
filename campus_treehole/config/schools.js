// config/schools.js - 极简多校与校区配置层
// 扩展新高校与校区只需在此增加配置条目，零运维、零开发
const SCHOOLS = [
  {
    id: 'guat',
    name: '桂林航天工业学院',
    shortName: '桂航',
    city: '桂林',
    campuses: [
      { id: 'guit-hangtian', name: '桂林航天工业学院', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'gxnu',
    name: '广西师范大学',
    shortName: '广西师大',
    city: '桂林',
    campuses: [
      { id: 'gxnu-yanshan', name: '广西师范大学雁山校区', isDefault: true },
      { id: 'gxnu-yucai', name: '广西师范大学育才校区', isDefault: false }
    ],
    enabled: true
  },
  {
    id: 'guet',
    name: '桂林电子科技大学',
    shortName: '桂电',
    city: '桂林',
    campuses: [
      { id: 'guet-huajiang', name: '桂林电子科技大学花江校区', isDefault: true },
      { id: 'guet-jjl', name: '桂林电子科技大学金鸡岭校区', isDefault: false }
    ],
    enabled: true
  },
  {
    id: 'glut',
    name: '桂林理工大学',
    shortName: '桂工',
    city: '桂林',
    campuses: [
      { id: 'glut-yanshan', name: '桂林理工大学雁山校区', isDefault: true },
      { id: 'glut-pingfeng', name: '桂林理工大学屏风校区', isDefault: false }
    ],
    enabled: true
  },
  {
    id: 'gxmu',
    name: '广西医科大学',
    shortName: '广西医科大',
    city: '桂林',
    campuses: [
      { id: 'gxmu', name: '广西医科大学', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'gltu',
    name: '桂林旅游学院',
    shortName: '桂旅',
    city: '桂林',
    campuses: [
      { id: 'gltu', name: '桂林旅游学院', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'guilin-college',
    name: '桂林学院',
    shortName: '桂院',
    city: '桂林',
    campuses: [
      { id: 'guilin-college', name: '桂林学院', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'glnc',
    name: '桂林师范学院',
    shortName: '桂林师院',
    city: '桂林',
    campuses: [
      { id: 'glnc', name: '桂林师范学院', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'gist',
    name: '桂林信息科技学院',
    shortName: '信科',
    city: '桂林',
    campuses: [
      { id: 'gist', name: '桂林信息科技学院', isDefault: true }
    ],
    enabled: true
  },
  {
    id: 'nnlgxy',
    name: '南宁理工学院',
    shortName: '南宁理工',
    city: '桂林',
    campuses: [
      { id: 'nnlgxy', name: '南宁理工学院', isDefault: true }
    ],
    enabled: true
  }
]

function getSchoolById(schoolId) {
  if (!schoolId) return null
  return SCHOOLS.find((s) => s.id === schoolId && s.enabled) || null
}

function getCampusByCampusId(campusId) {
  if (!campusId) return null
  for (const school of SCHOOLS) {
    if (!school.enabled) continue
    const found = school.campuses.find((c) => c.id === campusId)
    if (found) {
      return {
        ...found,
        schoolId: school.id,
        schoolName: school.name,
        schoolShortName: school.shortName,
        city: school.city
      }
    }
  }
  return null
}

module.exports = {
  SCHOOLS,
  getSchoolById,
  getCampusByCampusId
}
