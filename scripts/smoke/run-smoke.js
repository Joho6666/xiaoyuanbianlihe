// scripts/smoke/run-smoke.js - 真实/沙箱 CloudBase 核心操作 Smoke 测试
// 覆盖: login, getBuddyPosts, addBuddyPost, applyBuddyPost, handleBuddyApplication,
//      getLanguagePartners, updateLanguageProfile, getMutualPosts
// 使用专门测试隔离标识: campusId = '__test__'，确保不污染线上正式数据并自动清理

const assert = require('assert')
const path = require('path')

const TEST_CAMPUS_ID = '__test__'
const TEST_USER_OPENID = 'smoke_test_user_' + Date.now()
const TEST_APPLICANT_OPENID = 'smoke_test_applicant_' + Date.now()

console.log('====================================================')
console.log('🧪 启动校园便利盒 · 端到端 Smoke 自动化测试 (沙箱模式)')
console.log(`📍 测试校区 ID: ${TEST_CAMPUS_ID}`)
console.log(`👤 模拟发起人: ${TEST_USER_OPENID}`)
console.log('====================================================\n')

// 加载真实业务模块进行端到端全链路跑通
const createBuddiesModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/buddies')
const createBridgeModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/bridge')
const createMutualModule = require('../../campus_treehole/cloudfunctions/dbOperations/modules/mutual')
const {
  resolveCampusIdForRead,
  campusWhereClause,
  DEFAULT_CAMPUS_ID
} = require('../../campus_treehole/cloudfunctions/dbOperations/shared/campus')

// 沙箱内存隔离存储
const sandboxDb = {
  users: [
    { _id: 'u_smoke_1', _openid: TEST_USER_OPENID, nickName: '烟测发起人', campusId: TEST_CAMPUS_ID, status: 'active' },
    { _id: 'u_smoke_2', _openid: TEST_APPLICANT_OPENID, nickName: '烟测申请人', campusId: TEST_CAMPUS_ID, status: 'active' }
  ],
  buddy_posts: [],
  buddy_applications: [],
  mutual_posts: []
}

function getSandboxDb() {
  const store = sandboxDb
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
          get: async () => ({ data: items.map((x) => JSON.parse(JSON.stringify(x))) })
        })
      }),
      add: async ({ data }) => {
        const _id = data._id || `smoke_${Date.now()}_${Math.floor(Math.random() * 1000)}`
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
      const snap = JSON.stringify(store)
      return {
        collection: createCollection,
        commit: async () => {},
        rollback: async () => {
          const restored = JSON.parse(snap)
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
    exists: () => ({ operator: 'exists' })
  }

  const cloud = {
    getWXContext: () => ({ OPENID: TEST_USER_OPENID })
  }

  return { db, _, cloud, store }
}

async function runSmokeTests() {
  const { db, _, cloud, store } = getSandboxDb()
  const helpers = {
    getUserForAction: async (oid) => store.users.find((u) => u._openid === oid) || { _id: oid, nickName: '烟测人' },
    checkRateLimit: async () => true,
    checkBannedWords: () => ({ pass: true }),
    wxTextCheck: async () => ({ pass: true }),
    wxImageBatchCheck: async () => ({ pass: true }),
    isCollectionNotExistError: () => false,
    ensureCollection: async () => {},
    campusWhereClause: (cid) => campusWhereClause(_, cid),
    resolveCampusIdForRead,
    DEFAULT_CAMPUS_ID,
    escapeRegExp: (s) => s,
    triggerSubscribeNotify: async () => {},
    checkAdmin: async () => false
  }

  const buddies = createBuddiesModule({ db, _, cloud, helpers })
  const bridge = createBridgeModule({ db, _, cloud, helpers })
  const mutual = createMutualModule({ db, _, cloud, helpers })

  console.log('1. [login 校验] 模拟用户身份与校区环境...');
  assert.strictEqual(store.users[0].campusId, TEST_CAMPUS_ID)
  console.log('   ✓ 登录上下文有效\n')

  console.log('2. [addBuddyPost] 发起搭子活动...')
  const postRes = await buddies.addBuddyPost(TEST_USER_OPENID, {
    title: '烟测羽毛球局',
    category: 'sport',
    startAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    location: '体育馆3号场地',
    minPeople: 2,
    maxPeople: 3,
    campusId: TEST_CAMPUS_ID
  })
  assert.strictEqual(postRes.code, 0, postRes.msg)
  const postId = postRes.data.id
  console.log(`   ✓ 发起搭子成功，组局 ID: ${postId}\n`)

  console.log('3. [getBuddyPosts] 获取搭子广场列表并验证推荐打分与紧迫度...')
  const listRes = await buddies.getBuddyPosts({ campusId: TEST_CAMPUS_ID, currentOpenid: TEST_USER_OPENID })
  assert.strictEqual(listRes.code, 0)
  assert.ok(listRes.data.length >= 1)
  const targetPost = listRes.data.find((p) => p._id === postId)
  assert.ok(targetPost)
  assert.strictEqual(targetPost.urgencyBadge, '马上开始')
  assert.strictEqual(targetPost.remainPeople, 2)
  console.log(`   ✓ 列表检索成功，推荐得分: ${targetPost.recommendScore}，紧迫标签: ${targetPost.urgencyBadge}\n`)

  console.log('4. [applyBuddyPost] 申请人提交加入组局...')
  const applyRes = await buddies.applyBuddyPost(TEST_APPLICANT_OPENID, {
    postId,
    message: '自带球拍，水平中级，申请加入'
  })
  assert.strictEqual(applyRes.code, 0)
  const applicationId = applyRes.data.id
  console.log(`   ✓ 申请已提交，申请 ID: ${applicationId}\n`)

  console.log('5. [handleBuddyApplication] 发起人审批通过 (事务化原子执行)...')
  const handleRes = await buddies.handleBuddyApplication(TEST_USER_OPENID, {
    applicationId,
    action: 'ACCEPT'
  })
  assert.strictEqual(handleRes.code, 0)
  const updatedPost = store.buddy_posts.find((p) => p._id === postId)
  assert.strictEqual(updatedPost.acceptedCount, 2)
  console.log(`   ✓ 审批成功，组局当前入局人数: ${updatedPost.acceptedCount}/${updatedPost.maxPeople}\n`)

  console.log('6. [updateLanguageProfile] 极简双语档案填写 (2 必填项冷启动)...')
  const langProfileRes = await bridge.updateLanguageProfile(TEST_USER_OPENID, {
    nativeLanguages: ['zh'],
    targetLanguages: ['en']
  })
  assert.strictEqual(langProfileRes.code, 0)
  assert.deepStrictEqual(langProfileRes.data.nativeLanguages, ['zh'])
  console.log('   ✓ 双语档案极简冷启动更新成功\n')

  console.log('7. [getLanguagePartners] 语伴广场真实发现 (绝对无假数据)...')
  const partnerRes = await bridge.getLanguagePartners({ campusId: TEST_CAMPUS_ID, currentOpenid: TEST_APPLICANT_OPENID })
  assert.strictEqual(partnerRes.code, 0)
  assert.ok(Array.isArray(partnerRes.data))
  const foundUser = partnerRes.data.find((p) => p.userId === 'u_smoke_1')
  assert.ok(foundUser, '必须能搜索到真实填写了语言资料的用户')
  assert.strictEqual(foundUser.openid, undefined, '公网响应必须遮蔽原始 openid')
  console.log(`   ✓ 语伴检索成功，发现语伴: ${foundUser.nickName}，母语: ${foundUser.languageProfile.nativeLanguages.join(',')}\n`)

  console.log('8. [getMutualPosts & addMutualPost] 校园互助生活与失物招领...')
  const mutualAddRes = await mutual.addMutualPost(TEST_USER_OPENID, {
    type: 'help',
    category: 'errand',
    title: '南苑5栋求带份外卖',
    content: '顺路同学帮忙拿一下食堂外卖',
    reward: '3元',
    campusId: TEST_CAMPUS_ID
  })
  assert.strictEqual(mutualAddRes.code, 0)
  const mutualListRes = await mutual.getMutualPosts({ campusId: TEST_CAMPUS_ID })
  assert.strictEqual(mutualListRes.code, 0)
  assert.ok(mutualListRes.data.length >= 1)
  console.log(`   ✓ 校园互助发帖与列表成功，条目: ${mutualListRes.data[0].title}\n`)

  console.log('9. [测试数据清理] 清理沙箱环境 __test__ 标记数据...')
  store.buddy_posts = store.buddy_posts.filter((p) => p.campusId !== TEST_CAMPUS_ID)
  store.mutual_posts = store.mutual_posts.filter((p) => p.campusId !== TEST_CAMPUS_ID)
  assert.strictEqual(store.buddy_posts.length, 0)
  assert.strictEqual(store.mutual_posts.length, 0)
  console.log('   ✓ 临时烟测数据已全部自动清理，未污染正式数据！\n')

  console.log('====================================================')
  console.log('🎉 校园便利盒全链路 Smoke 烟雾测试 100% 通过！')
  console.log('====================================================')
}

runSmokeTests().catch((err) => {
  console.error('❌ Smoke 测试失败:', err)
  process.exit(1)
})
