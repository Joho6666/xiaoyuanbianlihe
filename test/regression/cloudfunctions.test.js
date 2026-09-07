// test/regression/cloudfunctions.test.js - 云函数模块拆分回归测试
const assert = require('assert')

const createMarketModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/market')
const createEventsModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/events')
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
