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
  for (const action of require("../../campus_treehole/cloudfunctions/dbOperations/modules/express").ACTION_NAMES) {
    assert.strictEqual(typeof express[action], "function", `${action} must be exported for the registered dispatcher action`)
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
