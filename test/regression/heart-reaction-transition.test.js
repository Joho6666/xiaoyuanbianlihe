const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const { makeDeterministicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/id')

;(async () => {
  const f = await fixture()
  const a = await f.add('reaction_a', 'male')
  const b = await f.add('reaction_b')
  assert.equal((await f.heart.likeHeartProfile(a.id, { targetUserId: b.userId })).data.status, 'WAITING')
  assert.equal((await f.heart.passHeartProfile(a.id, { targetUserId: b.userId })).data.status, 'PASSED')
  const like = f.db.dump().heart_likes[makeDeterministicId('heartlike', a.userId, b.userId)]
  assert.equal(like.status, 'PASSED')
  assert.equal((await f.heart.likeHeartProfile(b.id, { targetUserId: a.userId })).data.status, 'WAITING')
  assert.equal(Object.keys(f.db.dump().heart_matches || {}).length, 0)
  assert.equal((await f.heart.getHeartDiscover(a.id)).data.rows.length, 0)
  assert.equal((await f.heart.drawFateCard(a.id)).data.empty, true)
  console.log('PASS Heart reactions: LIKE to PASS blocks later match and excludes Discover/Fate')
})().catch(error => { console.error(error); process.exitCode = 1 })
