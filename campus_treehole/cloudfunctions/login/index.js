// 登录云函数 - 获取用户openid并创建/更新用户记录
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function getNumericId(openid) {
  const hash = crypto.createHash('md5').update(String(openid || '')).digest('hex')
  const raw = parseInt(hash.slice(0, 8), 16)
  return String((raw % 90000000) + 10000000)
}

function deriveDeterministicUserId(openid) {
  const hex = crypto.createHash('sha256').update(`xiaoyuanbianlihe:user:${openid}`).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32)
  ].join('-')
}

async function recordAuthIdentity(userId, openid) {
  try {
    const identId = `ident_wx_${openid}`
    await db.collection('auth_identities').doc(identId).set({
      data: {
        userId,
        provider: 'wechat_mini',
        providerKey: openid,
        lastLoginAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
  } catch (err) {
    if (err && err.message && err.message.includes('not exist')) {
      await db.createCollection('auth_identities').catch(() => {})
      await db.collection('auth_identities').doc(`ident_wx_${openid}`).set({
        data: {
          userId,
          provider: 'wechat_mini',
          providerKey: openid,
          lastLoginAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      }).catch(() => {})
    }
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  try {
    if (!OPENID) {
      return { code: -1, msg: '未授权访问' }
    }
    // 查询用户是否已存在
    const userRes = await db.collection('users').where({ _openid: OPENID }).get()

    if (userRes.data.length > 0) {
      const user = userRes.data[0]

      // 封禁到期自动解封
      if (user.status === 'banned' && user.banExpiry) {
        const now = Date.now()
        const expire = new Date(user.banExpiry).getTime()
        if (!Number.isNaN(expire) && now > expire) {
          await db.collection('users').doc(user._id).update({
            data: { status: 'active', banTime: null, banExpiry: null }
          })
          user.status = 'active'
        }
      }

      // 用户已注销：允许重新注册（同一 openid 重新激活为全新可用状态）
      if (user.status === 'deleted') {
        const reactivatedUser = {
          ...user,
          status: 'active',
          deleteTime: null,
          role: user.role || 'user',
          numericId: user.numericId || getNumericId(OPENID),
          nickName: '树洞用户' + Math.floor(Math.random() * 9000 + 1000),
          avatarUrl: '/images/avatar_default.png',
          college: '未设置',
          bio: '',
          tags: [],
          coverImage: '',
          postCount: 0,
          likeCount: 0,
          agreedPrivacy: false,
          profileCompleted: false
        }
        await db.collection('users').doc(user._id).update({
          data: {
            status: reactivatedUser.status,
            deleteTime: reactivatedUser.deleteTime,
            role: reactivatedUser.role,
            numericId: reactivatedUser.numericId,
            nickName: reactivatedUser.nickName,
            avatarUrl: reactivatedUser.avatarUrl,
            college: reactivatedUser.college,
            bio: reactivatedUser.bio,
            tags: reactivatedUser.tags,
            coverImage: reactivatedUser.coverImage,
            postCount: reactivatedUser.postCount,
            likeCount: reactivatedUser.likeCount,
            agreedPrivacy: reactivatedUser.agreedPrivacy,
            profileCompleted: reactivatedUser.profileCompleted,
            lastLoginTime: db.serverDate()
          }
        })
        return {
          code: 0,
          msg: '欢迎回来，账号已重新激活',
          user: reactivatedUser,
          openid: OPENID,
          isNew: true,
          reactivated: true
        }
      }
      if (user.status === 'banned') {
        return { code: -2, msg: '账号已被封禁', user: null }
      }

      const internalUserId = user.internalUserId || deriveDeterministicUserId(OPENID)
      const nextUser = {
        ...user,
        numericId: user.numericId || getNumericId(OPENID),
        internalUserId
      }
      // 更新最后登录时间与补齐内部稳定用户 ID
      await db.collection('users').doc(user._id).update({
        data: {
          lastLoginTime: db.serverDate(),
          numericId: nextUser.numericId,
          internalUserId
        }
      })
      await recordAuthIdentity(internalUserId, OPENID)
      return { code: 0, msg: '登录成功', user: nextUser, openid: OPENID, internalUserId }
    } else {
      // 新用户 - 创建用户记录
      const internalUserId = deriveDeterministicUserId(OPENID)
      const newUser = {
        _openid: OPENID,
        internalUserId,
        numericId: getNumericId(OPENID),
        nickName: '树洞用户' + Math.floor(Math.random() * 9000 + 1000),
        avatarUrl: '/images/avatar_default.png',
        college: '未设置',
        bio: '',
        tags: [],
        coverImage: '',
        role: 'user',
        status: 'active',
        postCount: 0,
        likeCount: 0,
        createTime: db.serverDate(),
        lastLoginTime: db.serverDate(),
        agreedPrivacy: false,
        profileCompleted: false
      }
      const addRes = await db.collection('users').add({ data: newUser })
      newUser._id = addRes._id
      await recordAuthIdentity(internalUserId, OPENID)
      return { code: 0, msg: '注册成功', user: newUser, openid: OPENID, internalUserId, isNew: true }
    }
  } catch (err) {
    console.error('登录失败:', err)
    return { code: -1, msg: '登录失败: ' + err.message }
  }
}
