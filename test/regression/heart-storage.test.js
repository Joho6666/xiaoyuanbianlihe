const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')

;(async () => {
  const f = await fixture()
  const a = await f.add('storage_a', 'male')
  const owned = `cloud://test/heart/${a.userId}/replacement.jpg`
  const foreign = `cloud://test/heart/other-user/foreign.jpg`
  assert.notEqual((await f.heart.updateHeartProfile(a.id, { ...a.profile, photos: [foreign] })).code, 0)
  assert.equal((await f.heart.updateHeartProfile(a.id, { ...a.profile, photos: [owned] })).code, 0)
  assert.deepEqual(f.deletedFiles, [a.profile.photos[0]])
  console.log('PASS Heart storage: new files require owner namespace and removed owned files are cleaned up')
})().catch(error => { console.error(error); process.exitCode = 1 })
