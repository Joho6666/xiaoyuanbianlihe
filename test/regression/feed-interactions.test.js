const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const path = require('path')
let page
let resolveLike
let calls = 0
const app = {
  requestComplianceForAction: () => true,
  toggleLikePost: () => { calls++; return new Promise(resolve => { resolveLike = resolve }) },
  toggleFavorPost: async () => null
}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../campus_treehole/pages/index/index.js'), 'utf8'), {
  getApp: () => app, require: () => ({}), Page: p => { page = p }, wx: { showToast() {} }, console
})
const post = { _id: 'post-1', likes: 0, isLiked: false, isFavored: false }
page.data = { posts: [{ ...post }], leftCol: [{ ...post }], rightCol: [] }
page.setData = function (patch) {
  for (const [key, value] of Object.entries(patch)) {
    const match = key.match(/^(\w+)\[(\d+)\]\.(\w+)$/)
    if (match) this.data[match[1]][Number(match[2])][match[3]] = value
    else this.data[key] = value
  }
}
;(async () => {
  const event = { currentTarget: { dataset: { id: 'post-1' } } }
  const pending = page.onLikeTap(event)
  assert.equal(page.data.posts[0].likes, 1)
  assert.equal(page.data.leftCol[0].likes, 1)
  await page.onLikeTap(event)
  assert.equal(calls, 1, 'pending duplicate click does not send a second request')
  resolveLike(null)
  await pending
  assert.equal(page.data.posts[0].likes, 0)
  assert.equal(page.data.leftCol[0].likes, 0)
  await page.onFavorTap(event)
  assert.equal(page.data.posts[0].isFavored, false)
  assert.equal(page.data.leftCol[0].isFavored, false)
  let selected
  page._reloadFirstPage = patch => { selected = patch.feedType }
  page.onFeedSwitch({ currentTarget: { dataset: { type: 'follow' } } })
  assert.equal(selected, 'follow')
  console.log('PASS feed: optimistic update, duplicate guard, rollback, follow switch')
})().catch(error => { console.error(error); process.exitCode = 1 })
