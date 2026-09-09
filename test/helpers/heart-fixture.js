const {memoryDb}=require('./heart-memory-db')
const create=require('../../campus_treehole/cloudfunctions/dbOperations/modules/heart')
const {publicId}=require('../../campus_treehole/cloudfunctions/dbOperations/shared/public-data')
async function fixture(){
 const db=memoryDb(),users={},blocked=new Set(),deletedFiles=[];let clock=Date.UTC(2026,8,9,4),reject=false
 db.serverDate=()=>clock
 const helpers={findAuthorsHiddenByBlockRelation:async(a,ids)=>new Set(ids.filter(b=>blocked.has([a,b].sort().join(':')))),getUserForAction:async id=>users[id],conversationBlocked:async(a,b)=>blocked.has([a,b].sort().join(':')),checkBannedWords:()=>({pass:!reject}),wxTextCheck:async()=>({pass:true}),wxImageBatchCheck:async()=>({pass:true})}
 const heart=create({db,_:db.command,cloud:{deleteFile:async({fileList})=>{deletedFiles.push(...fileList)}},helpers,now:()=>clock,random:()=>0})
 async function add(id,gender='female',campusId='guit-hangtian'){
  users[id]={_id:'doc_'+id,_openid:id,status:'active',nickName:'同学',campusId,internalUserId:publicId(id)}
  await db.collection('users').doc(users[id]._id).set({data:users[id]})
  const profile={enabled:true,adultDeclared:true,gender,interestedIn:['male','female','other'],photos:[`cloud://test/heart/${publicId(id)}/photo.jpg`],bio:'摄影爱好者',interestIds:['摄影','羽毛球'],lookingFor:'周末散步',grade:'大二',allowFateCard:true}
  return {id,userId:publicId(id),profile,result:await heart.updateHeartProfile(id,profile)}
 }
 return {db,heart,users,blocked,deletedFiles,add,setTime:t=>clock=t,setReject:r=>reject=r}
}
module.exports={fixture}
