const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')

async function run() {
  const fixture = createExpressFixture()
  const { express, db } = fixture
  const originalCollection = db.collection
  db.collection = () => { throw new Error('permission denied while reading express_settings') }
  await assert.rejects(() => express.getExpressServiceConfig('oid-student', { campusId: 'guit-hangtian' }), /permission denied/)
  db.collection = originalCollection
  console.log('PASS Express settings errors: database failures are not disguised as UNCONFIGURED')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
