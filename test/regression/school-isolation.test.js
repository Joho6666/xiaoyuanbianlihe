const assert = require('assert')
const createPostsModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/posts')
const createMarketModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/market')
const createBuddiesModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/buddies')
const createMutualModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/mutual')
const createBridgeModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/bridge')
const createCampusNowModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/campus-now')
const {
  resolveCampusIdForRead,
  campusWhereClause,
  DEFAULT_CAMPUS_ID
} = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')

function createIsolationMockDb() {
  const store = {
    posts: [
      { _id: 'p_guat', title: '桂航树洞', campusId: 'guit-hangtian', status: 'active', isApproved: true, createTime: new Date() },
      { _id: 'p_guet', title: '桂电树洞', campusId: 'guet-huajiang', status: 'active', isApproved: true, createTime: new Date() }
    ],
    market_goods: [
      { _id: 'g_guat', title: '桂航闲置', campusId: 'guit-hangtian', status: 'active', price: 50, createTime: new Date() },
      { _id: 'g_guet', title: '桂电闲置', campusId: 'guet-huajiang', status: 'active', price: 60, createTime: new Date() }
    ],
    buddy_posts: [
      { _id: 'b_guat', title: '桂航搭子', category: 'sport', campusId: 'guit-hangtian', status: 'OPEN', startAt: new Date(Date.now() + 3600000).toISOString(), maxPeople: 4, acceptedCount: 1 },
      { _id: 'b_guet', title: '桂电搭子', category: 'sport', campusId: 'guet-huajiang', status: 'OPEN', startAt: new Date(Date.now() + 3600000).toISOString(), maxPeople: 4, acceptedCount: 1 }
    ],
    mutual_posts: [
      { _id: 'm_guat', title: '桂航互助', type: 'help', campusId: 'guit-hangtian', status: 'open', createTime: new Date() },
      { _id: 'm_guet', title: '桂电互助', type: 'help', campusId: 'guet-huajiang', status: 'open', createTime: new Date() }
    ],
    users: [
      { _id: 'u_guat', _openid: 'o_guat', nickName: '桂航小王', campusId: 'guit-hangtian', status: 'active', languageProfile: { nativeLanguages: ['zh'], targetLanguages: ['en'] } },
      { _id: 'u_guet', _openid: 'o_guet', nickName: '桂电小李', campusId: 'guet-huajiang', status: 'active', languageProfile: { nativeLanguages: ['en'], targetLanguages: ['zh'] } }
    ]
  }

  function matchSingle(item, key, val) {
    if (val && typeof val === 'object') {
      if (val.$in) return val.$in.includes(item[key])
      if (val.$neq !== undefined) return item[key] !== val.$neq
      if (val.$or) return val.$or.some((sub) => Object.entries(sub).every(([k, v]) => matchSingle(item, k, v)))
    }
    return item[key] === val
  }

  function matches(item, cond) {
    if (!cond) return true
    if (Array.isArray(cond)) return cond.every((c) => matches(item, c))
    if (cond.$or) return cond.$or.some((c) => matches(item, c))
    for (const [k, v] of Object.entries(cond)) {
      if (k === '$or') {
        if (!v.some((c) => matches(item, c))) return false
      } else if (!matchSingle(item, k, v)) {
        return false
      }
    }
    return true
  }

  const createCollection = (name) => {
    const items = store[name] || []
    return {
      where: (condition = {}) => ({
        orderBy: () => ({
          skip: () => ({
            limit: () => ({
              get: async () => ({
                data: items.filter((it) => matches(it, condition)).map((x) => JSON.parse(JSON.stringify(x)))
              })
            })
          }),
          limit: () => ({
            get: async () => ({
              data: items.filter((it) => matches(it, condition)).map((x) => JSON.parse(JSON.stringify(x)))
            })
          })
        }),
        limit: () => ({
          get: async () => ({
            data: items.filter((it) => matches(it, condition)).map((x) => JSON.parse(JSON.stringify(x)))
          })
        }),
        get: async () => ({
          data: items.filter((it) => matches(it, condition)).map((x) => JSON.parse(JSON.stringify(x)))
        })
      })
    }
  }

  const db = {
    collection: createCollection,
    serverDate: () => new Date(),
    RegExp: ({ regexp }) => new RegExp(regexp, 'i')
  }

  const _ = {
    and: (arr) => arr,
    or: (arr) => ({ $or: arr }),
    in: (arr) => ({ $in: arr }),
    neq: (val) => ({ $neq: val })
  }

  return { db, _, store }
}

async function testSchoolIsolation() {
  const { db, _ } = createIsolationMockDb()
  const helpers = {
    resolveCampusIdForRead,
    campusWhereClause: (cid) => campusWhereClause(_, cid),
    DEFAULT_CAMPUS_ID,
    getUserForAction: async () => ({ nickName: 'test', status: 'active' }),
    checkRateLimit: async () => true,
    checkBannedWords: () => ({ pass: true }),
    wxTextCheck: async () => ({ pass: true }),
    wxImageBatchCheck: async () => ({ pass: true }),
    isCollectionNotExistError: () => false,
    ensureCollection: async () => {},
    escapeRegExp: (s) => s,
    checkAdmin: async () => false
  }

  const buddies = createBuddiesModule({ db, _, cloud: {}, helpers })
  const mutual = createMutualModule({ db, _, cloud: {}, helpers })
  const bridge = createBridgeModule({ db, _, cloud: {}, helpers })
  const campusNow = createCampusNowModule({ db, _, helpers })

  // 1. 验证搭子在桂航与桂电之间的严格隔离
  const guatBuddies = await buddies.getBuddyPosts({ campusId: 'guit-hangtian', status: 'OPEN' })
  assert.strictEqual(guatBuddies.code, 0)
  assert.ok(guatBuddies.data.every((p) => p.campusId === 'guit-hangtian'), '桂航搭子列表绝不能含其他校区内容')
  assert.strictEqual(guatBuddies.data.length, 1)

  const guetBuddies = await buddies.getBuddyPosts({ campusId: 'guet-huajiang', status: 'OPEN' })
  assert.strictEqual(guetBuddies.code, 0)
  assert.ok(guetBuddies.data.every((p) => p.campusId === 'guet-huajiang'), '桂电搭子列表绝不能含其他校区内容')
  assert.strictEqual(guetBuddies.data.length, 1)

  // 2. 验证互助在不同校区间的隔离
  const guatMutual = await mutual.getMutualPosts({ campusId: 'guit-hangtian' })
  assert.strictEqual(guatMutual.code, 0)
  assert.ok(guatMutual.data.every((m) => m.campusId === 'guit-hangtian'), '桂航互助列表绝不能含其他校区内容')

  // 3. 验证友桥语伴在不同校区间的隔离
  const guatBridge = await bridge.getLanguagePartners({ campusId: 'guit-hangtian' })
  assert.strictEqual(guatBridge.code, 0)
  assert.ok(guatBridge.data.every((u) => u.campusId === 'guit-hangtian'), '桂航语伴列表绝不能含其他校区用户')

  // 4. 验证校园此刻在不同校区间的隔离
  const guatNow = await campusNow.getCampusNowSummary({ campusId: 'guit-hangtian' })
  assert.strictEqual(guatNow.code, 0)
  assert.ok(guatNow.data.items.every((i) => !i.title.includes('桂电')), '桂航校园此刻绝不能出现桂电动态')

  const guetNow = await campusNow.getCampusNowSummary({ campusId: 'guet-huajiang' })
  assert.strictEqual(guetNow.code, 0)
  assert.ok(guetNow.data.items.every((i) => !i.title.includes('桂航')), '桂电校园此刻绝不能出现桂航动态')

  console.log('PASS complete cross-campus multi-school data isolation')
}

testSchoolIsolation().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
