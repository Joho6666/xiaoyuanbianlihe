const { deriveDeterministicUserId, isValidInternalUserId } = require('../domain/user')
const publicId = id => !id ? '' : isValidInternalUserId(id) ? id : deriveDeterministicUserId(id)
function sanitizePublicPost(value) {
 if (Array.isArray(value)) return value.map(sanitizePublicPost)
 if (!value || typeof value !== 'object' || value instanceof Date) return value
 const result = {}
 for (const [key,item] of Object.entries(value)) {
  if (/openid/i.test(key) || ['unionid','session_key','password','token','internalUserId'].includes(key)) continue
  result[key] = ['authorId','applicantId'].includes(key) ? publicId(item) : sanitizePublicPost(item)
 }
 if(value._openid && !value.isAnonymous) result.userId = value.internalUserId || publicId(value._openid)
 return result
}
function sanitizePublicUser(user) {
 if (!user) return user
 const safe = sanitizePublicPost(user)
 const fields = ['_id','userId','nickName','nickname','avatarUrl','avatar','campusId','campusName','schoolId','college','bio','tags','interests','languageProfile','followingCount','followerCount','isFollowing','iBlockedThem','isOwner','numericId']
 return Object.fromEntries(fields.filter(k=>safe[k]!==undefined).map(k=>[k,safe[k]]))
}
module.exports = { sanitizePublicPost, sanitizePublicUser, publicId }
