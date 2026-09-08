// 唯一学校目录；云函数副本由 scripts/sync-schools.js 生成。
const SCHOOLS = [
  {
    "id": "guat",
    "name": "桂林航天工业学院",
    "shortName": "桂航",
    "city": "桂林",
    "campuses": [
      {
        "id": "guit-hangtian",
        "name": "桂林航天工业学院",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林航天工业学院"
      }
    ],
    "enabled": true,
    "aliases": [
      "guat",
      "桂航"
    ],
    "pendingVerification": false,
    "status": "pilot",
    "source": "https://www.guat.edu.cn/ghgk/xxjj.htm",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "gxnu",
    "name": "广西师范大学",
    "shortName": "广西师大",
    "city": "桂林",
    "campuses": [
      {
        "id": "gxnu-yanshan",
        "name": "广西师范大学雁山校区",
        "isDefault": true,
        "aliases": [],
        "shortName": "广西师范大学雁山校区"
      },
      {
        "id": "gxnu-yucai",
        "name": "广西师范大学育才校区",
        "isDefault": false,
        "aliases": [],
        "shortName": "广西师范大学育才校区"
      }
    ],
    "enabled": true,
    "aliases": [
      "gxnu",
      "广西师大",
      "桂师大",
      "师大"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.gxnu.edu.cn/1365/list.htm",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "guet",
    "name": "桂林电子科技大学",
    "shortName": "桂电",
    "city": "桂林",
    "campuses": [
      {
        "id": "guet-huajiang",
        "name": "桂林电子科技大学花江校区",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林电子科技大学花江校区"
      },
      {
        "id": "guet-jjl",
        "name": "桂林电子科技大学金鸡岭校区",
        "isDefault": false,
        "aliases": [],
        "shortName": "桂林电子科技大学金鸡岭校区"
      }
    ],
    "enabled": true,
    "aliases": [
      "guet",
      "桂电"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.guet.edu.cn/",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "glut",
    "name": "桂林理工大学",
    "shortName": "桂工",
    "city": "桂林",
    "campuses": [
      {
        "id": "glut-yanshan",
        "name": "桂林理工大学雁山校区",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林理工大学雁山校区"
      },
      {
        "id": "glut-pingfeng",
        "name": "桂林理工大学屏风校区",
        "isDefault": false,
        "aliases": [],
        "shortName": "桂林理工大学屏风校区"
      }
    ],
    "enabled": true,
    "aliases": [
      "glut",
      "桂工"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.glut.edu.cn/",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "glmu",
    "name": "桂林医科大学",
    "shortName": "桂医",
    "city": "桂林",
    "campuses": [
      {
        "id": "glmu-lingui",
        "name": "桂林医科大学临桂校区",
        "address": "桂林市临桂区致远路1号",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林医科大学临桂校区"
      },
      {
        "id": "glmu-dongcheng",
        "name": "桂林医科大学东城校区",
        "address": "桂林市七星区环城北二路109号",
        "aliases": [],
        "shortName": "桂林医科大学东城校区",
        "isDefault": false
      },
      {
        "id": "glmu-lequn",
        "name": "桂林医科大学乐群校区",
        "address": "桂林市秀峰区乐群路20号",
        "aliases": [],
        "shortName": "桂林医科大学乐群校区",
        "isDefault": false
      }
    ],
    "enabled": true,
    "aliases": [
      "glmu",
      "桂医",
      "桂林医大",
      "桂林医学院"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.glmu.edu.cn/",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "gltu",
    "name": "桂林旅游学院",
    "shortName": "桂旅",
    "city": "桂林",
    "campuses": [
      {
        "id": "gltu",
        "name": "桂林旅游学院雁山校区",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林旅游学院雁山校区"
      },
      {
        "id": "gltu-canluan",
        "name": "桂林旅游学院骖鸾校区",
        "aliases": [],
        "shortName": "桂林旅游学院骖鸾校区",
        "isDefault": false
      }
    ],
    "enabled": true,
    "aliases": [
      "gltu",
      "桂旅"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.gltu.edu.cn/xxgk/xxjj.htm",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "guilin-college",
    "name": "桂林学院",
    "shortName": "桂院",
    "city": "桂林",
    "campuses": [],
    "enabled": false,
    "aliases": [
      "guilin-college",
      "桂院"
    ],
    "pendingVerification": true,
    "status": "coming_soon",
    "source": "",
    "verifiedAt": null
  },
  {
    "id": "glnc",
    "name": "桂林师范学院",
    "shortName": "桂林师院",
    "city": "桂林",
    "campuses": [
      {
        "id": "glnc",
        "name": "桂林师范学院",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林师范学院"
      }
    ],
    "enabled": true,
    "aliases": [
      "glnc",
      "桂林师院"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.glnc.edu.cn/",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "gist",
    "name": "桂林信息科技学院",
    "shortName": "信科",
    "city": "桂林",
    "campuses": [
      {
        "id": "gist",
        "name": "桂林信息科技学院",
        "isDefault": true,
        "aliases": [],
        "shortName": "桂林信息科技学院"
      }
    ],
    "enabled": true,
    "aliases": [
      "gist",
      "信科"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.guit.edu.cn/xkjj1/xxjj.htm",
    "verifiedAt": "2026-09-09"
  },
  {
    "id": "nnlgxy",
    "name": "南宁理工学院",
    "shortName": "南宁理工",
    "city": "桂林",
    "campuses": [
      {
        "id": "nnlgxy",
        "name": "南宁理工学院桂林校区",
        "address": "桂林市雁山区雁山镇雁山街317号",
        "isDefault": true,
        "aliases": [],
        "shortName": "南宁理工学院桂林校区"
      }
    ],
    "enabled": true,
    "aliases": [
      "nnlgxy",
      "南宁理工"
    ],
    "pendingVerification": false,
    "status": "coming_soon",
    "source": "https://www.bwgl.cn/",
    "verifiedAt": "2026-09-09"
  }
]
const LEGACY_SCHOOL_ALIASES = { gxmu: 'glmu' }
const LEGACY_CAMPUS_ALIASES = { gxmu: 'glmu-lingui' }
const normalize = value => String(value || '').trim()
const resolveSchoolId = value => LEGACY_SCHOOL_ALIASES[normalize(value)] || normalize(value)
const resolveCampusId = value => LEGACY_CAMPUS_ALIASES[normalize(value)] || normalize(value)
const CAMPUSES = SCHOOLS.filter(s => s.enabled).flatMap(s => s.campuses.map(c => ({...c,schoolId:s.id,schoolName:s.name,schoolShortName:s.shortName,city:s.city,status:s.status,keywords:[s.name,s.shortName,s.id,...s.aliases,c.name,...c.aliases]})))
function getSchoolById(id) { return SCHOOLS.find(s=>s.enabled && s.id===resolveSchoolId(id)) || null }
function getCampusById(id) { return CAMPUSES.find(c=>c.id===resolveCampusId(id)) || null }
function getDefaultCampus(schoolId='guat') { const s=getSchoolById(schoolId);return s ? getCampusById((s.campuses.find(c=>c.isDefault)||s.campuses[0]||{}).id) : null }
module.exports = { SCHOOLS, CAMPUSES, LEGACY_SCHOOL_ALIASES, LEGACY_CAMPUS_ALIASES, resolveSchoolId, resolveCampusId, getSchoolById, getCampusById, getCampusByCampusId:getCampusById, getDefaultCampus }
