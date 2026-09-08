async function resolveUserOpenid(db, identifier) {
 if (!identifier || typeof identifier !== 'string') return ''
 for (const field of ['internalUserId','userId','_openid']) {
  const result=await db.collection('users').where({[field]:identifier}).limit(1).get()
  if(result.data && result.data[0] && result.data[0]._openid) return result.data[0]._openid
 }
 try { const result=await db.collection('users').doc(identifier).get();return result.data && result.data._openid || '' } catch (_) { return '' }
}
module.exports = { resolveUserOpenid }
