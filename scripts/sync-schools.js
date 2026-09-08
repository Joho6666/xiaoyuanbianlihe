const fs=require('fs'),path=require('path')
const root=path.resolve(__dirname,'..')
const source=fs.readFileSync(path.join(root,'campus_treehole/config/schools.js'),'utf8')
const target=path.join(root,'campus_treehole/cloudfunctions/dbOperations/shared/schools.js')
if(process.argv.includes('--check')) { if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==source) throw Error('School directory copy is stale; run npm run sync:schools') }
else fs.writeFileSync(target,source)
