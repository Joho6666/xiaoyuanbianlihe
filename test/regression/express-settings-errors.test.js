const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')
const createExpressModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')

async function run() {
  const fixture = createExpressFixture()
  const { express, db } = fixture
  const originalCollection = db.collection
  db.collection = () => { throw new Error('permission denied while reading express_settings') }
  await assert.rejects(() => express.getExpressServiceConfig('oid-student', { campusId: 'guit-hangtian' }), /permission denied/)
  db.collection = originalCollection
  db.collection = () => { throw new Error('DATABASE_COLLECTION_NOT_EXIST') }
  const missingSettingsExpress = createExpressModule({ db, _: fixture._, cloud: fixture.cloud, helpers: { staff: fixture.staff, getUserForAction: async (openid) => fixture.store.users.find((user) => user._openid === openid), isCollectionNotExistError: (error) => /NOT_EXIST/.test(String(error.message)) } })
  const missingSettings = await missingSettingsExpress.getExpressServiceConfig('oid-student', { campusId: 'guit-hangtian' })
  assert.strictEqual(missingSettings.code, 0)
  assert.strictEqual(missingSettings.data.configured, false)
  console.log('PASS Express settings errors: database failures are not disguised as UNCONFIGURED')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
