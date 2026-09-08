// test/regression/cloudfunctions.test.js - 云函数模块拆分回归测试
const assert = require('assert')

const createMarketModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/market')
const createEventsModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/events')
const createBuddiesModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/buddies')
const createBridgeModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/bridge')
const createMutualModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/mutual')
const { makeDeterministicId } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/id')
const {
  resolveCampusIdForRead,
  campusWhereClause,
  DEFAULT_CAMPUS_ID
} = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')

// Lightweight CloudBase In-Memory Mock with Transaction support
function createMockDb() {
  const store = {
    market_goods: [],
    market_favors: [],
    market_wants: [],
    market_comments: [],
    activity_zone: [{ _id: 'config', enabled: true, roundId: 'r1', slides: [{ title: '迎新音乐节' }] }],
    posts: [],
    users: [{ _openid: 'user_mock_001', nickName: '测试同学', campusId: 'guit-hangtian', status: 'active' }],
    buddy_posts: [],
    buddy_applications: [],
    mutual_posts: []
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
        set: async ({ data }) => {
          const idx = items.findIndex((i) => i._id === id)
          const row = { _id: id, ...JSON.parse(JSON.stringify(data)) }
          if (idx >= 0) items[idx] = row
          else items.push(row)
          return { _id: id }
        },
        update: async ({ data }) => {
          const found = items.find((i) => i._id === id)
          if (found) Object.assign(found, JSON.parse(JSON.stringify(data)))
          return { stats: { updated: found ? 1 : 0 } }
        }
      }),
      where: (queryObj = {}) => ({
        orderBy: () => ({
          skip: () => ({
            limit: () => ({
              get: async () => ({ data: items.map((x) => JSON.parse(JSON.stringify(x))) })
            })
          }),
          limit: () => ({
            get: async () => ({ data: items.map((x) => JSON.parse(JSON.stringify(x))) })
          }),
          get: async () => ({ data: items.map((x) => JSON.parse(JSON.stringify(x))) })
        }),
        get: async () => {
          let filtered = [...items]
          if (queryObj && typeof queryObj === 'object') {
            filtered = items.filter((item) => {
              for (const k of Object.keys(queryObj)) {
                if (k.startsWith('$') || typeof queryObj[k] === 'function' || (queryObj[k] && queryObj[k].operator)) continue
                if (item[k] !== queryObj[k]) return false
              }
              return true
            })
          }
          return { data: filtered.map((x) => JSON.parse(JSON.stringify(x))) }
        },
        count: async () => ({ total: items.length }),
        limit: () => ({
          get: async () => {
            let filtered = [...items]
            if (queryObj && typeof queryObj === 'object') {
              filtered = items.filter((item) => {
                for (const k of Object.keys(queryObj)) {
                  if (k.startsWith('$') || typeof queryObj[k] === 'function' || (queryObj[k] && queryObj[k].operator)) continue
                  if (item[k] !== queryObj[k]) return false
                }
                return true
              })
            }
            return { data: filtered.map((x) => JSON.parse(JSON.stringify(x))) }
          }
        })
      }),
      add: async ({ data }) => {
        const _id = data._id || `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`
        const row = { _id, ...JSON.parse(JSON.stringify(data)) }
        items.push(row)
        return { _id }
      }
    }
  }

  const db = {
    serverDate: () => new Date(),
    RegExp: ({ regexp }) => new RegExp(regexp, 'i'),
    collection: createCollection,
    startTransaction: async () => {
      const snapshot = JSON.stringify(store)
      let isRolledBack = false
      let isCommitted = false
      return {
        collection: createCollection,
        commit: async () => {
          if (isRolledBack) throw new Error('Cannot commit rolled back transaction')
          isCommitted = true
        },
        rollback: async () => {
          if (isCommitted) throw new Error('Cannot rollback committed transaction')
          isRolledBack = true
          const restored = JSON.parse(snapshot)
          for (const k of Object.keys(store)) delete store[k]
          Object.assign(store, restored)
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

describe('Campus Helper Regression Tests', () => {
  test('resolveCampusIdForRead handles string campusId', () => {
    assert.strictEqual(resolveCampusIdForRead('guit-hangtian'), 'guit-hangtian')
    assert.strictEqual(resolveCampusIdForRead('  guet-huajiang  '), 'guet-huajiang')
  })

  test('resolveCampusIdForRead handles object campusId', () => {
    assert.strictEqual(resolveCampusIdForRead({ campusId: 'gxnu-yanshan' }), 'gxnu-yanshan')
    assert.strictEqual(resolveCampusIdForRead({ campusId: '  glut-pingfeng  ' }), 'glut-pingfeng')
    assert.strictEqual(resolveCampusIdForRead({ campusId: '' }), null)
    assert.strictEqual(resolveCampusIdForRead({}), null)
  })

  test('resolveCampusIdForRead handles empty/null campusId', () => {
    assert.strictEqual(resolveCampusIdForRead(''), null)
    assert.strictEqual(resolveCampusIdForRead('   '), null)
    assert.strictEqual(resolveCampusIdForRead(null), null)
    assert.strictEqual(resolveCampusIdForRead(undefined), null)
    assert.strictEqual(resolveCampusIdForRead(123), null)
  })

  test('campusWhereClause handles default campus', () => {
    const _ = { or: (arr) => ({ op: 'or', arr }), exists: () => ({ op: 'exists' }) }
    const res = campusWhereClause(_, DEFAULT_CAMPUS_ID)
    assert.strictEqual(res.op, 'or')
    assert.strictEqual(res.arr[0].campusId, DEFAULT_CAMPUS_ID)

    // Also supports (campusId) single argument
    const resSingle = campusWhereClause(DEFAULT_CAMPUS_ID)
    assert.deepStrictEqual(resSingle, { campusId: DEFAULT_CAMPUS_ID })
  })

  test('campusWhereClause handles other campus and null', () => {
    const res = campusWhereClause('guet-huajiang')
    assert.deepStrictEqual(res, { campusId: 'guet-huajiang' })

    const resNull = campusWhereClause(null)
    assert.strictEqual(resNull, null)

    const resEmpty = campusWhereClause('   ')
    assert.strictEqual(resEmpty, null)
  })
})

describe('Cloud Function Modules Regression Tests', () => {
  test('Shared: makeDeterministicId produces stable scoped ids', () => {
    const id1 = makeDeterministicId('want', 'openidA', 'goodsB')
    const id2 = makeDeterministicId('want', 'openidA', 'goodsB')
    assert.strictEqual(id1, id2)
    assert.ok(id1.startsWith('want_'))
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
        campusWhereClause: (cid) => campusWhereClause(_, cid),
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

  test('Buddies Module: addBuddyPost and application workflow with real helpers', async () => {
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
        campusWhereClause: (cid) => campusWhereClause(_, cid),
        resolveCampusIdForRead,
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
      maxPeople: 3,
      campusId: 'guet-huajiang'
    })
    assert.strictEqual(createRes.code, 0)
    assert.ok(createRes.data.id)

    const listRes = await buddies.getBuddyPosts({ campusId: 'guet-huajiang' })
    assert.strictEqual(listRes.code, 0)
    assert.ok(listRes.data.length > 0)
  })

  test('Buddies Module: transactional approval and capacity limit prevents over-acceptance', async () => {
    const { db, _, cloud, store } = createMockDb()
    const buddies = createBuddiesModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async (oid) => ({ nickName: `用户_${oid}`, status: 'active' }),
        checkRateLimit: async () => true,
        checkBannedWords: () => ({ pass: true }),
        wxTextCheck: async () => ({ pass: true }),
        isCollectionNotExistError: () => false,
        ensureCollection: async () => {},
        campusWhereClause: (cid) => campusWhereClause(_, cid),
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID,
        escapeRegExp: (s) => s,
        triggerSubscribeNotify: async () => {}
      }
    })

    // 创建一个上限为 2 人（含发起人）的组局，当前 acceptedCount 为 1
    const createRes = await buddies.addBuddyPost('host_user', {
      title: '自习组局',
      category: 'study',
      startAt: '2026-09-12 19:00',
      minPeople: 2,
      maxPeople: 2,
      campusId: DEFAULT_CAMPUS_ID
    })
    const postId = createRes.data.id

    // 用户 1 提交申请
    const apply1 = await buddies.applyBuddyPost('applicant_1', {
      postId,
      message: '我想一起自习'
    })
    assert.strictEqual(apply1.code, 0)
    const app1Id = apply1.data.id

    // 用户 2 提交申请
    const apply2 = await buddies.applyBuddyPost('applicant_2', {
      postId,
      message: '我也来'
    })
    assert.strictEqual(apply2.code, 0)
    const app2Id = apply2.data.id

    // 审批通过用户 1
    const accept1 = await buddies.handleBuddyApplication('host_user', {
      applicationId: app1Id,
      action: 'ACCEPT'
    })
    assert.strictEqual(accept1.code, 0)

    // 组局状态应自动转为 FULL，acceptedCount = 2
    const postInStore = store.buddy_posts.find((p) => p._id === postId)
    assert.strictEqual(postInStore.status, 'FULL')
    assert.strictEqual(postInStore.acceptedCount, 2)

    // 再次尝试通过用户 2，必须被拦截，不能超过 maxPeople
    const accept2 = await buddies.handleBuddyApplication('host_user', {
      applicationId: app2Id,
      action: 'ACCEPT'
    })
    assert.strictEqual(accept2.code, -1)
    assert.ok(accept2.msg.includes('人数已满') || accept2.msg.includes('不在招募状态'))

    // 验证最终并未超员
    assert.strictEqual(postInStore.acceptedCount, 2)

    // 用户 2 撤销申请
    const cancelRes = await buddies.cancelBuddyApplication('applicant_2', {
      applicationId: app2Id
    })
    assert.strictEqual(cancelRes.code, 0)
    const app2InStore = store.buddy_applications.find((a) => a._id === app2Id)
    assert.strictEqual(app2InStore.status, 'CANCELLED')
  })

  test('Bridge Module: getLanguagePartners uses real campus helper', async () => {
    const { db, _, cloud } = createMockDb()
    const bridge = createBridgeModule({
      db,
      _,
      cloud,
      helpers: {
        getUserForAction: async () => ({ nickName: '留学生David', status: 'active' }),
        isCollectionNotExistError: () => false,
        campusWhereClause: (cid) => campusWhereClause(_, cid),
        resolveCampusIdForRead,
        DEFAULT_CAMPUS_ID
      }
    })

    const res = await bridge.getLanguagePartners({ currentOpenid: 'user_mock_001', campusId: DEFAULT_CAMPUS_ID })
    assert.strictEqual(res.code, 0)
    assert.ok(Array.isArray(res.data))
  })

  test('Mutual Module: addMutualPost and status update with real helpers', async () => {
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
        campusWhereClause: (cid) => campusWhereClause(_, cid),
        resolveCampusIdForRead,
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
      reward: '5元',
      campusId: 'guit-hangtian'
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
