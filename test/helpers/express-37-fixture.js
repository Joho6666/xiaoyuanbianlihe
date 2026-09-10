const { createExpressFixture } = require('./express-fixture')

async function createExpress37Fixture() {
  const fixture = createExpressFixture()
  const { express } = fixture
  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pricingMode: 'PER_PACKAGE',
    baseOrderPriceCents: 0,
    perPackagePriceCents: 300,
    extraPickupPointPriceCents: 0,
    pickupPoints: [
      { id: 'cainiao', name: '菜鸟驿站（南校区）', deliveryCampus: 'south' },
      { id: 'sf', name: '顺丰服务点', deliveryCampus: 'south' },
      { id: 'jd', name: '京东派配送点', deliveryCampus: 'south' },
      { id: 'north', name: '北区快递点', deliveryCampus: 'north' },
      { id: 'disabled', name: '停用点', deliveryCampus: 'south', enabled: false }
    ],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼', enabled: true }] }] }]
  })
  const profile = await express.createExpressDeliveryProfile('oid-student', { campusId: 'guit-hangtian', label: '我的宿舍', isSelf: true, recipientName: 'Student', contactPhone: '13800001234', deliveryCampus: 'south', dormArea: 'tianheyuan', dormBuildingId: 'south-6', roomNumber: '613' })
  return { ...fixture, profile: profile.data }
}

module.exports = { createExpress37Fixture }
