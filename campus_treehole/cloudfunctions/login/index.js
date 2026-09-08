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

/**
 * 登录响应用户白名单：只返回客户端明确需要的字段。
 * ⚠️ 新增敏感字段（手机号/学号/内部标记等）必须显式加入此列表才会返回，
 *    绝不能依赖 `...user` 全量展开（否则数据库加字段即自动泄露）。
 */
const SELF_USER_FIELDS = [
  '_id',
  '_openid',
  'numericId',
  'nickName',
  'avatarUrl',
  'college',
  'campusId',
  'campusName',
  'bio',
  'tags',
  'coverImage',
  'role',
  'status',
  'postCount',
  'likeCount',
  'followerCount',
  'followingCount',
  'isMuted',
  'isLikeBanned',
  'agreedPrivacy',
  'profileCompleted',
  'createTime',
  'lastLoginTime'
]

function sanitizeSelfUser(user) {
  if (!user || typeof user !== 'object') return user
  const next = {}
  for (const k of SELF_USER_FIELDS) {
    if (k in user) next[k] = user[k]
  }
  return next
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

      const nextUser = {
        ...user,
        numericId: user.numericId || getNumericId(OPENID)
      }
      // 更新最后登录时间
      await db.collection('users').doc(user._id).update({
        data: {
          lastLoginTime: db.serverDate(),
          numericId: nextUser.numericId
        }
      })
      return { code: 0, msg: '登录成功', user: sanitizeSelfUser(nextUser), openid: OPENID }
    } else {
      // 新用户 - 创建用户记录
      const newUser = {
        _openid: OPENID,
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
      return { code: 0, msg: '注册成功', user: sanitizeSelfUser(newUser), openid: OPENID, isNew: true }
    }
  } catch (err) {
    console.error('登录失败:', err)
    return { code: -1, msg: '登录失败: ' + err.message }
  }
}
