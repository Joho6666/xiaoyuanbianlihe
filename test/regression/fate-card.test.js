const assert=require('assert');const {fixture}=require('../helpers/heart-fixture')
;(async()=>{const f=await fixture(),a=await f.add('a','male');await f.add('b');await f.add('c');await f.add('d');await f.add('e')
const results=await Promise.allSettled([f.heart.drawFateCard('a'),f.heart.drawFateCard('a'),f.heart.drawFateCard('a')]);assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.code===0).length,1);assert.equal((await f.heart.getFateCardQuota('a')).data.remaining,0)
f.setTime(Date.UTC(2026,8,9,16));assert.equal((await f.heart.getFateCardQuota('a')).data.remaining,1)
f.db.failNextCommit();await assert.rejects(()=>f.heart.drawFateCard('a'));assert.equal((await f.heart.getFateCardQuota('a')).data.remaining,1)
const first=results.find(r=>r.status==='fulfilled'&&r.value.code===0).value.data.card.userId;const next=await f.heart.drawFateCard('a');assert.notEqual(next.data.card.userId,first)
const oldEnv=process.env.APP_ENV,oldIds=process.env.HEART_PREMIUM_TEST_USER_IDS
try{process.env.APP_ENV='development';process.env.HEART_PREMIUM_TEST_USER_IDS=a.userId;f.setTime(Date.UTC(2026,8,10,16));for(let remaining=2;remaining>=0;remaining--){assert.equal((await f.heart.drawFateCard('a')).data.remaining,remaining)}assert.notEqual((await f.heart.drawFateCard('a')).code,0)}finally{if(oldEnv===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=oldEnv;if(oldIds===undefined)delete process.env.HEART_PREMIUM_TEST_USER_IDS;else process.env.HEART_PREMIUM_TEST_USER_IDS=oldIds}
const empty=await fixture();await empty.add('solo');assert.equal((await empty.heart.drawFateCard('solo')).data.empty,true);assert.equal((await empty.heart.getFateCardQuota('solo')).data.remaining,1)
console.log('PASS Fate quota: concurrent free draw, Shanghai reset, rollback, repeat avoidance, premium 3, empty no-charge')})().catch(e=>{console.error(e);process.exitCode=1})
