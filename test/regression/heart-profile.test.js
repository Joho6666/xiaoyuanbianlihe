const assert=require('assert');const {fixture}=require('../helpers/heart-fixture')
;(async()=>{const f=await fixture();const a=await f.add('a','male');assert.equal(a.result.code,0)
let r=await f.heart.updateHeartProfile('a',{...a.profile,adultDeclared:false});assert.notEqual(r.code,0)
for(const photos of [[],['https://outside/image.jpg'],Array(4).fill('cloud://a/b')]){r=await f.heart.updateHeartProfile('a',{...a.profile,photos});assert.notEqual(r.code,0)}
f.setReject(true);const before=JSON.stringify(f.db.dump().heart_profiles);r=await f.heart.updateHeartProfile('a',{...a.profile,bio:'更新'});assert.equal(r.code,-2);assert.equal(JSON.stringify(f.db.dump().heart_profiles),before);f.setReject(false)
await f.heart.disableHeartProfile('a');assert.equal((await f.heart.getHeartProfile('a')).data.enabled,false)
console.log('PASS Heart profile: opt-in, adult declaration, photos, safety no-write, disable')})().catch(e=>{console.error(e);process.exitCode=1})
