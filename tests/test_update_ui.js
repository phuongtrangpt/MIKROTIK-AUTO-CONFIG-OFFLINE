'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const MTCore=require('../core.js');
const elements=new Map();
let downloadCount=0,opened='';
class Element {
  constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.style={};this.hidden=false;this.disabled=false;this.events={};this.classList={add(){},remove(){}};}
  addEventListener(event,fn){this.events[event]=fn;}
  click(){this.events.click?.({target:this});}
  closest(){return null;}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
const ctx={window:{MTCore,MTUpdater:{checkLatest:async()=>({state:'update',version:'9.9.9',url:'https://github.com/phuongtrangpt/MIKROTIK-AUTO-CONFIG-OFFLINE/releases/download/v9.9.9/MikroTik_Auto_Config_Studio_v9.9.9_Windows_Offline.zip'})},confirm:()=>true,scrollTo(){}},document:{getElementById:get,body:{appendChild(){}},createElement:tag=>({href:'',rel:'',click(){downloadCount++;opened=this.href},remove(){},style:{}})},console,setTimeout,clearTimeout,Blob,URL};
ctx.window.window=ctx.window;
vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),ctx,{timeout:1500});
get('updateCheckButton').click();
setImmediate(()=>{
 assert.equal(downloadCount,1,'Clicking update automatically starts downloading latest release ZIP');
 assert.match(opened,/releases\/download\/v9\.9\.9/);
 assert.match(get('updatePanel').innerHTML,/Đã tìm thấy/);
 assert.match(get('updatePanel').innerHTML,/CAP_NHAT_TU_DONG\.bat/);
 assert.equal(get('updateCheckButton').disabled,false);
 console.log('PASS UI update button finds latest release and starts download');
});