const assert = require('assert')
const { createExpressFixture } = require('../helpers/express-fixture')
const { createExpressImportModule, validateTemporaryImageReference, mergeImportedCandidates } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-import')
const { createConfiguredOCRAdapter } = require('../../campus_treehole/cloudfunctions/dbOperations/modules/express-ocr')

async function run() {
  const fixture = createExpressFixture()
  const { express, cloud } = fixture
  await express.ownerUpdateExpressSettings('oid-owner', {
    acceptingOrders: true,
    basePriceCents: 300,
    pickupPoints: [
      { id: 'sf', name: '顺丰服务点', aliases: ['SF'], deliveryCampus: 'south' },
      { id: 'cainiao', name: '菜鸟驿站（南区）', aliases: ['菜鸟南区'], deliveryCampus: 'south' }
    ],
    deliveryCampuses: [{ id: 'south', name: '南校区', dormAreas: [{ id: 'tianheyuan', name: '天和苑', buildings: [{ id: 'south-6', name: '6号楼' }] }] }]
  })
  const settingsResponse = await express.getExpressServiceConfig('oid-student', { campusId: 'guit-hangtian' })
  assert.deepStrictEqual(settingsResponse.data.pickupPoints.find(item => item.id === 'sf').aliases, ['SF'])

  const user = fixture.store.users.find(item => item._openid === 'oid-student')
  const userId = user.internalUserId
  const requestId = 'req_screenshot_123'
  const fileId = `cloud://test-bucket/tmp/express-import/${userId}/${requestId}/11111111-1111-4111-8111-111111111111.jpg`
  cloud.files[fileId] = Buffer.from('mock-image')
  const importer = createExpressImportModule({
    cloud,
    getUserForAction: async openid => fixture.store.users.find(item => item._openid === openid),
    readSettings: async () => fixture.store.express_settings.find(item => item._id === 'guit-hangtian'),
    ocrAdapter: { recognize: async () => ({ text: '顺丰服务点\n取件码：SF2831\n2件' }) }
  })

  const result = await importer.recognizeExpressScreenshots('oid-student', { requestId, imageFileIds: [fileId], deliveryCampus: 'south' })
  assert.strictEqual(result.code, 0)
  assert.strictEqual(result.data.candidates[0].pickupPointId, 'sf')
  assert.strictEqual(result.data.candidates[0].pickupCode, 'SF2831')
  assert.strictEqual(result.data.candidates[0].packageCount, 2)
  assert.ok(!JSON.stringify(result).includes('mock-image'))
  assert.ok(!JSON.stringify(result).includes(fileId))
  assert.ok(!JSON.stringify(result).includes('TENCENT_SECRET'))
  assert.ok(cloud.deleted.includes(fileId))

  assert.strictEqual(createConfiguredOCRAdapter({ EXPRESS_OCR_PROVIDER: 'mock', APP_ENV: 'production', EXPRESS_OCR_MOCK_ALLOWED: 'true' }), null)
  assert.strictEqual(createConfiguredOCRAdapter({ EXPRESS_OCR_PROVIDER: 'tencent', APP_ENV: 'production', TCB_ENV_ID: 'test', EXPRESS_OCR_TEST_ENV_ID: 'test', TENCENT_OCR_SECRET_ID: 'TENCENT_SECRET', TENCENT_OCR_SECRET_KEY: 'key' }), null)

  const secondFileId = `cloud://test-bucket/tmp/express-import/${userId}/req_partial_123/22222222-2222-4222-8222-222222222222.jpg`
  const thirdFileId = `cloud://test-bucket/tmp/express-import/${userId}/req_partial_123/33333333-3333-4333-8333-333333333333.jpg`
  cloud.files[secondFileId] = Buffer.from('second')
  cloud.files[thirdFileId] = Buffer.from('third')
  const partialImporter = createExpressImportModule({
    cloud,
    getUserForAction: async openid => fixture.store.users.find(item => item._openid === openid),
    readSettings: async () => fixture.store.express_settings.find(item => item._id === 'guit-hangtian'),
    ocrAdapter: { recognize: async ({ sourceImageIndex }) => { if (sourceImageIndex === 1) throw new Error('provider unavailable'); return { text: '顺丰服务点\nSF2831' } } }
  })
  const partial = await partialImporter.recognizeExpressScreenshots('oid-student', { requestId: 'req_partial_123', imageFileIds: [secondFileId, thirdFileId], deliveryCampus: 'south' })
  assert.strictEqual(partial.code, 0)
  assert.strictEqual(partial.data.failedImages.length, 1)
  assert.strictEqual(partial.data.candidates.length, 1)
  assert.ok(cloud.deleted.includes(secondFileId) && cloud.deleted.includes(thirdFileId))

  const foreign = `cloud://test-bucket/tmp/express-import/other-user/${requestId}/22222222-2222-4222-8222-222222222222.jpg`
  assert.throws(() => validateTemporaryImageReference(foreign, userId, requestId), /归属|路径/)
  const publicUrl = 'https://example.com/pickup.jpg'
  assert.throws(() => validateTemporaryImageReference(publicUrl, userId, requestId), /fileID|路径/)
  const validForMixedRequest = `cloud://test-bucket/tmp/express-import/${userId}/req_mixed_123/44444444-4444-4444-8444-444444444444.jpg`
  cloud.files[validForMixedRequest] = Buffer.from('mixed')
  const mixedValidation = await importer.recognizeExpressScreenshots('oid-student', { requestId: 'req_mixed_123', imageFileIds: [validForMixedRequest, publicUrl], deliveryCampus: 'south' })
  assert.strictEqual(mixedValidation.code, -1)
  assert.ok(cloud.deleted.includes(validForMixedRequest), 'validated temporary image must be cleaned when another reference is invalid')
  const duplicateRefs = await importer.recognizeExpressScreenshots('oid-student', { requestId, imageFileIds: [fileId, fileId], deliveryCampus: 'south' })
  assert.strictEqual(duplicateRefs.code, -1)

  const merged = mergeImportedCandidates({
    pickupGroups: [{ pickupPointId: 'sf', pickupPointName: '顺丰服务点', pointIndex: 0, items: [{ pickupCode: 'SF2831', packageCount: 1 }] }],
    candidates: [{ pickupPointId: 'sf', pickupPointName: '顺丰服务点', pickupCode: 'SF2831', packageCount: 2, matchStatus: 'MATCHED' }, { pickupPointId: 'sf', pickupPointName: '顺丰服务点', pickupCode: 'SF9999', packageCount: 1, matchStatus: 'MATCHED' }],
    pickupPoints: [{ id: 'sf', name: '顺丰服务点' }]
  })
  assert.strictEqual(merged.skipped, 1)
  assert.strictEqual(merged.pickupGroups[0].items.length, 2)
  assert.strictEqual(merged.pickupGroups[0].items[1].pickupCode, 'SF9999')

  const failureCloud = { ...cloud, deleteFile: async () => { throw new Error('cleanup failed') } }
  const failureImporter = createExpressImportModule({
    cloud: failureCloud,
    getUserForAction: async openid => fixture.store.users.find(item => item._openid === openid),
    readSettings: async () => fixture.store.express_settings.find(item => item._id === 'guit-hangtian'),
    ocrAdapter: { recognize: async () => ({ text: '顺丰服务点\nSF2831' }) }
  })
  const failed = await failureImporter.recognizeExpressScreenshots('oid-student', { requestId: 'req_cleanup_123', imageFileIds: [fileId], deliveryCampus: 'south' })
  assert.strictEqual(failed.code, -1)
  assert.match(failed.msg, /清理|临时截图/)
  console.log('PASS Express screenshot import: ownership, parser/matcher, response sanitization and cleanup failure')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
