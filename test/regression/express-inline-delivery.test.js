const assert = require('assert')
const { createExpress37Fixture } = require('../helpers/express-37-fixture')

async function run() {
  const { express } = await createExpress37Fixture()
  const items = [{ pickupPointId: 'cainiao', pickupCode: 'inline-1', packageCount: 1 }]
  const self = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', pickupItems: items, deliveryData: { isSelf: true, label: '我的宿舍', recipientName: 'Inline Self', contactPhone: '13800001234', deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '613' }, saveDeliveryProfile: false, clientRequestId: 'inline-self' })
  assert.equal(self.code, 0)
  assert.ok(self.data.deliveryProfileId, 'self inline checkout atomically creates a profile')
  const selfProfiles = await express.getMyExpressDeliveryProfiles('oid-student')
  assert.equal(selfProfiles.data.length, 2)
  assert.equal(selfProfiles.data.some((profile) => profile.recipientName === 'Inline Self' && profile.isDefault), true)

  const other = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', pickupItems: items, deliveryData: { isSelf: false, label: '未保存室友', recipientName: 'Roommate', contactPhone: '18600005678', deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '614' }, saveDeliveryProfile: false, clientRequestId: 'inline-other' })
  assert.equal(other.code, 0)
  assert.equal(other.data.deliveryProfileId, null)
  const afterOther = await express.getMyExpressDeliveryProfiles('oid-student')
  assert.equal(afterOther.data.length, 2, 'other recipient is not saved when the checkbox is off')
  assert.equal(other.data.recipientNameSnapshot, 'Roommate')
  const savedOther = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', pickupItems: [{ pickupPointId: 'cainiao', pickupCode: 'inline-saved', packageCount: 1 }], deliveryData: { isSelf: false, label: '常用室友', recipientName: 'Saved Roommate', contactPhone: '18600005678', deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '614' }, saveDeliveryProfile: true, clientRequestId: 'inline-other-saved' })
  assert.equal(savedOther.code, 0)
  assert.ok(savedOther.data.deliveryProfileId)
  assert.equal((await express.getMyExpressDeliveryProfiles('oid-student')).data.length, 3)
  console.log('PASS Express inline delivery: same-page address data, atomic self profile save, optional other recipient save')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
