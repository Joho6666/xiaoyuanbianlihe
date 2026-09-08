const assert = require('assert')
const vm = require('vm')
const fs = require('fs')
const { createRequire } = require('module')
const { parseLanding } = require('../../campus_treehole/utils/landing')
assert.strictEqual(parseLanding({}), null)
for (const query of [{schoolId:'invalid'}, {campusId:'invalid'}, {schoolId:'guat',campusId:'guet-huajiang'}, {schoolId:'%XX'}]) assert.strictEqual(parseLanding({query}),null)
assert.strictEqual(parseLanding({query:{schoolId:'guat'}}).campusId,'guit-hangtian')
assert.strictEqual(parseLanding({query:{campusId:'guet-huajiang'}}).schoolId,'guet')
assert.strictEqual(parseLanding({query:{scene:'c_guet_hj'}}).campusId,'guet-huajiang')
assert.strictEqual(parseLanding({query:{scene:'s_guet_c_guet-huajiang'}}).campusId,'guet-huajiang')
const appPath = require.resolve('../../campus_treehole/app')
function fixture(initial) {
 const storage = {...initial}; let app
 const wx = {getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=v,showToast:()=>{}}
 vm.runInNewContext(fs.readFileSync(appPath,'utf8'),{require:createRequire(appPath),App:a=>app=a,wx,console,Map,Set,setTimeout,clearTimeout})
 app.doLogin=()=>{}; return {app,storage}
}
for (const initial of [{}, {selectedCampusId_v1:'guet-huajiang'}, {selected_campus_id:'guet-huajiang'}]) {
 const {app,storage}=fixture(initial)
 app.onLaunch({query:{schoolId:'guat'}})
 assert.strictEqual(app.getCommittedCampusId(),Object.keys(initial).length?'guet-huajiang':'guit-hangtian')
 assert.ok(storage.selectedCampusId_v1)
}
console.log('PASS landing parser and fresh/returning-user startup regression')
