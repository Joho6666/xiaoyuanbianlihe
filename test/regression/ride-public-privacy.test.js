// test/regression/ride-public-privacy.test.js - 拼车公开地点与身份隐私测试 (§25)
const assert = require('assert')
const { fixture } = require('../helpers/ride-fixture')

;(async () => {
  const f = await fixture()
  await f.addUser('author_a', { nickName: '阿强', avatarUrl: '/images/avatar_a.png' })
  await f.addUser('stranger_b')
  await f.addUser('member_c')

  const rideId = await f.publishRide('author_a', {
    maxPeople: 3,
    note: '赶高铁，南门集合'
  })

  // ===== 1. 广场（公开读）：地点降精度，不含精确坐标和详细地址 =====
  const squareRes = await f.ride.getRideSquare({ campusId: 'guit-hangtian' })
  assert.equal(squareRes.code, 0)
  const item = squareRes.data.list.find(r => r.id === rideId)
  assert.ok(item, 'ride in square')

  // 地点结构检查
  assert.ok(item.origin.poiId, 'has poiId')
  assert.ok(item.origin.name, 'has name')
  assert.ok(item.origin.shortName, 'has shortName')
  assert.strictEqual(item.origin.latitude, undefined, 'square origin must NOT contain latitude')
  assert.strictEqual(item.origin.longitude, undefined, 'square origin must NOT contain longitude')
  assert.strictEqual(item.origin.address, undefined, 'square origin must NOT contain address')

  assert.strictEqual(item.destination.latitude, undefined, 'square destination must NOT contain latitude')
  assert.strictEqual(item.destination.longitude, undefined, 'square destination must NOT contain longitude')
  assert.strictEqual(item.destination.address, undefined, 'square destination must NOT contain address')

  // 必须 NOT contain 敏感字段
  const rawJson = JSON.stringify(item)
  for (const forbidden of ['_openid', 'author_a', 'internalUserId', 'numericId', 'phone']) {
    assert.ok(!rawJson.includes(forbidden), `square item must not contain ${forbidden}`)
  }

  // 必须包含公开安全字段
  assert.equal(item.author.nickName, '阿强')
  assert.equal(item.author.avatarUrl, '/images/avatar_a.png')
  assert.ok(item.authorId, 'must have public authorId')
  assert.ok(item.authorId.length === 36, 'authorId is public UUID')

  // ===== 2. 详情页：非成员查看详情也是降精度地点 =====
  const strangerDetail = await f.ride.getRideById({ rideId, openid: 'stranger_b' })
  assert.equal(strangerDetail.code, 0)
  assert.strictEqual(strangerDetail.data.origin.latitude, undefined, 'stranger cannot see origin latitude')
  assert.strictEqual(strangerDetail.data.origin.address, undefined, 'stranger cannot see origin address')

  // ===== 3. 详情页：作者和已加入成员可查看 fullPlace（带经纬度以供小地图展示） =====
  const authorDetail = await f.ride.getRideById({ rideId, openid: 'author_a' })
  assert.equal(authorDetail.code, 0)
  assert.ok(authorDetail.data.origin.latitude != null, 'author can see origin latitude')
  assert.ok(authorDetail.data.origin.address, 'author can see origin address')

  // 成员加入
  const applyC = await f.ride.applyRideJoin('member_c', { rideId })
  await f.ride.reviewRideJoin('author_a', { requestId: applyC.data.requestId, decision: 'accept' })

  const memberDetail = await f.ride.getRideById({ rideId, openid: 'member_c' })
  assert.equal(memberDetail.code, 0)
  assert.ok(memberDetail.data.origin.latitude != null, 'member can see origin latitude')
  assert.ok(memberDetail.data.origin.address, 'member can see origin address')

  console.log('PASS Ride public privacy: publicPlace strips coordinates/address; memberPlace retained for map')
})().catch(error => { console.error(error); process.exitCode = 1 })
