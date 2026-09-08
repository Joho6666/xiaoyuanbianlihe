const directory = require('../config/schools')
function filterCampusesByQuery(query) {
 const tokens=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean)
 return directory.CAMPUSES.filter(c=>tokens.every(t=>[c.id,c.name,...c.keywords].some(k=>String(k).toLowerCase().includes(t))))
}
module.exports = { ...directory, DEFAULT_CAMPUS_ID: 'guit-hangtian', filterCampusesByQuery }
