const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../core.js');
function state(count, mode, remote=false) {
 const s=C.defaultState();
 s.wan=s.wan.slice(0,count).map(w=>({...w,type:'pppoe',pppoeMode:'direct',ispConfirmed:true,user:'lab',password:'lab'}));
 s.system.wanMode=mode; s.system.remoteWinbox=remote;
 return s;
}
for(const [count,mode] of [[1,'pcc'],[2,'failover'],[2,'pcc']]) {
 test(count+' WAN '+mode,()=>{
  const result=C.render(state(count,mode));
  assert.deepEqual(result.errors,[]);
  const pcc=count>1&&mode==='pcc';
  assert.equal(result.script.includes('per-connection-classifier='),pcc);
  assert.equal(result.script.includes('/routing table add'),pcc);
  assert.match(result.script,/action=masquerade/);
 });
}
test('remote WinBox opt-in precedes WAN drop',()=>{
 const script=C.render(state(1,'pcc',true)).script;
 assert.ok(script.includes('Explicit remote WinBox'));
 assert.ok(script.indexOf('Explicit remote WinBox')<script.indexOf('Bootstrap block WAN management'));
 assert.match(script,/winbox disabled=no address=0\.0\.0\.0\/0/);
});
test('remote WinBox off by default',()=>{
 const script=C.render(state(1,'pcc')).script;
 assert.ok(!script.includes('Explicit remote WinBox'));
 assert.match(script,/winbox disabled=no address=192\.168\.1\.0\/24/);
});
