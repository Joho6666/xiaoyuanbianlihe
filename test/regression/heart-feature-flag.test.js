const assert = require('assert')
const { fixture } = require('../helpers/heart-fixture')
const { SCHOOLS } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/schools')

;(async () => {
  const f = await fixture()
  const school = SCHOOLS.find(item => item.id === 'guat')
  assert.equal(school.features.heart, true)
  const original = school.features.heart
  school.features.heart = false
  try {
    for (const action of [
      () => f.heart.getHeartProfile('flag_user'), () => f.heart.updateHeartProfile('flag_user', {}),
      () => f.heart.disableHeartProfile('flag_user'), () => f.heart.getHeartDiscover('flag_user'),
      () => f.heart.likeHeartProfile('flag_user', {}), () => f.heart.passHeartProfile('flag_user', {}),
      () => f.heart.getHeartMatches('flag_user'), () => f.heart.drawFateCard('flag_user'),
      () => f.heart.getFateCardQuota('flag_user'), () => f.heart.toggleFateCardOptIn('flag_user', {}),
      () => f.heart.startHeartChat('flag_user', {})
    ]) {
      f.users.flag_user = { _id: 'doc_flag', _openid: 'flag_user', internalUserId: 'flag_user', status: 'active', campusId: 'guit-hangtian' }
      await assert.rejects(action, /该学校暂未开放心动模式/)
    }
  } finally { school.features.heart = original }
  console.log('PASS Heart feature flag: disabled school rejects every Heart API')
})().catch(error => { console.error(error); process.exitCode = 1 })
