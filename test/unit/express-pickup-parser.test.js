const assert = require('assert')
const { parsePickupCandidates } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-pickup-parser')

function run() {
  const candidates = parsePickupCandidates([
    '菜鸟驿站（南区）',
    '取件码：A2-3-4587',
    '共2件',
    '手机号 13800001234'
  ].join('\n'), { sourceImageIndex: 2 })

  assert.strictEqual(candidates.length, 1)
  assert.strictEqual(candidates[0].pickupCode, 'A2-3-4587')
  assert.strictEqual(candidates[0].pickupPointText, '菜鸟驿站（南区）')
  assert.strictEqual(candidates[0].packageCount, 2)
  assert.strictEqual(candidates[0].sourceImageIndex, 2)
  assert.ok(candidates[0].confidence > 0)

  const mixed = parsePickupCandidates('顺丰服务点\nSF2831\n取件码：2-3-4587', { sourceImageIndex: 0 })
  assert.deepStrictEqual(mixed.map(item => item.pickupCode), ['SF2831', '2-3-4587'])
  assert.ok(!mixed.some(item => item.pickupCode === '13800001234'))

  const fallback = parsePickupCandidates('菜鸟驿站\n取件码：123456', { sourceImageIndex: 1 })
  assert.strictEqual(fallback[0].packageCount, 1)
  assert.ok(fallback[0].warnings.includes('packageCountDefaulted'))
  assert.ok(!parsePickupCandidates('通知日期：2026-09-10\n手机号：13800001234').length)
  console.log('PASS Express pickup parser: codes, counts, source image and phone filtering')
}

try { run() } catch (error) { console.error(error); process.exitCode = 1 }
