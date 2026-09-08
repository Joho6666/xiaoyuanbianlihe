const assert = require('assert')
const { createContentValidator } = require('../../campus_treehole/cloudfunctions/dbOperations/shared/content-safety')
async function run() {
 for (const failure of ['local','text','image','throw','missing',null]) {
  const calls=[]
  const validate=createContentValidator({
   checkBannedWords:text=>{calls.push(['local',text]);return {pass:failure!=='local'}},
   wxTextCheck:async(id,text)=>{calls.push(['text',id,text]);if(failure==='throw')throw Error('offline');return failure==='missing'?undefined:{pass:failure!=='text'}},
   wxImageBatchCheck:async(id,images)=>{calls.push(['image',id,images]);return {pass:failure!=='image'}}
  })
  const result=await validate({openid:'actor',text:'hello',images:['cloud://image']})
  assert.strictEqual(result.pass,failure===null)
  assert.strictEqual(result.code,failure===null?0:-2)
  if(failure==='local')assert.strictEqual(calls.length,1)
  if(calls[1])assert.deepStrictEqual(calls[1],['text','actor','hello'])
  if(calls[2])assert.deepStrictEqual(calls[2],['image','actor',['cloud://image']])
 }
 for(const moduleName of ['buddies','mutual']) {
  let accesses=0
  const mod=require('../../campus_treehole/cloudfunctions/dbOperations/modules/'+moduleName)({db:{collection:()=>{accesses++;throw Error('must not write')}},helpers:{checkBannedWords:()=>({pass:false})}})
  const result=await (moduleName==='buddies'?mod.addBuddyPost('actor',{title:'活动标题',startAt:'2030-01-01'}):mod.addMutualPost('actor',{title:'求助标题',content:'完整求助内容'}))
  assert.strictEqual(result.code,-2);assert.strictEqual(accesses,0)
 }
 console.log('PASS 8 content safety cases: order, rejection, unavailable service, no database access')
}
run().catch(e=>{console.error(e);process.exitCode=1})
