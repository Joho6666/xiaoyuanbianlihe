const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const mini = path.join(root, 'campus_treehole')
const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'))
const pages = [
  ...app.pages,
  ...app.subpackages.flatMap(pkg => pkg.pages.map(page => `${pkg.root}/${page}`))
]
const targetPages = [
  'pages/index/index', 'pages/discover/discover', 'pages/detail/detail', 'pages/market/market', 'pages/message/message', 'pages/chat/chat',
  'packageMarket/pages/market-detail/market-detail', 'packageMarket/pages/market-post/market-post',
  'packageBuddy/pages/buddy-square/buddy-square', 'packageBuddy/pages/buddy-detail/buddy-detail', 'packageBuddy/pages/buddy-create/buddy-create', 'packageBuddy/pages/heart-home/heart-home', 'packageBuddy/pages/heart-profile-edit/heart-profile-edit',
  'packageBridge/pages/bridge-home/bridge-home', 'packageBridge/pages/partner-detail/partner-detail', 'packageBridge/pages/language-setup/language-setup',
  'packageMutual/pages/mutual-list/mutual-list', 'packageMutual/pages/mutual-detail/mutual-detail', 'packageMutual/pages/mutual-create/mutual-create',
  'packageEvents/pages/activity/activity'
]
assert.deepEqual(targetPages.filter(page => !pages.includes(page)), [], 'all Phase 2 user pages are registered')
for (const component of ['campus-page-header', 'section-header']) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(mini, 'components', component, `${component}.${ext}`)), `${component}.${ext} exists`)
}
for (const page of targetPages) {
  const json = JSON.parse(fs.readFileSync(path.join(mini, `${page}.json`), 'utf8'))
  assert(json.usingComponents && json.usingComponents['campus-page-header'], `${page} uses campus-page-header`)
  const wxml = fs.readFileSync(path.join(mini, `${page}.wxml`), 'utf8')
  assert(wxml.includes('<campus-page-header'), `${page} renders campus-page-header`)
}
const heartText = ['packageBuddy/pages/heart-home/heart-home.wxml', 'packageBuddy/pages/heart-profile-edit/heart-profile-edit.wxml']
  .map(file => fs.readFileSync(path.join(mini, file), 'utf8')).join('\n')
assert(!/(恋爱成功率|成功率\s*%)/.test(heartText), 'Heart UI contains no probability claims')
assert(fs.readFileSync(path.join(mini, 'packageBuddy/pages/heart-home/heart-home.wxml'), 'utf8').includes('暂时没有新同频同学'), 'Heart empty state is concrete')
console.log(`PASS Phase 2 UI: ${targetPages.length} user pages registered, shared headers wired, Heart copy guarded`)
