const assert = require('assert')
const createBuddiesModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/buddies')
const createCampusNowModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/campus-now')
const {
  resolveCampusIdForRead,
  campusWhereClause,
  DEFAULT_CAMPUS_ID
} = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')

function createMockDb(initialStore = {}) {
  const store = {
    buddy_posts: [],
    users: [],
    market_goods: [],
    mutual_posts: [],
    ...initialStore
  }

  const createCollection = (name) => {
    if (!store[name]) store[name] = []
    const items = store[name]
    return {
      doc: (id) => ({
        get: async () => {
          const found = items.find((i) => i._id === id)
          return found ? { data: JSON.parse(JSON.stringify(found)) } : { data: null }
        },
        update: async ({ data }) => {
          const found = items.find((i) => i._id === id)
          if (found) Object.assign(found, JSON.parse(JSON.stringify(data)))
          return { stats: { updated: found ? 1 : 0 } }
        }
      }),
      where: (condition = {}) => {
        let filtered = items.slice()
        return {
          orderBy: () => ({
            skip: () => ({
              limit: (limitNum) => ({
                get: async () => ({ data: filtered.slice(0, limitNum).map((x) => JSON.parse(JSON.stringify(x))) })
              })
            }),
            limit: (limitNum) => ({
              get: async () => ({ data: filtered.slice(0, limitNum).map((x) => JSON.parse(JSON.stringify(x))) })
            })
          }),
          limit: (limitNum) => ({
            get: async () => ({ data: filtered.slice(0, limitNum).map((x) => JSON.parse(JSON.stringify(x))) })
          }),
          get: async () => ({ data: filtered.map((x) => JSON.parse(JSON.stringify(x))) })
        }
      }
    }
  }

  const db = {
    collection: createCollection,
    serverDate: () => new Date(),
    RegExp: ({ regexp }) => new RegExp(regexp, 'i')
  }

  const _ = {
    and: (arr) => arr,
    or: (arr) => arr,
    in: (arr) => ({ $in: arr })
  }

  return { db, _, store }
}

async function testCampusNowAndExpiry() {
  const pastStart = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  const futureStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString()

  const { db, _, store } = createMockDb({
    buddy_posts: [
      {
        _id: 'b_past',
        title: '昨天打球',
        category: 'sport',
        campusId: 'guet-huajiang',
        status: 'OPEN',
        startAt: pastStart,
        maxPeople: 4,
        acceptedCount: 1
      },
      {
        _id: 'b_future',
        title: '今晚羽毛球',
        category: 'sport',
        campusId: 'guet-huajiang',
        status: 'OPEN',
        startAt: futureStart,
        maxPeople: 4,
        acceptedCount: 1
      }
    ],
    users: [
      {
        _id: 'u_partner_1',
        _openid: 'o_partner_1',
        nickName: 'Alex',
        status: 'active',
        campusId: 'guet-huajiang',
        languageProfile: {
          nativeLanguages: ['en'],
          targetLanguages: ['zh']
        }
      }
    ],
    market_goods: [
      {
        _id: 'g_1',
        title: '二手耳机',
        price: 99,
        campusId: 'guet-huajiang',
        status: 'active',
        images: ['cloud://goods1.jpg']
      }
    ],
    mutual_posts: [
      {
        _id: 'm_1',
        title: '二食堂求带奶茶',
        type: 'help',
        reward: '3',
        campusId: 'guet-huajiang',
        status: 'open'
      }
    ]
  })

  const buddies = createBuddiesModule({
    db,
    _,
    cloud: {},
    helpers: {
      resolveCampusIdForRead,
      campusWhereClause: (cid) => campusWhereClause(_, cid),
      DEFAULT_CAMPUS_ID,
      getUserForAction: async () => ({ nickName: 'test', status: 'active' }),
      checkRateLimit: async () => true,
      checkBannedWords: () => ({ pass: true }),
      wxTextCheck: async () => ({ pass: true }),
      isCollectionNotExistError: () => false,
      ensureCollection: async () => {},
      escapeRegExp: (s) => s,
      triggerSubscribeNotify: async () => {}
    }
  })

  // 1. 验证 getBuddyPosts 过滤逾期招募活动
  const listRes = await buddies.getBuddyPosts({ campusId: 'guet-huajiang', status: 'OPEN' })
  assert.strictEqual(listRes.code, 0)
  assert.strictEqual(listRes.data.length, 1, '已逾期活动不应出现在 OPEN 列表中')
  assert.strictEqual(listRes.data[0].id || listRes.data[0]._id, 'b_future')

  // 2. 验证 getBuddyPostById 将逾期活动标记为 EXPIRED
  const pastDetail = await buddies.getBuddyPostById({ id: 'b_past' })
  assert.strictEqual(pastDetail.code, 0)
  assert.strictEqual(pastDetail.data.status, 'EXPIRED', '单条详情应自动判定为 EXPIRED')

  // 3. 验证 getCampusNowSummary 轻量聚合
  const campusNow = createCampusNowModule({
    db,
    _,
    helpers: {
      resolveCampusIdForRead,
      campusWhereClause: (cid) => campusWhereClause(_, cid),
      DEFAULT_CAMPUS_ID
    }
  })

  const summary = await campusNow.getCampusNowSummary({ campusId: 'guet-huajiang' })
  assert.strictEqual(summary.code, 0)
  assert.ok(summary.data.items.length >= 3, '应包含 3~5 条精彩动态')
  const types = summary.data.items.map((i) => i.type)
  assert.ok(types.includes('buddy'), '聚合项必须包含搭子')
  assert.ok(types.includes('bridge'), '聚合项必须包含语伴')
  assert.ok(types.includes('market'), '聚合项必须包含二手')
  assert.ok(types.includes('mutual'), '聚合项必须包含互助')

  console.log('PASS Buddy expiry filter in listing and getCampusNowSummary aggregator')
}

testCampusNowAndExpiry().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
