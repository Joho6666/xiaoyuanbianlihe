// test/regression/ride-action-contract.test.js - Ride Action Contract
// 客户端所有 callDB('ride...') 必须在服务端注册，杜绝“未知操作”穿透。
// 同时校验三份地点目录（shared / 小程序 utils / 云函数 domain）完全一致。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..', '..')
const miniprogramRoot = path.join(repoRoot, 'campus_treehole')

function readFile(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8')
}

function scanJsFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue
      scanJsFiles(path.join(dir, entry.name), results)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(path.join(dir, entry.name))
    }
  }
  return results
}

// ===== 1. 服务端已注册 action 集合 =====
const serverIndex = readFile('campus_treehole/cloudfunctions/dbOperations/index.js')
const serverActions = new Set()
for (const match of serverIndex.matchAll(/case\s+'([A-Za-z0-9_]+)'/g)) {
  serverActions.add(match[1])
}
for (const match of serverIndex.matchAll(/action\s*===\s*'([A-Za-z0-9_]+)'/g)) {
  serverActions.add(match[1])
}
// 动态分发：if (["a","b"].includes(action)) → 集合内字符串均为注册 action（单双引号均兼容）
for (const line of serverIndex.split('\n')) {
  if (/\.includes\(action\)|\.has\(action\)/.test(line)) {
    for (const match of line.matchAll(/["']([A-Za-z0-9_]+)["']/g)) {
      serverActions.add(match[1])
    }
  }
}
// 模块级 ACTION_NAMES 动态分发（如 express 模块）：从各模块源码提取名单
for (const moduleFile of scanJsFiles(path.join(miniprogramRoot, 'cloudfunctions', 'dbOperations', 'modules'))) {
  const source = fs.readFileSync(moduleFile, 'utf8')
  for (const match of source.matchAll(/ACTION_NAMES\s*=\s*\[([^\]]*)\]/g)) {
    for (const nameMatch of match[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)) {
      serverActions.add(nameMatch[1])
    }
  }
}

// ride 模块导出的处理器必须全部注册为 switch case
const rideModuleSource = readFile('campus_treehole/cloudfunctions/dbOperations/modules/ride.js')
const RIDE_CLIENT_ACTIONS = [
  'publishRide',
  'getRideSquare',
  'getRideById',
  'getRidePlaces',
  'searchRidePlaces',
  'getRideMatches',
  'applyRideJoin',
  'cancelRideJoin',
  'reviewRideJoin',
  'leaveRide',
  'updateRideStatus',
  'startRideContact',
  'getMyRides',
  'getRideRequests'
]
for (const action of RIDE_CLIENT_ACTIONS) {
  assert.ok(new RegExp(`(async function|function)\\s+${action}\\b`).test(rideModuleSource) || new RegExp(`${action}\\s*\\(`).test(rideModuleSource), `ride module must implement ${action}`)
  assert.ok(serverActions.has(action), `server must register ride action: ${action}`)
}

// ride actions 不进入 PUBLIC_READ（写操作必须有登录态）；只读集合必须是公开读
const publicRead = new Set((serverIndex.match(/PUBLIC_READ_ACTIONS = new Set\(\[([\s\S]*?)\]\)/) || ['', ''])[1]
  .match(/'([A-Za-z0-9_]+)'/g) || [].map(item => item))
for (const readAction of ['getRideSquare', 'getRideById', 'getRidePlaces', 'searchRidePlaces']) {
  assert.ok(serverIndex.includes(`'${readAction}'`), `${readAction} should be declared`)
}

// ===== 2. 客户端 callDB('...') ⊆ 服务端注册集合（全量契约，ride 重点覆盖） =====
const clientActions = new Map()
const clientDirs = [
  path.join(miniprogramRoot, 'pages'),
  path.join(miniprogramRoot, 'packageRide'),
  path.join(miniprogramRoot, 'packageMarket'),
  path.join(miniprogramRoot, 'packageEvents'),
  path.join(miniprogramRoot, 'packageBuddy'),
  path.join(miniprogramRoot, 'packageBridge'),
  path.join(miniprogramRoot, 'packageMutual')
]
const clientFiles = [path.join(miniprogramRoot, 'app.js'), ...clientDirs.flatMap(dir => scanJsFiles(dir))]
for (const file of clientFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/callDB\(\s*'([A-Za-z0-9_]+)'/g)) {
    const action = match[1]
    if (!clientActions.has(action)) clientActions.set(action, [])
    clientActions.get(action).push(path.relative(repoRoot, file))
  }
}

for (const [action, files] of clientActions) {
  assert.ok(
    serverActions.has(action),
    `client calls unregistered action '${action}' at ${files[0]} — this would fail with 未知操作`
  )
}

// ride 客户端动作必须真实出现在 packageRide 调用面
const rideCallsFound = new Set(
  clientFiles
    .filter(file => file.includes('packageRide') || file.endsWith('app.js'))
    .flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/callDB\(\s*'([A-Za-z0-9_]+)'/g)]
      .map(match => match[1])
      .filter(name => name.toLowerCase().includes('ride')))
)
for (const action of RIDE_CLIENT_ACTIONS) {
  assert.ok(rideCallsFound.has(action), `ride client should call ${action}`)
}

// ===== 3. 三份地点目录一致 =====
const catalogPaths = [
  'shared/domain/ride-places.js',
  'campus_treehole/utils/domain/ride-places.js',
  'campus_treehole/cloudfunctions/dbOperations/domain/ride-places.js'
]
const catalogHash = source => {
  const places = source.match(/const RIDE_PLACES = \[([\s\S]*?)\n\]/)
  return places ? places[1].replace(/\s+/g, '') : ''
}
const catalogs = catalogPaths.map(readFile)
assert.ok(catalogHash(catalogs[0]).length > 0, 'ride places catalog must exist')
assert.equal(catalogHash(catalogs[0]), catalogHash(catalogs[1]), 'shared ↔ miniprogram ride places catalog out of sync (run npm run sync:domain)')
assert.equal(catalogHash(catalogs[0]), catalogHash(catalogs[2]), 'shared ↔ cloud ride places catalog out of sync (run npm run sync:domain)')

// 状态机 / 匹配引擎目录同步
for (const domain of ['ride.js', 'ride-matching.js']) {
  const a = readFile(`shared/domain/${domain}`).replace(/\s+/g, '')
  const b = readFile(`campus_treehole/utils/domain/${domain}`).replace(/\s+/g, '')
  const c = readFile(`campus_treehole/cloudfunctions/dbOperations/domain/${domain}`).replace(/\s+/g, '')
  assert.equal(a, b, `${domain} shared ↔ miniprogram out of sync`)
  assert.equal(a, c, `${domain} shared ↔ cloud out of sync`)
}

console.log(`PASS Ride action contract: ${RIDE_CLIENT_ACTIONS.length} ride actions registered, ${clientActions.size} client actions verified, catalogs in sync`)
