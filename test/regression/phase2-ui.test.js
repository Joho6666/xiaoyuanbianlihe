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
for (const component of ['campus-page-header', 'section-header', 'service-card', 'user-row', 'empty-state', 'status-chip', 'price-text', 'filter-tabs', 'content-card', 'buddy-card', 'heart-card', 'match-card', 'fate-card', 'product-card']) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(mini, 'components', component, `${component}.${ext}`)), `${component}.${ext} exists`)
}
const indexWxml = fs.readFileSync(path.join(mini, 'pages/index/index.wxml'), 'utf8')
const activityWxml = fs.readFileSync(path.join(mini, 'packageEvents/pages/activity/activity.wxml'), 'utf8')
assert(indexWxml.includes('class="waterfall" wx:if="{{!showSkeleton}}"'), 'Campus Feed renders the live two-column waterfall')
assert(indexWxml.includes('wx:for="{{leftCol}}"') && indexWxml.includes('wx:for="{{rightCol}}"'), 'Waterfall renders both display columns from the live feed')
assert(indexWxml.includes('bindload="onMediaLoad"') && indexWxml.includes('<video'), 'Waterfall preserves image sizing and video rendering')
assert(activityWxml.includes('<content-card'), 'Events renders shared content-card')
assert(!activityWxml.includes('class="waterfall"'), 'Events no longer renders the legacy waterfall')
assert(fs.readFileSync(path.join(mini, 'pages/market/market.wxml'), 'utf8').includes('<product-card'), 'Market renders shared product-card')
assert(fs.readFileSync(path.join(mini, 'packageBuddy/pages/buddy-square/buddy-square.wxml'), 'utf8').includes('<buddy-card'), 'Buddy renders shared buddy-card')
assert(fs.readFileSync(path.join(mini, 'packageBridge/pages/bridge-home/bridge-home.wxml'), 'utf8').includes('<user-row'), 'Bridge renders shared user-row')
assert(fs.readFileSync(path.join(mini, 'packageMutual/pages/mutual-list/mutual-list.wxml'), 'utf8').includes('<content-card'), 'Mutual renders shared content-card')
for (const page of targetPages) {
  const json = JSON.parse(fs.readFileSync(path.join(mini, `${page}.json`), 'utf8'))
  if (page === 'pages/index/index') continue
  assert(json.usingComponents && json.usingComponents['campus-page-header'], `${page} uses campus-page-header`)
  const wxml = fs.readFileSync(path.join(mini, `${page}.wxml`), 'utf8')
  assert(wxml.includes('<campus-page-header'), `${page} renders campus-page-header`)
}
const heartText = ['packageBuddy/pages/heart-home/heart-home.wxml', 'packageBuddy/pages/heart-profile-edit/heart-profile-edit.wxml']
  .map(file => fs.readFileSync(path.join(mini, file), 'utf8')).join('\n')
assert(!/(恋爱成功率|成功率\s*%)/.test(heartText), 'Heart UI contains no probability claims')
assert(fs.readFileSync(path.join(mini, 'packageBuddy/pages/heart-home/heart-home.wxml'), 'utf8').includes('暂时没有新同频同学'), 'Heart empty state is concrete')
for (const page of ['pages/index/index', 'pages/discover/discover']) {
  const wxml = fs.readFileSync(path.join(mini, `${page}.wxml`), 'utf8')
  assert(!wxml.includes('wx:if="{{false}}"'), `${page} does not retain a hidden legacy template`)
}
console.log(`PASS Phase 2 UI: ${targetPages.length} user pages registered, live waterfall guarded, Heart copy guarded`)
