'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const MTCore=require('../core.js');
const elements=new Map();
class Element {
  constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.style={};this.events={};this.hidden=false;this.disabled=false;this.classList={add(){},remove(){}};}
  addEventListener(name,fn){this.events[name]=fn;}
  click(){this.events.click?.({target:this});}
  closest(){return null;}
}
function el(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
const ctx={window:{MTCore,confirm:()=>true,scrollTo(){}},document:{getElementById:el},navigator:{},console,setTimeout,clearTimeout,scrollTo(){},Blob,URL,TextDecoder};ctx.window.window=ctx.window;
vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),ctx,{timeout:1000});
function action(which){el('stepContent').events.click({target:{closest(sel){if(sel==='[data-action]')return {dataset:{action:which}};return null;}}});}
function fill(path,value){el('stepContent').events.input({target:{dataset:{path},value,tagName:'INPUT',type:'text'}});}
const next=()=>el('nextStep').click();
const skip=()=>el('skipStep').click();
assert.match(el('stepContent').innerHTML,/Bắt đầu cấu hình/);
next();
assert.match(el('stepContent').innerHTML,/Cấu hình ban đầu/);
next();
assert.match(el('stepContent').innerHTML,/Lệnh RouterOS — Bước 1/);
assert.match(el('stepContent').innerHTML,/\/system identity/);
next();
assert.match(el('stepContent').innerHTML,/Kết nối Internet/);
fill('wan.0.user','fpt');fill('wan.0.password','abc');fill('wan.1.user','vnpt');fill('wan.1.password','xyz');
next();
assert.match(el('stepContent').innerHTML,/name=pppoe-WAN1/);
assert.match(el('stepContent').innerHTML,/password=&quot;\*\*\*\*\*\*\*\*&quot;/);
next();next();assert.match(el('stepContent').innerHTML,/\/interface bridge add/);
next();assert.match(el('stepContent').innerHTML,/VLAN Trunk/);
assert.equal(el('skipStep').hidden,false);
skip();assert.match(el('stepContent').innerHTML,/PPPoE Server cho khách hàng/);
skip();assert.match(el('stepContent').innerHTML,/Kích hoạt Internet và Firewall/);
next();assert.match(el('stepContent').innerHTML,/PCC \/ NAT \/ FIREWALL/);
next();assert.match(el('stepContent').innerHTML,/PCQ — chia đều thông minh/);
skip();assert.match(el('stepContent').innerHTML,/Tổng hợp cấu hình hoàn chỉnh/);
assert.match(el('stepContent').innerHTML,/Tải file \.RSC/);
console.log('PASS guided wizard: Welcome / form / code / Next / Skip / total output');