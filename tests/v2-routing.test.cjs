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

test('mixed DHCP/static WANs use distinct fallback priorities', () => {
  const s = state(2, 'pcc');
  s.wan[0].type = 'dhcp';
  Object.assign(s.wan[1], {type:'static', ip:'172.16.2.2/24', gateway:'172.16.2.1'});
  const {script, errors} = C.render(s);
  assert.deepEqual(errors, []);
  assert.match(script,/default-route-tables=main:1,rt_WAN1:1,rt_WAN2:2/);
  assert.match(script,/gateway=172\.16\.2\.1@main routing-table=rt_WAN1 distance=3/);
  assert.match(script,/gateway=172\.16\.2\.1@main routing-table=rt_WAN2 distance=1/);
});

test('remote WinBox sources and failover reply routing preserve selected access', () => {
  const s = state(2, 'failover', true);
  s.system.remoteWinboxSources = '198.51.100.2, 203.0.113.19/28';
  const {script, errors} = C.render(s);
  assert.deepEqual(errors, []);
  assert.doesNotMatch(script,/per-connection-classifier/);
  assert.match(script,/list=AUTO-WINBOX address=198\.51\.100\.2\/32/);
  assert.match(script,/winbox disabled=no address=192\.168\.1\.0\/24,198\.51\.100\.2\/32,203\.0\.113\.16\/28/);
  assert.match(script,/in-interface=pppoe-WAN2 connection-state=new connection-mark=no-mark dst-address-type=local protocol=tcp dst-port=8291/);
  assert.match(script,/chain=output[^\r\n]*connection-mark=cm_WAN2[^\r\n]*new-routing-mark=rt_WAN2/);
  s.system.remoteWinboxSources += ',bad-address';
  assert.ok(C.render(s).errors.length);
});

test('recursive probes are installed per WAN and DHCP follows the lease', () => {
  const s = state(2, 'pcc');
  Object.assign(s.wan[0], {type:'dhcp',probe:'1.1.1.1'});
  Object.assign(s.wan[1], {type:'static',ip:'172.16.2.2/24',gateway:'172.16.2.1',probe:'9.9.9.9'});
  const {script,errors} = C.render(s);
  assert.deepEqual(errors,[]);
  assert.match(script,/interface=ether1[^\r\n]+add-default-route=no script=/);
  assert.ok(script.includes(String.raw`\$\"gateway-address\" . \"%ether1\"`));
  assert.match(script,/dst-address=9\.9\.9\.9\/32 routing-table=main scope=10 target-scope=10/);
  assert.match(script,/gateway=1\.1\.1\.1@main routing-table=rt_WAN1 distance=1 target-scope=11 check-gateway=ping/);
  s.wan[1].probe = '1.1.1.1';
  assert.match(C.render(s).errors.join(' '),/mỗi WAN/);
});
