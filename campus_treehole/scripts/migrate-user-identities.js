// scripts/migrate-user-identities.js - 历史用户迁移脚本
// 将旧版 users 中的存量用户增量补齐 internalUserId，并初始化 auth_identities 映射记录
// 幂等执行：已拥有 internalUserId 的记录会自动跳过

const crypto = require('crypto')

function deriveDeterministicUserId(openid) {
  if (!openid) throw new Error('Openid required')
  const hex = crypto.createHash('sha256').update(`xiaoyuanbianlihe:user:${openid}`).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32)
  ].join('-')
}

/**
 * 迁移执行函数
 * @param {Object} db - CloudBase / wx-server-sdk 数据库实例
 * @returns {Promise<{ scanned: number, migrated: number, skipped: number }>}
 */
async function runUserIdentitiesMigration(db) {
  console.log('[Migration] 开始扫描 users 集合以补齐 internalUserId 与 auth_identities...')
  let migrated = 0
  let skipped = 0
  let scanned = 0
  const BATCH_SIZE = 100
  let page = 0

  while (true) {
    const res = await db.collection('users')
      .skip(page * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .get()

    const users = res.data || []
    if (!users.length) break
    scanned += users.length

    for (const u of users) {
      const openid = u._openid
      if (!openid) {
        skipped++
        continue
      }

      const internalUserId = u.internalUserId || deriveDeterministicUserId(openid)

      // 1. 补齐 users.internalUserId
      if (!u.internalUserId) {
        await db.collection('users').doc(u._id).update({
          data: {
            internalUserId
          }
        })
        migrated++
      } else {
        skipped++
      }

      // 2. 写入或刷新 auth_identities
      const identId = `ident_wx_${openid}`
      await db.collection('auth_identities').doc(identId).set({
        data: {
          userId: internalUserId,
          provider: 'wechat_mini',
          providerKey: openid,
          updatedAt: db.serverDate()
        }
      }).catch(async (err) => {
        if (err && err.message && err.message.includes('not exist')) {
          await db.createCollection('auth_identities').catch(() => {})
          await db.collection('auth_identities').doc(identId).set({
            data: {
              userId: internalUserId,
              provider: 'wechat_mini',
              providerKey: openid,
              updatedAt: db.serverDate()
            }
          })
        }
      })
    }

    if (users.length < BATCH_SIZE) break
    page++
  }

  console.log(`[Migration] 完成：已扫描 ${scanned} 条，迁移补齐 ${migrated} 条，无需变更 ${skipped} 条`)
  return { scanned, migrated, skipped }
}

module.exports = {
  deriveDeterministicUserId,
  runUserIdentitiesMigration
}

// 支持直接命令行执行测试
if (require.main === module) {
  console.log('测试 deterministic userId 生成:')
  const testOpenid = 'oUpF8uMuAJO_M2pxb1Q9zNjWeS6o'
  console.log(`openid: ${testOpenid} -> UUID: ${deriveDeterministicUserId(testOpenid)}`)
}
