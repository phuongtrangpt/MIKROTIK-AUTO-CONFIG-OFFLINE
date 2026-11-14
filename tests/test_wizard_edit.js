'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../core.js');
const Updater=require('../update.js');
const elements=new Map(), copied=[];
class NodeMock{
 constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.style={};this.hidden=false;this.disabled=false;this.events={};this.classList={add(){},remove(){}};}
 addEventListener(key,fn){this.events[key]=fn;} click(){this.events.click?.({target:this});}
}
function el(id){if(!elements.has(id))elements.set(id,new NodeMock(id));return elements.get(id);}
const window={MTCore:C,MTUpdater:Updater,confirm:()=>true,scrollTo(){}};
const navigator={clipboard:{writeText(s){copied.push(s);return Promise.resolve();}}};
const context={window,document:{getElementById:el},navigator,console,setTimeout,clearTimeout,Blob,URL};window.window=window;
vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context,{timeout:2000});
function action(name){el('stepContent').events.click({target:{closest(sel){return sel==='[data-action]'?{dataset:{action:name}}:null;}}});}
function fill(path,value){el('stepContent').events.input({target:{dataset:{path},value,tagName:'INPUT',type:'text'}});}
(async()=>{
 el('nextStep').click();el('nextStep').click(); // stage 1 code
 assert.match(el('stepContent').innerHTML,/Bootstrap established/);
 action('copy-step');await Promise.resolve();
 assert(copied.length===1);
 action('edit-step');fill('meta.identity','LAB-CHANGED');el('nextStep').click();
 assert.match(el('stepContent').innerHTML,/Cấu hình đã thay đổi sau khi sao chép lệnh/);
 assert.match(C.diagnostics(C.defaultState()),/ip route print detail/);
 console.log('PASS wizard detects changes to copied router configuration and exposes diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1;});