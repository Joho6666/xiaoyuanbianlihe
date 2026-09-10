const assert = require('assert')
const ExcelJS = require('exceljs')
const { createExpress37Fixture } = require('../helpers/express-37-fixture')

async function run() {
  const { express, cloud, profile } = await createExpress37Fixture()
  const order = await express.createExpressOrder('oid-student', { campusId: 'guit-hangtian', deliveryProfileId: profile._id, pickupItems: [{ pickupPointId: 'cainiao', pickupCode: '2-3-4587', packageCount: 1 }, { pickupPointId: 'cainiao', pickupCode: '4-1-6532', packageCount: 1 }, { pickupPointId: 'sf', pickupCode: 'SF2831', packageCount: 1 }], clientRequestId: 'multi-export' })
  assert.equal((await express.createExpressTestPayment('oid-student', { orderId: order.data._id })).code, 0)
  const exported = await express.staffExportExpressOrders('oid-staff', { campusId: 'guit-hangtian' })
  assert.equal(exported.code, 0)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(cloud.uploads[0].fileContent)
  const pickup = workbook.getWorksheet('取件清单')
  const delivery = workbook.getWorksheet('配送清单')
  assert.equal(pickup.rowCount, 4, 'three pickup items produce three rows plus header')
  assert.equal(delivery.getColumn(1).values.filter(Boolean).length, 2, 'one order remains one delivery row')
  assert.equal(pickup.getRow(2).getCell(3).value, '2-3-4587')
  assert.equal(delivery.getRow(2).getCell(6).value, 'Student')
  assert.equal(delivery.getRow(2).getCell(7).value, '13800001234')
  assert.equal(delivery.getCell('M1').value, '统计')
  console.log('PASS Express multi-pickup export: one item per pickup row, one order per delivery row, summary')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
