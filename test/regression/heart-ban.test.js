const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const createSafety = require('../../campus_treehole/cloudfunctions/dbOperations/modules/safety')

;(async () => {
  const f = await fixture()
  const target = await f.add('banned_heart_user')
  const safety = createSafety({ db: f.db, _: f.db.command, helpers: { getUserForAction: async id => f.users[id], isCollectionNotExistError: () => false, isUserBlocksUnavailableError: () => false, getUsersByOpenids: async () => [], checkAdmin: async () => true } })
  assert.equal((await safety.banUser('admin', target.id)).code, 0)
  const profile = f.db.dump().heart_profiles[target.userId]
  assert.equal(profile.enabled, false)
  assert.equal(profile.allowFateCard, false)
  console.log('PASS Heart ban: profile is disabled without deleting audit data')
})().catch(error => { console.error(error); process.exitCode = 1 })
