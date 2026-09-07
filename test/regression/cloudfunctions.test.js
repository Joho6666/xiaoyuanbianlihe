// test/regression/cloudfunctions.test.js - 云函数模块拆分回归测试
const assert = require('assert')

const createMarketModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/market')
const createEventsModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/events')
const createBuddiesModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/buddies')
const createBridgeModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/bridge')
const createMutualModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/mutual')
const { makeDeterministicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/id')
const { resolveCampusIdForRead, campusWhereClause, DEFAULT_CAMPUS_ID } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')

// Lightweight CloudBase In-Memory Mock
function createMockDb() {
  const store = {
    market_goods: [],
    market_favors: [],
    market_wants: [],
    market_comments: [],
    activity_zone: [{ _id: 'config', enabled: true, roundId: 'r1', slides: [{ title: '迎新音乐节' }] }],
    posts: [],
    users: [{ _openid: 'user_mock_001', nickName: '测试同学', campusId: 'guit-hangtian', status: 'active' }]
  }

  const db = {
    serverDate: () => new Date(),
    RegExp: ({ regexp }) => new RegExp(regexp, 'i'),
    collection: (name) => {
      if (!store[name]) store[name] = []
      const items = store[name]
      return {
        doc: (id) => ({
          get: async () => {
            const found = items.find((i) => i._id === id)
            return found ? { data: found } : { data: null }
          },
          set: async ({ data }) => {
            const idx = items.findIndex((i) => i._id === id)
            const row = { _id: id, ...data }
            if (idx >= 0) items[idx] = row
            else items.push(row)
            return { _id: id }
          },
          update: async ({ data }) => {
            const found = items.find((i) => i._id === id)
            if (found) Object.assign(found, data)
            return { stats: { updated: found ? 1 : 0 } }
          }
        }),
        where: () => ({
          orderBy: () => ({
            skip: () => ({
              limit: () => ({
                get: async () => ({ data: [...items] })
              })
            }),
            limit: () => ({
              get: async () => ({ data: [...items] })
            })
          }),
          get: async () => ({ data: [...items] }),
          count: async () => ({ total: items.length }),
          limit: () => ({
            get: async () => ({ data: [...items] })
          })
        }),
        add: async ({ data }) => {
          const _id = data._id || `id_${Date.now()}_${Math.random()}`
          const row = { _id, ...data }
          items.push(row)
          return { _id }
        }
      }
    }
  }

  const _ = {
    and: (arr) => ({ operator: 'and', value: arr }),
    or: (arr) => ({ operator: 'or', value: arr }),
    neq: (val) => ({ operator: 'neq', value: val }),
    in: (arr) => ({ operator: 'in', value: arr }),
    inc: (val) => ({ operator: 'inc', value: val }),
    remove: () => ({ operator: 'remove' }),
    exists: () => ({ operator: 'exists' })
  }

  const cloud = {
    getWXContext: () => ({ OPENID: 'user_mock_001' })
  }

  return { db, _, cloud, store }
}

describe('Cloud Function Modules Regression Tests', () => {
  test('Shared: makeDeterministicId produces stable scoped ids', () => {
    const id1 = makeDeterministicId('want', 'openidA', 'goodsB')
    const id2 = makeDeterministicId('want', 'openidA', 'goodsB')
    assert.strictEqual(id1, id2)
    assert.ok(id1.startsWith('want_'))
  })

  test('Shared: campusWhereClause handles default campus and specific campus', () => {
    const defaultClause = campusWhereClause({ or: (a) => a, exists: () => ({}) }, DEFAULT_CAMPUS_ID)
    assert.ok(defaultClause)

    const specificClause = campusWhereClause({}, 'other-campus')
    assert.deepStrictEqual(specificClause, { campusId: 'other-campus' })
  })

  test('Market Module: validation rejects invalid goods price', async () => {
    const { db, _, cloud } = createMockDb()
    const market = createMarketModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async () => ({ nickName: '测试用户', status: 'active' }),
        checkRateLimit: async () => true,
        checkAdmin: async () => false,
        checkBannedWords: () => ({ pass: true }),
        wxTextCheck: async () => ({ pass: true }),
        wxImageBatchCheck: async () => ({ pass: true }),
        findAuthorsHiddenByBlockRelation: async () => new Set(),
        contentDetailBlocked: async () => false,
        viewerBlockedByAuthor: async () => false,
        addNotification: async () => {},
        triggerSubscribeNotify: async () => {},
        trimSnippet: (t) => t,
        makeDeterministicId,
        DEFAULT_CAMPUS_ID,
        resolveCampusIdForRead,
        campusWhereClause,
        escapeRegExp: (s) => s,
        buildMarketCategoryWhere: () => null,
        normalizePublishCategory: (c) => c
      }
    })

    // 价格 <= 0 应被拦截
    const res = await market.addMarketGoods('user_mock_001', {
      title: '高数课本',
      price: -10,
      images: ['cloud://img1.jpg']
    })
    assert.strictEqual(res.code, -1)
    assert.ok(res.msg.includes('价格必须大于 0'))

    // 缺少图片应被拦截
    const resNoImg = await market.addMarketGoods('user_mock_001', {
      title: '高数课本',
      price: 20,
      images: []
    })
    assert.strictEqual(resNoImg.code, -1)
    assert.ok(resNoImg.msg.includes('请至少上传一张图片'))
  })

  test('Events Module: fetchActivityZoneConfigDoc reads config', async () => {
    const { db, _, cloud } = createMockDb()
    const events = createEventsModule({
      db,
      _,
      cloud,
      helpers: {
        isCollectionNotExistError: () => false,
        ensureCollection: async () => {},
        activityZoneCore: {
          isActivityZoneRunning: (doc) => !!(doc && doc.enabled),
          parseActivityEndAt: () => null,
          normalizeCampusIds: (ids) => ids || ['all'],
          announcementTargetsCampus: () => true
        },
        checkAdmin: async () => true,
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID,
        announcementTargetsCampus: () => true,
        normalizeCampusIds: (ids) => ids || ['all']
      }
    })

    const doc = await events.fetchActivityZoneConfigDoc()
    assert.ok(doc)
    assert.strictEqual(doc.enabled, true)
    assert.strictEqual(doc.roundId, 'r1')
  })

  test('Buddies Module: addBuddyPost and application workflow', async () => {
    const { db, _, cloud } = createMockDb()
    const buddies = createBuddiesModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async () => ({ nickName: '羽毛球手', status: 'active' }),
        checkRateLimit: async () => true,
        checkBannedWords: () => ({ pass: true }),
        wxTextCheck: async () => ({ pass: true }),
        isCollectionNotExistError: () => false,
        ensureCollection: async () => {},
        campusWhereClause: () => ({}),
        resolveCampusIdForRead: (id) => id || DEFAULT_CAMPUS_ID,
        DEFAULT_CAMPUS_ID,
        escapeRegExp: (s) => s,
        triggerSubscribeNotify: async () => {}
      }
    })

    const createRes = await buddies.addBuddyPost('user_mock_001', {
      title: '周六花江操场羽毛球双打',
      category: 'sports',
      startAt: '2026-09-12 15:00',
      minPeople: 2,
      maxPeople: 4
    })
    assert.strictEqual(createRes.code, 0)
    assert.ok(createRes.data.id)

    const listRes = await buddies.getBuddyPosts({})
    assert.strictEqual(listRes.code, 0)
    assert.ok(listRes.data.length > 0)
  })

  test('Bridge Module: getLanguagePartners computes match', async () => {
    const { db, _, cloud } = createMockDb()
    const bridge = createBridgeModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async () => ({ nickName: '留学生David', status: 'active' }),
        isCollectionNotExistError: () => false,
        campusWhereClause: () => ({}),
        resolveCampusIdForRead: (id) => id || DEFAULT_CAMPUS_ID,
        DEFAULT_CAMPUS_ID
      }
    })

    const res = await bridge.getLanguagePartners({ currentOpenid: 'user_mock_001' })
    assert.strictEqual(res.code, 0)
    assert.ok(Array.isArray(res.data))
  })

  test('Mutual Module: addMutualPost and status update', async () => {
    const { db, _, cloud } = createMockDb()
    const mutual = createMutualModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async () => ({ nickName: '互助同学', status: 'active' }),
        checkBannedWords: () => ({ pass: true }),
        wxTextCheck: async () => ({ pass: true }),
        wxImageBatchCheck: async () => ({ pass: true }),
        isCollectionNotExistError: () => false,
        ensureCollection: async () => {},
        campusWhereClause: () => ({}),
        resolveCampusIdForRead: (id) => id || DEFAULT_CAMPUS_ID,
        DEFAULT_CAMPUS_ID,
        escapeRegExp: (s) => s,
        checkAdmin: async () => false
      }
    })

    const addRes = await mutual.addMutualPost('user_mock_001', {
      type: 'help',
      category: 'errand',
      title: '带份外卖到南苑4栋',
      content: '食堂二楼烤肉拌饭，麻烦顺路同学带一下',
      reward: '5元'
    })
    assert.strictEqual(addRes.code, 0)
    assert.ok(addRes.data.id)

    const updRes = await mutual.updateMutualPostStatus('user_mock_001', {
      id: addRes.data.id,
      status: 'resolved'
    })
    assert.strictEqual(updRes.code, 0)
  })
})

function describe(name, fn) {
  console.log(`\n--- ${name} ---`)
  fn()
}
function test(name, fn) {
  Promise.resolve(fn())
    .then(() => console.log(`  ✓ ${name}`))
    .catch((err) => {
      console.error(`  ✗ ${name}`)
      console.error(err)
      process.exitCode = 1
    })
}
