const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notStrictEqual(start, -1, `${name} must exist`)
  const brace = source.indexOf('{', start)
  let depth = 0
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(brace, i + 1)
    }
  }
  throw new Error(`could not parse ${name}`)
}

const dbOperations = read('cloudfunctions/dbOperations/index.js')
const admin = read('hosting/admin.html')
const app = read('app.js')
const followView = read('pages/follow/follow.wxml')
const packageJson = JSON.parse(read('package.json'))

const writeBody = functionBody(admin, 'adminWriteWithDbFallback')
const readBody = functionBody(admin, 'adminReadWithDbFallback')

assert.match(writeBody, /hasAdminSecret\(\)/, 'admin writes must check the web secret')
assert.doesNotMatch(writeBody, /await\s+runDb\s*\(/, 'admin writes must never fall back to direct DB writes')
assert.doesNotMatch(readBody, /await\s+dbLoader\s*\(/, 'admin reads must never fall back to direct DB reads')

assert.match(dbOperations, /action === ['"]getTempFileUrls['"]/) 
assert.match(dbOperations, /const\s+accessible\s*=\s*new Set\(\)/, 'temp URLs need an ownership allow-list')
assert.match(dbOperations, /filterAccessibleFileList\(safeList,\s*accessible\)/, 'temp URLs must filter requested IDs')
assert.match(dbOperations, /function\s+sanitizeUserForClient\s*\(/, 'public user responses need a whitelist sanitizer')
assert.match(dbOperations, /searchUsers[\s\S]{0,5000}sanitizeUserForClient/, 'search results must be sanitized')
assert.match(dbOperations, /getUserInfo[\s\S]{0,5000}sanitizeUserForClient/, 'profile results must be sanitized')
assert.match(dbOperations, /async function resolveUserRef\s*\(/, 'public user references must resolve server-side')
assert.match(followView, /data-user-ref=/, 'user lists must navigate with the public user reference')

assert.doesNotMatch(app, /xyblh-5gb26qrnf9d30feb/, 'the app must not ship the maintainer environment ID')
assert.doesNotMatch(app, /wx\.cloud\.getTempFileURL\s*\(/, 'the app must not bypass server-side file ownership checks')
assert.doesNotMatch(admin, /xyblh-5gb26qrnf9d30feb/, 'the hosted admin page must not ship the maintainer environment ID')
assert.ok(packageJson.scripts['cloud:deploy-functions'].includes('scripts/cloudbase-cli.js'), 'deploy scripts must use the configured environment wrapper')
assert.doesNotMatch(read('scripts/deploy-cloud-functions.ps1'), /xyblh-5gb26qrnf9d30feb/, 'PowerShell deploy script must not ship the maintainer environment ID')

console.log('security regression checks passed')
