const assert = require('assert')
const { matchPickupPoint, deduplicatePickupCandidates } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-pickup-matcher')

function run() {
  const points = [
    { id: 'sf', name: '顺丰服务点', shortName: '顺丰', aliases: ['SF'] , deliveryCampus: 'south', enabled: true },
    { id: 'cainiao', name: '菜鸟驿站（南区）', shortName: '菜鸟南区', aliases: ['菜鸟南区'], deliveryCampus: 'south', enabled: true },
    { id: 'disabled', name: '停用驿站', aliases: ['停用'], deliveryCampus: 'south', enabled: false }
  ]

  const matched = matchPickupPoint({ pickupPointText: 'SF快递', pickupCode: 'SF2831', confidence: 0.9 }, points, { deliveryCampus: 'south' })
  assert.strictEqual(matched.matchStatus, 'MATCHED')
  assert.strictEqual(matched.pickupPointId, 'sf')
  assert.strictEqual(matched.pickupPointName, '顺丰服务点')

  const review = matchPickupPoint({ pickupPointText: '驿站', pickupCode: 'A1234', confidence: 0.9 }, [
    { id: 'a', name: '南区驿站', aliases: ['驿站'], deliveryCampus: 'south', enabled: true },
    { id: 'b', name: '北区驿站', aliases: ['驿站'], deliveryCampus: 'south', enabled: true }
  ], { deliveryCampus: 'south' })
  assert.strictEqual(review.matchStatus, 'NEEDS_REVIEW')
  assert.strictEqual(review.pickupPointId, '')

  const deduped = deduplicatePickupCandidates([
    { id: 'low', pickupPointId: 'sf', pickupCode: 'sf2831', confidence: 0.7, warnings: [] },
    { id: 'high', pickupPointId: 'sf', pickupCode: 'SF2831', confidence: 0.95, warnings: [] },
    { id: 'other', pickupPointId: 'cainiao', pickupCode: 'SF2831', confidence: 0.8, warnings: [] }
  ])
  assert.strictEqual(deduped.length, 2)
  assert.strictEqual(deduped.find(item => item.pickupPointId === 'sf').id, 'high')
  assert.ok(deduped.find(item => item.pickupPointId === 'sf').warnings.includes('duplicateCandidate'))
  console.log('PASS Express pickup matcher: aliases, ambiguity, disabled points and dedupe')
}

try { run() } catch (error) { console.error(error); process.exitCode = 1 }
