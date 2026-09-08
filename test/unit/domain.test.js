// test/unit/domain.test.js - 核心领域模型单元测试
const assert = require('assert')
const path = require('path')

const {
  isValidInternalUserId,
  deriveDeterministicUserId,
  createUserEntity
} = require('../../shared/domain/user')

const {
  AUTH_PROVIDERS,
  createAuthIdentity,
  resolveWechatMiniIdentity
} = require('../../shared/domain/identity')

const {
  CONVERSATION_TYPES,
  CONVERSATION_CONTEXT_TYPES,
  deriveDirectConversationId,
  createConversationEntity,
  createMessageEntity,
  adaptLegacyMessageToUnified
} = require('../../shared/domain/conversation')

const {
  BUDDY_STATUS,
  BUDDY_CATEGORIES,
  createBuddyPostEntity,
  canTransitionBuddyStatus,
  computeBuddyRecommendScore
} = require('../../shared/domain/buddy')

const {
  PROFICIENCY_LEVELS,
  createUserLanguage,
  evaluateLanguageExchangeMatch
} = require('../../shared/domain/language')

const {
  MUTUAL_TYPES,
  MUTUAL_STATUS,
  createMutualPostEntity,
  canTransitionMutualStatus
} = require('../../shared/domain/mutual')

describe('Unified Domain Model Tests', () => {
  test('User: deriveDeterministicUserId produces stable valid UUID', () => {
    const openid = 'oUpF8uMuAJO_M2pxb1Q9zNjWeS6o'
    const uuid1 = deriveDeterministicUserId(openid)
    const uuid2 = deriveDeterministicUserId(openid)

    assert.strictEqual(uuid1, uuid2, 'Deterministic UUID must be identical for identical openid')
    assert.strictEqual(isValidInternalUserId(uuid1), true, 'Derived ID must match UUID format')

    const otherUuid = deriveDeterministicUserId('oUpF8uMuAJO_different_openid_123')
    assert.notStrictEqual(uuid1, otherUuid, 'Different openids must yield different UUIDs')
  })

  test('User: createUserEntity provides valid defaults', () => {
    const user = createUserEntity({
      numericId: '10002345',
      nickname: '航天同学',
      gender: 'male',
      schoolId: 'guit'
    })

    assert.strictEqual(isValidInternalUserId(user.id), true)
    assert.strictEqual(user.nickname, '航天同学')
    assert.strictEqual(user.gender, 'male')
    assert.strictEqual(user.studentType, 'chinese_student')
    assert.strictEqual(user.status, 'active')
  })

  test('Identity: createAuthIdentity creates valid provider mapping', () => {
    const userId = deriveDeterministicUserId('test_openid')
    const identity = createAuthIdentity(userId, AUTH_PROVIDERS.WECHAT_MINI, 'test_openid')

    assert.strictEqual(identity.userId, userId)
    assert.strictEqual(identity.provider, 'wechat_mini')
    assert.strictEqual(identity.providerKey, 'test_openid')
  })

  test('Identity: resolveWechatMiniIdentity resolves existing or creates new', () => {
    const openid = 'wx_test_openid_999'
    const res = resolveWechatMiniIdentity(openid)

    assert.strictEqual(res.isNew, true)
    assert.strictEqual(isValidInternalUserId(res.userId), true)
    assert.strictEqual(res.identity.providerKey, openid)

    // Existing identity
    const existing = [{ userId: 'uuid-1234', provider: 'wechat_mini', providerKey: openid }]
    const resExisting = resolveWechatMiniIdentity(openid, existing)
    assert.strictEqual(resExisting.isNew, false)
    assert.strictEqual(resExisting.userId, 'uuid-1234')
  })

  test('Conversation: deriveDirectConversationId is symmetric', () => {
    const userA = 'user-aaa-111'
    const userB = 'user-bbb-222'

    const id1 = deriveDirectConversationId(userA, userB)
    const id2 = deriveDirectConversationId(userB, userA)

    assert.strictEqual(id1, id2, 'A->B and B->A must result in identical conversationId')
    assert.ok(id1.startsWith('conv_dm_'))
  })

  test('Conversation: adaptLegacyMessageToUnified adapts goods share', () => {
    const legacyMsg = {
      _id: 'msg_001',
      fromOpenid: 'openid_a',
      toOpenid: 'openid_b',
      type: 'goods_share',
      content: '[商品分享]',
      shareData: {
        id: 'goods_999',
        title: '九成新自行车',
        price: 150
      },
      createTime: new Date()
    }

    const unified = adaptLegacyMessageToUnified(legacyMsg)
    assert.strictEqual(unified.id, 'msg_001')
    assert.strictEqual(unified.type, 'card')
    assert.strictEqual(unified.cardPayload.type, 'goods')
    assert.strictEqual(unified.cardPayload.id, 'goods_999')
    assert.strictEqual(unified.cardPayload.price, 150)
  })

  test('Buddy: status transition validator', () => {
    assert.strictEqual(canTransitionBuddyStatus(BUDDY_STATUS.OPEN, BUDDY_STATUS.FULL), true)
    assert.strictEqual(canTransitionBuddyStatus(BUDDY_STATUS.FULL, BUDDY_STATUS.FINISHED), true)
    assert.strictEqual(canTransitionBuddyStatus(BUDDY_STATUS.OPEN, BUDDY_STATUS.CANCELLED), true)
    assert.strictEqual(canTransitionBuddyStatus(BUDDY_STATUS.FINISHED, BUDDY_STATUS.OPEN), false)
  })

  test('Buddy: computeBuddyRecommendScore computes explainable score and handles missing interests', () => {
    assert.ok(BUDDY_CATEGORIES.length >= 8)
    const upcomingPost = {
      startAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      campusId: 'guit-hangtian',
      category: 'sport',
      title: '羽毛球双打',
      status: BUDDY_STATUS.OPEN
    }

    // User in same campus with matching interest
    const scoreWithInterest = computeBuddyRecommendScore(upcomingPost, {
      campusId: 'guit-hangtian',
      interests: ['羽毛球', '运动']
    })
    assert.ok(scoreWithInterest >= 80, `Expected score >= 80, got ${scoreWithInterest}`)

    // User in different campus without interests (must not crash, handles fallback weights)
    const scoreNoInterest = computeBuddyRecommendScore(upcomingPost, {
      campusId: 'other-campus'
    })
    assert.ok(typeof scoreNoInterest === 'number')
    assert.ok(scoreWithInterest > scoreNoInterest)
  })

  test('Language: evaluateLanguageExchangeMatch detects mutual complementarity', () => {
    // User A: speaks native Chinese, wants to learn English
    const userALangs = [
      createUserLanguage('userA', 'zh', PROFICIENCY_LEVELS.NATIVE, false),
      createUserLanguage('userA', 'en', PROFICIENCY_LEVELS.BEGINNER, true)
    ]
    // User B: speaks native English, wants to learn Chinese
    const userBLangs = [
      createUserLanguage('userB', 'en', PROFICIENCY_LEVELS.NATIVE, false),
      createUserLanguage('userB', 'zh', PROFICIENCY_LEVELS.INTERMEDIATE, true)
    ]

    const match = evaluateLanguageExchangeMatch(userALangs, userBLangs)
    assert.strictEqual(match.isMatch, true)
    assert.ok(match.score >= 100)
    assert.deepStrictEqual(match.aTeachesB, ['zh'])
    assert.deepStrictEqual(match.bTeachesA, ['en'])
  })

  test('Mutual: createMutualPostEntity validates and creates entity', () => {
    const post = createMutualPostEntity({
      authorId: 'user_123',
      type: MUTUAL_TYPES.HELP,
      category: 'errand',
      title: '帮忙带饭至4栋',
      content: '食堂二楼烤肉拌饭，带到4栋楼下，感谢同学！',
      reward: '5元红包'
    })

    assert.ok(post.id.startsWith('mutual_'))
    assert.strictEqual(post.authorId, 'user_123')
    assert.strictEqual(post.type, 'help')
    assert.strictEqual(post.status, 'open')
    assert.strictEqual(post.reward, '5元红包')
  })

  test('Mutual: canTransitionMutualStatus enforces lifecycle transitions', () => {
    assert.strictEqual(canTransitionMutualStatus(MUTUAL_STATUS.OPEN, MUTUAL_STATUS.IN_PROGRESS), true)
    assert.strictEqual(canTransitionMutualStatus(MUTUAL_STATUS.IN_PROGRESS, MUTUAL_STATUS.RESOLVED), true)
    assert.strictEqual(canTransitionMutualStatus(MUTUAL_STATUS.RESOLVED, MUTUAL_STATUS.OPEN), false)
  })
})

// Lightweight test runner shim when executed directly
function describe(name, fn) {
  console.log(`\n--- ${name} ---`)
  fn()
}
function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}
