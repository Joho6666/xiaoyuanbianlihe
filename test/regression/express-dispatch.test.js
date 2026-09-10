const assert = require("assert")
const fs = require("fs")
const path = require("path")
const { createExpressFixture } = require("../helpers/express-fixture")

async function run() {
  const root = path.resolve(__dirname, "..", "..")
  const indexSource = fs.readFileSync(path.join(root, "campus_treehole/cloudfunctions/dbOperations/index.js"), "utf8")
  assert.ok(indexSource.includes("'getExpressServiceConfig'") && indexSource.includes("'getExpressQuote'"), "PUBLIC_READ_ACTIONS must include express config and quote")

  const appSource = fs.readFileSync(path.join(root, "campus_treehole/app.js"), "utf8")
  assert.ok(appSource.includes("'getExpressServiceConfig'"), "app.js campusReads must include getExpressServiceConfig")

  const { express, staff } = createExpressFixture()
  assert.strictEqual(typeof express.getExpressServiceConfig, "function", "getExpressServiceConfig must be exported")
  assert.strictEqual(typeof express.getServiceConfig, "function", "getServiceConfig must be exported")
  assert.strictEqual(typeof express.recognizeExpressScreenshots, "function", "recognizeExpressScreenshots must be exported")
  const expressDefinition = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express')
  assert.ok(expressDefinition.ACTION_NAMES.includes('recognizeExpressScreenshots'), "Express action list must include screenshot import")
  assert.ok(indexSource.includes('EXPRESS_ACTIONS.has(action)') && indexSource.includes('Express action handler is missing'), "dbOperations dispatcher must route registered Express actions")
  for (const action of require("../../campus_treehole/cloudfunctions/dbOperations/modules/express").ACTION_NAMES) {
    assert.strictEqual(typeof express[action], "function", `${action} must be exported for the registered dispatcher action`)
  }

  // Contract test: Dynamically extract every callDB action called in packageExpress frontend
  function findJsFiles(dir) {
    let files = []
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (fs.statSync(full).isDirectory()) files = files.concat(findJsFiles(full))
      else if (full.endsWith('.js')) files.push(full)
    }
    return files
  }

  const expressFrontendFiles = findJsFiles(path.join(root, 'campus_treehole/packageExpress'))
  const clientActions = new Set()
  for (const file of expressFrontendFiles) {
    const code = fs.readFileSync(file, 'utf8')
    const regex = /callDB\(\s*['"]([a-zA-Z0-9_]+)['"]/g
    let match
    while ((match = regex.exec(code)) !== null) {
      clientActions.add(match[1])
    }
  }

  const expressActions = new Set(expressDefinition.ACTION_NAMES)
  const staffActionNames = new Set([
    'getMyStaffCapabilities',
    'ownerResolveExpressStaffCandidate',
    'ownerAddExpressStaff',
    'ownerDisableExpressStaff',
    'ownerUpdateExpressStaffPermissions',
    'ownerGetExpressStaff'
  ])

  for (const clientAction of clientActions) {
    const isExpress = expressActions.has(clientAction)
    const isStaff = staffActionNames.has(clientAction)
    assert.ok(
      isExpress || isStaff,
      `Frontend action "${clientAction}" in packageExpress must be routed in dbOperations dispatcher`
    )
    if (isExpress) {
      assert.strictEqual(typeof express[clientAction], 'function', `Express module must export handler for action "${clientAction}"`)
    }
  }

  // Explicit required action checks
  const requiredActions = [
    'getExpressServiceConfig',
    'getExpressQuote',
    'createExpressOrder',
    'recognizeExpressScreenshots',
    'getMyExpressDeliveryProfiles'
  ]
  for (const reqAction of requiredActions) {
    assert.ok(clientActions.has(reqAction), `Frontend must use action "${reqAction}"`)
    assert.ok(expressActions.has(reqAction), `Server dispatcher must register action "${reqAction}"`)
    assert.strictEqual(typeof express[reqAction], 'function', `Server must implement "${reqAction}"`)
  }
  assert.strictEqual(typeof staff.ownerResolveExpressStaffCandidate, "function", "ownerResolveExpressStaffCandidate must be exported")
  assert.strictEqual(typeof staff.ownerResolveCandidate, "function", "ownerResolveCandidate must be exported")

  // Public/anonymous reading must not crash even when openid has no user record
  const anonConfig = await express.getExpressServiceConfig("oid-nonexistent-student", {})
  assert.strictEqual(anonConfig.code, 0)
  assert.strictEqual(anonConfig.data.campusId, "guit-hangtian")
  assert.strictEqual(anonConfig.data.configured, false)
  assert.strictEqual(anonConfig.data.serviceStatus, "UNCONFIGURED")

  // Without openid at all (public read)
  const noAuth = await express.getExpressServiceConfig("", { campusId: "guit-hangtian" })
  assert.strictEqual(noAuth.code, 0)
  assert.strictEqual(noAuth.data.campusId, "guit-hangtian")

  console.log("PASS Express dispatch: action routing, public read actions, and anonymous service config safety")
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
