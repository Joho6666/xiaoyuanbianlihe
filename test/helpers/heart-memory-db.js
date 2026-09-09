const clone=x=>JSON.parse(JSON.stringify(x))
function memoryDb(){
 let store={},tail=Promise.resolve(),failCommit=false
 const matches=(row,where)=>Object.entries(where).every(([k,v])=>k==='$or'?v.some(q=>matches(row,q)):v&&v.$in?v.$in.includes(row[k]):v&&v.$all?v.$all.every(x=>(row[k]||[]).includes(x)):row[k]===v)
 function api(getStore){return {collection(name){const rows=()=>getStore()[name]||(getStore()[name]={});return {
 doc(id){if(!id)throw Error('missing document id');return {async get(){return {data:rows()[id]?clone(rows()[id]):null}},async set({data}){rows()[id]={...clone(data),_id:id}},async update({data}){if(!rows()[id])throw Error('missing document');Object.assign(rows()[id],clone(data))},async remove(){delete rows()[id]}}},
 async add({data}){const id=data._id||String(Object.keys(rows()).length+1);rows()[id]={...clone(data),_id:id};return {_id:id}},
 where(q){let start=0,count=100,sort;const query={orderBy(k,d){sort=[k,d];return query},skip(n){start=n;return query},limit(n){count=n;return query},async count(){return {total:Object.values(rows()).filter(r=>matches(r,q)).length}},async get(){let found=Object.values(rows()).filter(r=>matches(r,q));if(sort)found.sort((a,b)=>(a[sort[0]]>b[sort[0]]?1:-1)*(sort[1]==='desc'?-1:1));return {data:clone(found.slice(start,start+count))}}};return query}
 }}}}
 const db=api(()=>store)
 db.startTransaction=async()=>{let release;const prior=tail;tail=new Promise(r=>release=r);await prior;const draft=clone(store);let done=false;return {...api(()=>draft),async commit(){if(failCommit){failCommit=false;throw Error('injected commit failure')}store=draft;done=true;release()},async rollback(){if(!done){done=true;release()}}}}
 db.dump=()=>clone(store);db.failNextCommit=()=>{failCommit=true};db.command={in:a=>({$in:a}),all:a=>({$all:a}),or:a=>({$or:a})};return db
}
module.exports={memoryDb}
