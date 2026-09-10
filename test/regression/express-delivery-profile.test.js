const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')

const address = {
  campusId: 'guit-hangtian',
  schoolId: 'guat',
  deliveryCampus: 'south',
  dormArea: 'tianheyuan',
  dormBuildingId: 'south-6',
  roomNumber: '613'
}

async function run() {
  const { express, store } = createExpressFixture()
  store.users.push({ _id: 'other', _openid: 'oid-other', internalUserId: 'other-id', role: 'user', status: 'active', campusId: 'guit-hangtian', nickName: 'Other' })
  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pickupPoints: [{ id: 'point', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' }],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼', enabled: true }] }] }]
  })

  const mine = await express.createExpressDeliveryProfile('oid-student', {
    ...address,
    label: '我的宿舍',
    isSelf: true,
    recipientName: 'Joho',
    contactPhone: '13800001234'
  })
  assert.equal(mine.code, 0)
  assert.equal(mine.data.isDefault, true, 'the first active profile becomes default')

  const roommate = await express.createExpressDeliveryProfile('oid-student', {
    ...address,
    label: '小林',
    isSelf: false,
    recipientName: '小林',
    contactPhone: '18600005678',
    roomNumber: '412'
  })
  assert.equal(roommate.code, 0)
  assert.equal(roommate.data.isDefault, false)

  const setDefault = await express.setDefaultExpressDeliveryProfile('oid-student', { profileId: roommate.data._id })
  assert.equal(setDefault.code, 0)
  const profiles = await express.getMyExpressDeliveryProfiles('oid-student')
  assert.equal(profiles.data.filter((item) => item.isDefault).length, 1)
  assert.equal(profiles.data.find((item) => item.isDefault)._id, roommate.data._id)

  const foreignUpdate = await express.updateExpressDeliveryProfile('oid-other', { profileId: roommate.data._id, label: '窃取资料' })
  assert.equal(foreignUpdate.statusCode, 404, 'another account cannot discover or update a profile')
  const foreignOrder = await express.createExpressOrder('oid-other', { pickupPointId: 'point', pickupCode: 'A-2', packageCount: 1, clientRequestId: 'other-profile', deliveryProfileId: roommate.data._id })
  assert.equal(foreignOrder.statusCode, 404, 'another account cannot order with someone else’s profile')

  const order = await express.createExpressOrder('oid-student', {
    pickupPointId: 'point',
    pickupCode: 'A-3',
    packageCount: 1,
    clientRequestId: 'profile-snapshot',
    deliveryProfileId: roommate.data._id,
    recipientName: '伪造姓名',
    phone: '13999999999',
    roomNumber: '999'
  })
  assert.equal(order.code, 0)
  assert.equal(order.data.recipientNameSnapshot, '小林')
  assert.equal(order.data.recipientPhoneSnapshot, '18600005678')
  assert.equal(order.data.roomNumberSnapshot, '412')

  await express.updateExpressDeliveryProfile('oid-student', { profileId: roommate.data._id, roomNumber: '615' })
  const historic = await express.getMyExpressOrder('oid-student', { orderId: order.data._id })
  assert.equal(historic.data.roomNumberSnapshot, '412', 'historical order address does not change after profile edit')

  const archived = await express.archiveExpressDeliveryProfile('oid-student', { profileId: roommate.data._id })
  assert.equal(archived.code, 0)
  const afterArchive = await express.getMyExpressDeliveryProfiles('oid-student')
  assert.equal(afterArchive.data.length, 1)
  assert.equal(afterArchive.data[0]._id, mine.data._id)
  assert.equal(afterArchive.data[0].isDefault, true, 'archiving the default promotes the remaining active profile')

  for (let index = 0; index < 9; index += 1) {
    const extra = await express.createExpressDeliveryProfile('oid-student', { ...address, label: `备用${index + 1}`, isSelf: true, recipientName: 'Joho', contactPhone: '13800001234', roomNumber: `6${index + 1}` })
    assert.equal(extra.code, 0)
  }
  const overflow = await express.createExpressDeliveryProfile('oid-student', { ...address, label: '超出上限', isSelf: false, recipientName: '小赵', contactPhone: '13700001234' })
  assert.equal(overflow.code, -1)

  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pickupPoints: [{ id: 'point', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' }],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼', enabled: false }] }] }]
  })
  const disabledAddress = await express.createExpressOrder('oid-student', { pickupPointId: 'point', pickupCode: 'A-4', packageCount: 1, clientRequestId: 'disabled-profile', deliveryProfileId: mine.data._id })
  assert.equal(disabledAddress.code, -1)
  assert.match(disabledAddress.msg, /地址已失效/)

  console.log('PASS Express delivery profiles: account ownership, defaults, recipient snapshots, archive compatibility')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
