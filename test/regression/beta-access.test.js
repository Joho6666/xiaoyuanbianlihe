const assert = require('assert')
const postsFactory = require('../../campus_treehole/cloudfunctions/dbOperations/modules/posts')
const marketFactory = require('../../campus_treehole/cloudfunctions/dbOperations/modules/market')
;(async () => {
  let status = 'deleted', blocked = false, writes = 0
  const db = { collection: () => ({ doc: () => ({ get: async () => ({data: {_id:'p', _openid:'owner', status}}) }), where: () => { throw Error('must not query child or interaction records') } }) }
  const helpers = { contentDetailBlocked: async () => blocked, getUserForAction: async () => ({}) }
  const posts = postsFactory({ db, helpers }), market = marketFactory({ db, helpers })
  for (const read of [() => posts.getComments('p','hot','viewer'), () => market.getMarketComments('p','viewer'), () => market.toggleFavorGoods('viewer','p'), () => market.wantMarketGoods('viewer','p')]) {
    status = 'deleted'; blocked = false; assert.equal((await read()).code, -1)
    status = 'active'; blocked = true; assert.equal((await read()).code, -1)
  }
  console.log('PASS 8 beta parent visibility and interaction guards')
})().catch(e => { console.error(e); process.exitCode = 1 })
