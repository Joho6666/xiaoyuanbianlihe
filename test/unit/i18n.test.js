// test/unit/i18n.test.js - 国际化核心单元测试
const assert = require('assert')

// Mock wx.getStorageSync and wx.setStorageSync for pure Node.js test environment
const mockStorage = {}
global.wx = {
  getStorageSync: (key) => mockStorage[key],
  setStorageSync: (key, val) => { mockStorage[key] = val },
  removeStorageSync: (key) => { delete mockStorage[key] }
}

const i18n = require('../../campus_treehole/utils/i18n')

describe('i18n Core Tests', () => {
  test('i18n defaults to zh-CN', () => {
    mockStorage['campus_app_locale'] = undefined
    assert.strictEqual(i18n.getLocale(), 'zh-CN')
  })

  test('i18n setLocale switches and persists locale', () => {
    i18n.setLocale('en-US')
    assert.strictEqual(i18n.getLocale(), 'en-US')
    assert.strictEqual(mockStorage['campus_app_locale'], 'en-US')

    i18n.setLocale('zh-CN')
    assert.strictEqual(i18n.getLocale(), 'zh-CN')
  })

  test('i18n translates Chinese nested keys properly', () => {
    i18n.setLocale('zh-CN')
    assert.strictEqual(i18n.t('discover.title'), '发现')
    assert.strictEqual(i18n.t('discover.buddyTitle'), '同频搭子')
    assert.strictEqual(i18n.t('bridge.title'), '友桥 UniBridge')
  })

  test('i18n translates English nested keys properly', () => {
    i18n.setLocale('en-US')
    assert.strictEqual(i18n.t('discover.title'), 'Discover')
    assert.strictEqual(i18n.t('discover.buddyTitle'), 'Tongpin Buddy')
    assert.strictEqual(i18n.t('common.confirm'), 'Confirm')
  })

  test('i18n fallbacks to default key when translation missing', () => {
    i18n.setLocale('en-US')
    assert.strictEqual(i18n.t('non.existent.key'), 'non.existent.key')
  })
})

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
