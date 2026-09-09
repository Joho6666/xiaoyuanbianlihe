const { createContentValidator } = require('../shared/content-safety')
const { publicId } = require('../shared/public-data')
const { makeDeterministicId } = require('../shared/id')
const { getCampusById } = require('../shared/schools')
const { getUserEntitlements } = require('../shared/entitlements')
const { dayKey, pairId, eligible, score, selectCandidate, sanitizeHeartProfile } = require('../shared/heart')

module.exports = function createHeartModule({ db, _, helpers, now = Date.now, random = Math.random }) {
  const validate = createContentValidator(helpers)
  const ok = data => ({ code: 0, data })
  const fail = msg => ({ code: -1, msg })
  async function read(store, collection, id) {
    try {
      const result = await store.collection(collection).doc(id).get()
      return result.data && result.data._id ? result.data : null
    } catch(error) {
      if (/document.*(?:not exist|not found)/i.test(String(error.message||error.errMsg||''))) return null
      throw error
    }
  }
  async function actor(openid) {
    if (!openid) throw Error('请先登录')
    const user = await helpers.getUserForAction(openid, { requireActive: true })
    if (user.status !== 'active') throw Error('账号不可用')
    return { ...user, userId: user.internalUserId || publicId(openid) }
  }
  async function transaction(work) {
    const tx = await db.startTransaction()
    try { const result = await work(tx); await tx.commit(); return result }
    catch (error) { await tx.rollback(); throw error }
  }
  async function log(name, userId) {
    try { await db.collection('heart_events').add({ data: { name, userId, createdAt: now() } }) }
    catch (_) { console.warn('Heart event log unavailable:', name) }
  }
  async function getHeartProfile(openid) {
    const user = await actor(openid), p = await read(db,'heart_profiles',user.userId)
    return ok(p ? { ...sanitizeHeartProfile(p), enabled:p.enabled, adultDeclared:p.adultDeclared, gender:p.gender, interestedIn:p.interestedIn, allowFateCard:p.allowFateCard } : { enabled:false, allowFateCard:false })
  }
  async function updateHeartProfile(openid, data) {
    const user = await actor(openid), campus = getCampusById(user.campusId)
    if (!campus) return fail('请先选择有效校区')
    const previous = await read(db,'heart_profiles',user.userId)
    if (data.adultDeclared !== true || data.enabled !== true) return fail('请确认已满18周岁并主动开启心动模式')
    const genders=['male','female','other']
    if (!genders.includes(data.gender) || !Array.isArray(data.interestedIn) || !data.interestedIn.length || data.interestedIn.some(x=>!genders.includes(x))) return fail('请填写双方偏好')
    if (!Array.isArray(data.photos) || data.photos.length<1 || data.photos.length>3 || data.photos.some(p=>typeof p!=='string'||!/^cloud:\/\/[^\s]+$/.test(p))) return fail('请上传1至3张云存储照片')
    const bio=String(data.bio||'').trim(), lookingFor=String(data.lookingFor||'').trim(), grade=String(data.grade||'').trim()
    const interestIds=Array.isArray(data.interestIds)? [...new Set(data.interestIds)]:[]
    if (bio.length>160 || lookingFor.length>80 || grade.length>16 || interestIds.length>12 || interestIds.some(x=>typeof x!=='string'||x.length>20)) return fail('资料长度超出限制')
    const text=[user.nickName||'',bio,lookingFor,grade,...interestIds].join(' ')
    if (/\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:微信|微.?信号|vx|wechat|qq|电话|手机|联系方式)\s*[:：号]?\s*[a-z\d_-]{4,}/i.test(text)) return fail('资料中不能展示联系方式')
    const safety=await validate({openid,text,images:data.photos})
    if (!safety.pass) return {code:safety.code,msg:safety.reason}
    const p={userId:user.userId, ownerDocId:user._id, enabled:true, adultDeclared:true, gender:data.gender, interestedIn:[...new Set(data.interestedIn)], grade, photos:data.photos, bio, interestIds, lookingFor, allowFateCard:data.allowFateCard===true, schoolId:campus.schoolId, campusId:campus.id, campusName:campus.name, nickname:user.nickName||'同学', createdAt:previous?previous.createdAt:now(), updatedAt:now()}
    if(!user.internalUserId) await db.collection('users').doc(user._id).update({data:{internalUserId:user.userId}})
    await db.collection('heart_profiles').doc(user.userId).set({data:p})
    await log(previous&&previous.enabled?'heart_profile_completed':'heart_mode_opened',user.userId)
    return getHeartProfile(openid)
  }
  async function disableHeartProfile(openid) {
    const user=await actor(openid), p=await read(db,'heart_profiles',user.userId)
    if(p) await db.collection('heart_profiles').doc(user.userId).update({data:{enabled:false,allowFateCard:false,updatedAt:now()}})
    return ok({enabled:false,allowFateCard:false})
  }
  async function toggleFateCardOptIn(openid,data) {
    const user=await actor(openid),p=await read(db,'heart_profiles',user.userId)
    if(!p||!p.enabled) return fail('请先开启心动模式')
    await db.collection('heart_profiles').doc(user.userId).update({data:{allowFateCard:data.allowFateCard===true,updatedAt:now()}})
    return ok({allowFateCard:data.allowFateCard===true})
  }
  async function pairValid(store, me, targetId, fate=false) {
    const fence=await read(store,'heart_block_fences',pairId(me.userId,targetId))
    if(fence && fence.blocked) return null
    const a=await read(store,'heart_profiles',me.userId), b=await read(store,'heart_profiles',targetId)
    if(!eligible(a,b,fate)) return null
    const au=await read(store,'users',a.ownerDocId), bu=await read(store,'users',b.ownerDocId)
    if(!au||!bu||au.status!=='active'||bu.status!=='active') return null
    const ac=getCampusById(au.campusId),bc=getCampusById(bu.campusId)
    if(!ac||!bc||ac.schoolId!==a.schoolId||bc.schoolId!==a.schoolId) return null
    if(await helpers.conversationBlocked(au._openid,bu._openid)) return null
    return {a,b,au,bu}
  }
  async function candidates(user,fate=false,page=1) {
    const me=await read(db,'heart_profiles',user.userId)
    if(!me||!me.enabled) throw Error('请先开启心动模式')
    const currentCampus=getCampusById(user.campusId)
    if(!currentCampus||currentCampus.schoolId!==me.schoolId) throw Error('学校已变更，请更新心动资料')
    const windowSize=fate?100:15
    const rows=(await db.collection('heart_profiles').where({enabled:true,schoolId:me.schoolId}).orderBy('userId','asc').skip((page-1)*windowSize).limit(windowSize).get()).data||[]
    const eligibleRows=rows.filter(p=>eligible(me,p,fate))
    async function batch(collection,field,ids){
      const result=[]
      for(let i=0;i<ids.length;i+=20) result.push(...((await db.collection(collection).where({[field]:_.in(ids.slice(i,i+20))}).limit(100).get()).data||[]))
      return result
    }
    const [users,matches,likes,fences]=await Promise.all([
      batch('users','_id',eligibleRows.map(p=>p.ownerDocId)),
      batch('heart_matches','_id',eligibleRows.map(p=>pairId(user.userId,p.userId))),
      batch('heart_likes','_id',eligibleRows.map(p=>makeDeterministicId('heartlike',user.userId,p.userId))),
      batch('heart_block_fences','_id',eligibleRows.map(p=>pairId(user.userId,p.userId)))
    ])
    const hidden=await helpers.findAuthorsHiddenByBlockRelation(user._openid,users.map(u=>u._openid))
    const byId=new Map(users.map(u=>[u._id,u])),matched=new Set(matches.map(m=>m._id)),reacted=new Set(likes.map(l=>l.toUserId)),blocked=new Set(fences.filter(f=>f.blocked).map(f=>f._id))
    const buddies=await batch('buddy_posts','authorId',users.map(u=>u._openid))
    const result=[]
    for(const p of eligibleRows){
      const u=byId.get(p.ownerDocId),campus=u&&getCampusById(u.campusId)
      if(!u||u.status!=='active'||!campus||campus.schoolId!==me.schoolId||hidden.has(u._openid)||matched.has(pairId(user.userId,p.userId))||blocked.has(pairId(user.userId,p.userId))||(!fate&&reacted.has(p.userId)))continue
      const recentBuddy=buddies.filter(b=>b.authorId===u._openid&&['OPEN','FULL'].includes(b.status)&&new Date(b.endAt||new Date(b.startAt).getTime()+7200000).getTime()>now()).sort((a,b)=>new Date(b.startAt)-new Date(a.startAt))[0]
      result.push({...sanitizeHeartProfile(p),...score(me,p,now()),...(recentBuddy?{recentBuddy:{postId:recentBuddy._id,title:recentBuddy.title,category:recentBuddy.category}}:{})})
    }
    return {rows:result,hasMore:rows.length===windowSize}
  }
  async function getHeartDiscover(openid,data={}) {
    const user=await actor(openid),page=Math.max(1,Math.floor(Number(data.page)||1))
    const result=await candidates(user,false,page)
    await log('heart_card_viewed',user.userId)
    return ok(result)
  }
  async function likeHeartProfile(openid,data) {
    const user=await actor(openid), target=data.targetUserId
    if(typeof target!=='string'||!target||target===user.userId) return fail('无效对象')
    const result=await transaction(async tx=>{
      const pair=await pairValid(tx,user,target)
      if(!pair) return fail('该资料已不可用')
      const id=makeDeterministicId('heartlike',user.userId,target),matchId=pairId(user.userId,target)
      const old=await read(tx,'heart_likes',id),reverse=await read(tx,'heart_likes',makeDeterministicId('heartlike',target,user.userId))
      const match=await read(tx,'heart_matches',matchId)
      // Writing both profile versions serializes opposing likes and profile disable.
      await tx.collection('heart_profiles').doc(user.userId).update({data:{interactionAt:now()}})
      await tx.collection('heart_profiles').doc(target).update({data:{interactionAt:now()}})
      if(!old||old.status!=='LIKED') await tx.collection('heart_likes').doc(id).set({data:{fromUserId:user.userId,toUserId:target,status:'LIKED',createdAt:now()}})
      const matched=!!match||!!(reverse&&reverse.status==='LIKED')
      if(matched&&!match) await tx.collection('heart_matches').doc(matchId).set({data:{userIds:[user.userId,target].sort(),createdAt:now()}})
      return ok({status:matched?'MATCHED':'WAITING',matchId:matched?matchId:'',targetUserId:target,...score(pair.a,pair.b,now())})
    })
    if(result.code===0) await log(result.data.status==='MATCHED'?'heart_match':'heart_like',user.userId)
    return result
  }
  async function passHeartProfile(openid,data) {
    const user=await actor(openid)
    if(!await pairValid(db,user,data.targetUserId)) return fail('该资料已不可用')
    await transaction(async tx=>{
      const id=makeDeterministicId('heartlike',user.userId,data.targetUserId),old=await read(tx,'heart_likes',id)
      if(!old) await tx.collection('heart_likes').doc(id).set({data:{fromUserId:user.userId,toUserId:data.targetUserId,status:'PASSED',createdAt:now()}})
    })
    await log('heart_pass',user.userId);return ok({passed:true})
  }
  async function getHeartMatches(openid) {
    const user=await actor(openid),rows=(await db.collection('heart_matches').where({userIds:_.all([user.userId])}).limit(100).get()).data||[],result=[]
    for(const match of rows) {
      const target=match.userIds.find(id=>id!==user.userId),pair=await pairValid(db,user,target)
      if(pair) result.push({matchId:match._id,...sanitizeHeartProfile(pair.b),...score(pair.a,pair.b,now())})
    }
    return ok(result)
  }
  async function getFateCardQuota(openid) {
    const user=await actor(openid),dateKey=dayKey(now()),ent=getUserEntitlements(user),usage=await read(db,'fate_card_usage',makeDeterministicId('fateusage',user.userId,dateKey))
    return ok({dateKey,limit:ent.heartFateDailyLimit,remaining:Math.max(0,ent.heartFateDailyLimit-(usage?usage.usedCount:0)),membershipTier:ent.membershipTier})
  }
  async function drawFateCard(openid) {
    const user=await actor(openid),dateKey=dayKey(now()),limit=getUserEntitlements(user).heartFateDailyLimit
    const quota=await getFateCardQuota(openid)
    if(!quota.data.remaining){await log('fate_card_limit_reached',user.userId);return fail('今天的缘分已经遇见啦，明天再来看看')}
    const list={rows:[]}
    for(let page=1;page<=20;page++){const batch=await candidates(user,true,page);list.rows.push(...batch.rows);if(!batch.hasMore)break}
    const history=(await db.collection('fate_card_history').where({userId:user.userId}).orderBy('createdAt','desc').limit(100).get()).data||[]
    const recent=new Set(history.filter(h=>now()-h.createdAt<30*86400000).map(h=>h.targetUserId))
    let pool=list.rows.filter(p=>!recent.has(p.userId))
    if(!pool.length) pool=list.rows.filter(p=>!history.some(h=>h.targetUserId===p.userId&&h.drawDate===dateKey))
    const candidate=selectCandidate(pool,random)
    if(!candidate){await log('fate_card_empty',user.userId);return ok({empty:true,...(await getFateCardQuota(openid)).data})}
    const result=await transaction(async tx=>{
      const id=makeDeterministicId('fateusage',user.userId,dateKey),usage=await read(tx,'fate_card_usage',id),used=usage?usage.usedCount:0
      if(used>=limit) return fail('今天的缘分已经遇见啦，明天再来看看')
      const pair=await pairValid(tx,user,candidate.userId,true)
      if(!pair||await read(tx,'heart_matches',pairId(user.userId,candidate.userId))) return fail('候选人已失效，请重试，次数未扣除')
      const historyId=makeDeterministicId('fatehistory',user.userId,candidate.userId,dateKey)
      if(await read(tx,'fate_card_history',historyId)) return fail('刚刚已遇见这位同学，请重试')
      const card={...sanitizeHeartProfile(pair.b),...score(pair.a,pair.b,now())}
      await tx.collection('fate_card_usage').doc(id).set({data:{userId:user.userId,dateKey,usedCount:used+1,lastDrawAt:now()}})
      await tx.collection('fate_card_history').doc(historyId).set({data:{userId:user.userId,targetUserId:candidate.userId,drawDate:dateKey,createdAt:now(),matchScore:card.matchScore}})
      return ok({card,limit,remaining:limit-used-1})
    })
    await log(result.code===0?'fate_card_drawn':'fate_card_limit_reached',user.userId)
    return result
  }
  async function startHeartChat(openid,data) {
    const user=await actor(openid),pair=await pairValid(db,user,data.targetUserId)
    if(!pair||!await read(db,'heart_matches',pairId(user.userId,data.targetUserId))) return fail('双方感兴趣后才能聊天')
    await log('heart_chat_started',user.userId)
    return ok({targetUserId:data.targetUserId})
  }
  async function authorizeHeartMessage(a,b) {
    const aid=a.internalUserId||publicId(a._openid),bid=b.internalUserId||publicId(b._openid)
    const ap=await read(db,'heart_profiles',aid),bp=await read(db,'heart_profiles',bid)
    if(!ap||!bp) return true
    const fence=await read(db,'heart_block_fences',pairId(aid,bid))
    if(fence&&fence.blocked) return false
    if(await read(db,'heart_matches',pairId(aid,bid))) return true
    // Existing conversations retain their established permission. A Heart card alone grants none.
    const messages=await db.collection('messages').where(_.or([{fromOpenid:a._openid,toOpenid:b._openid},{fromOpenid:b._openid,toOpenid:a._openid}])).limit(1).get()
    if(messages.data.length) return true
    const apps=(await db.collection('buddy_applications').where({applicantId:a._openid,status:'ACCEPTED'}).limit(100).get()).data||[]
    for(const application of apps){const post=await read(db,'buddy_posts',application.postId);if(post&&post.authorId===b._openid)return true}
    const reverse=(await db.collection('buddy_applications').where({applicantId:b._openid,status:'ACCEPTED'}).limit(100).get()).data||[]
    for(const application of reverse){const post=await read(db,'buddy_posts',application.postId);if(post&&post.authorId===a._openid)return true}
    return false
  }
  return {authorizeHeartMessage,getHeartProfile,updateHeartProfile,disableHeartProfile,getHeartDiscover,likeHeartProfile,passHeartProfile,getHeartMatches,drawFateCard,getFateCardQuota,toggleFateCardOptIn,startHeartChat}
}
