const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'desktop-dist');
fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','style.css','core.js','update.js','app.js']){
 fs.copyFileSync(path.join(root,name),path.join(out,name));
}
