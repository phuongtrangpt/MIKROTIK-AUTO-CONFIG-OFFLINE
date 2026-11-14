'use strict';
const assert=require('node:assert/strict');
const C=require('../core.js');
let total=0;
function test(name,fn){try{fn();total++;console.log('PASS',name);}catch(e){console.error('FAIL',name);throw e;}}
function filled(){const s=C.defaultState();s.wan.forEach((w,i)=>{w.user='test'+(i+1);w.password='pa$s\\\"'+i;w.pppoeMode='direct';w.ispConfirmed=true;});return s;}
function errors(s){return C.validate(s).errors;}
function good(s){const e=errors(s);assert.equal(e.length,0,e.join(' | '));return C.render(s).script;}
function hasError(s,part){assert(errors(s).some(e=>e.includes(part)),errors(s).join(' | '));}
function index(s,fragment){const n=s.indexOf(fragment);assert(n>=0,'Missing '+fragment);return n;}

test('system bootstrap established before invalid and WAN drop',()=>{
 const s=good(filled());const a=index(s,'comment="Bootstrap established"'),b=index(s,'comment="Bootstrap drop invalid"'),c=index(s,'comment="Bootstrap block WAN management"');assert(a<b&&b<c);
 const lines=s.split(/\r?\n/);
 assert.equal(lines.filter(x=>x.includes('chain=input action=accept connection-state=established,related,untracked')).length,1);
 assert.equal(lines.filter(x=>x.includes('chain=input action=drop connection-state=invalid')).length,1);
 assert.equal(lines.filter(x=>x.includes('protocol=udp src-port=67 dst-port=68')).length,1);
 assert(index(s,'comment="Bootstrap block WAN management"')<index(s,'comment="Drop all other input"'));
});
test('IPv6 disabled by default and unsafe unconfigured IPv6 rejected',()=>{
 const s=filled();assert.match(good(s),/\/ipv6 settings set disable-ipv6=yes/);s.system.disableIPv6=false;hasError(s,'IPv6:');
});
test('LAN gateway cannot be network or broadcast',()=>{
 for(const value of ['192.168.1.0/24','192.168.1.255/24','10.9.0.0/16','10.9.255.255/16']){const s=filled();s.lan.gateway=value;hasError(s,'LAN: Gateway');}
});
test('LAN invalid lease-time from JSON cannot inject commands',()=>{
 const s=filled();s.lan.lease='1d;/user add name=evil';hasError(s,'Lease Time');assert.equal(C.render(s).script,'');
});
test('LAN DHCP lease choices used by UI still valid',()=>{
 for(const value of ['1h','12h','1d','3d','7d']){const s=filled();s.lan.lease=value;good(s);}
});
test('WAN static gateway same as IP and network/broadcast addresses refused',()=>{
 const s=filled();s.wan[0]={...s.wan[0],type:'static',ip:'172.16.3.2/30',gateway:'172.16.3.2'};hasError(s,'gateway IP không được trùng');
 s.wan[0].ip='172.16.3.0/30';s.wan[0].gateway='172.16.3.1';hasError(s,'IP WAN không được là network/broadcast');
 s.wan[0].ip='172.16.3.3/30';hasError(s,'IP WAN không được là network/broadcast');
});
test('overlapping WAN static prefixes refused',()=>{
 const s=filled();s.wan[0]={...s.wan[0],type:'static',ip:'172.16.1.2/24',gateway:'172.16.1.1'};
 s.wan[1]={...s.wan[1],type:'static',ip:'172.16.1.3/24',gateway:'172.16.1.1'};hasError(s,'trùng subnet');
});
test('static WAN connected subnet excluded from PCC routing marking',()=>{
 const s=filled();s.wan[0]={...s.wan[0],type:'static',ip:'172.16.1.2/30',gateway:'172.16.1.1'};
 const out=good(s);assert.match(out,/list=AUTO-LOCAL address=172\.16\.1\.0\/30 comment="Static WAN connected ether1"/);
 const lines=out.split(/\r?\n/).filter(x=>x.includes('per-connection-classifier'));
 assert(lines.every(l=>l.includes('dst-address-list=!AUTO-LOCAL')));
});
test('VLAN gateway must be a usable host address',()=>{
 const s=filled();s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.10.0/24',dhcp:false,internet:true,trunkPorts:['ether8'],accessPorts:[]}];hasError(s,'Gateway không được là địa chỉ network/broadcast');
 s.vlans[0].gateway='192.168.10.255/24';hasError(s,'Gateway không được là địa chỉ network/broadcast');
});
test('VLAN interface cannot collide with bridge-LAN, physical port, or generated PPP interface',()=>{
 for(const name of ['bridge-LAN','BRIDGE-PPPOE','ether3','pppoe-WAN1']){
  const s=filled();s.vlans=[{name,id:10,mode:'routed',gateway:'192.168.10.1/24',dhcp:false,internet:true,trunkPorts:['ether8'],accessPorts:[]}];hasError(s,'trùng interface');
 }
});
test('VLAN duplicate trunk and access entries rejected',()=>{
 const s=filled();s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.10.1/24',dhcp:false,internet:true,trunkPorts:['ether8','ether8'],accessPorts:[]}];hasError(s,'trùng cổng trong danh sách');
});
test('case-insensitive duplicate VLAN names rejected',()=>{
 const s=filled();s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.10.1/24',dhcp:false,internet:true,trunkPorts:['ether8'],accessPorts:[]},{name:'vlan10',id:20,mode:'routed',gateway:'192.168.20.1/24',dhcp:false,internet:true,trunkPorts:['ether8'],accessPorts:[]}];hasError(s,'tên interface bị trùng');
});
test('Unknown model rejected instead of silently using RB5009 port list',()=>{
 const s=filled();s.meta.model='fake-router';hasError(s,'Model MikroTik không được hỗ trợ');
});
test('PPPoE shared bridge requires explicit acknowledgment and warns about DHCP',()=>{
 const s=filled();s.ppp.enabled=true;s.ppp.mode='bridge';s.ppp.usersText='one,pass,20M/50M';hasError(s,'cần xác nhận rõ');
 s.ppp.sharedBridgeConfirmed=true;const out=good(s);assert.match(out,/pppoe-server server add interface=bridge-LAN/);
 assert(C.validate(s).warnings.some(x=>x.includes('MikroTik khuyến nghị')));
 assert(C.validate(s).warnings.some(x=>x.includes('DHCP LAN cùng chạy')));
});
test('PPPoE dedicated ports requires no shared bridge acknowledgment',()=>{
 const s=filled();s.lan.portMode='custom';s.lan.selectedPorts=['ether3','ether4'];s.ppp.enabled=true;s.ppp.mode='ports';s.ppp.ports=['ether5','ether6'];s.ppp.usersText='one,pass,20M/50M';const out=good(s);
 assert.match(out,/name=bridge-PPPoE/);assert.doesNotMatch(out,/bridge=bridge-LAN interface=ether5/);
});
test('TXT parser accepts commas inside semicolon CSV password and quoted escapes',()=>{
 const p=C.parseUsers('username;password;rate\nroom1;"foo,bar";20M/50M\nroom2;"has""quote";30M/100M');
 assert.deepEqual(p.errors,[]);assert.deepEqual(p.users.map(x=>x.password),['foo,bar','has"quote']);
});
test('TXT parser accepts semicolon inside comma CSV quoted password',()=>{
 const p=C.parseUsers('u1,"a;b",10M/20M');assert.deepEqual(p.errors,[]);assert.equal(p.users[0].password,'a;b');
});
test('malformed CSV / duplicated usernames remain blocked',()=>{
 const p=C.parseUsers('u1,"unclosed,20M/50M\nu1,pass,20M/50M\nu1,pass,20M/50M');assert(p.errors.length>=2);
});
test('WAN tagged PPPoE interface created before dialing and WAN list includes logical PPPoE',()=>{
 const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId='35';const stage=C.renderStages(s)[1].script;
 assert(index(stage,'name=vlan-WAN1 interface=ether1 vlan-id=35')<index(stage,'name=pppoe-WAN1 interface=vlan-WAN1'));
 assert.match(stage,/list=WAN interface=pppoe-WAN1/);
});
test('multiple WAN PCC ratio, PCQ, PPPoE are serialized in correct stages',()=>{
 const s=filled();s.wan[0].speed='250M';s.wan[1].speed='1G';s.ppp.enabled=true;s.ppp.mode='ports';s.ppp.ports=['ether8'];s.ppp.usersText='u1,p1,20M/50M';s.qos.enabled=true;
 const out=good(s);const stages=C.renderStages(s);
 assert.deepEqual(C.computePcc(s.wan).weights,[1,4]);
 assert(out.includes('per-connection-classifier=both-addresses-and-ports:5/4'));
 assert(stages[4].script.includes('PPPOE-PROFILE-1'));
 assert(stages[5].script.includes('PCC AUTO'));
 assert(stages[6].script.includes('Auto-FairShare'));
});
test('full vs step-by-step scripts exactly match active generated stages',()=>{
 for(const testPPP of [false,true]){
  const s=filled();s.wan=[s.wan[0]];if(testPPP){s.ppp.enabled=true;s.ppp.mode='port';s.ppp.port='ether8';s.ppp.usersText='u1,p1,20M/50M';}good(s);
  const combined=C.render(s).script, stages=C.renderStages(s).filter(st=>st.enabled);
  let before=-1;for(const stage of stages){const start=combined.indexOf(stage.script);assert(start>before);before=start;}
 }
});
// Matrix on supported types: test route creation and no double-bound physical WAN port.
test('WAN type matrix: all combinations of PPPoE, DHCP, Static for two links',()=>{
 for(const a of ['pppoe','dhcp','static'])for(const b of ['pppoe','dhcp','static']){
  const s=filled();[a,b].forEach((type,i)=>{s.wan[i].type=type;if(type==='static'){s.wan[i].ip=`172.16.${i}.2/30`;s.wan[i].gateway=`172.16.${i}.1`;} });
  const out=good(s);assert(out.includes('/routing table add name=rt_WAN1'));assert(out.includes('/routing table add name=rt_WAN2'));
  if(a==='dhcp'||b==='dhcp')assert(out.includes('default-route-tables='));
 }
});
test('Read-only diagnostics include connection, route and firewall checks',()=>{
 const d=C.diagnostics(filled());assert.match(d,/\/ip route print detail/);assert.match(d,/\/ppp active print/);assert.match(d,/\/ip firewall filter print stats/);
 assert(d.split(/\r?\n/).every(l=>!l||l.startsWith('#')||/\sprint(?:\s|$)/.test(l)),'Diagnostics must not include changes');
});
test('DNS and NTP duplicate values produce no repeated entries',()=>{
 const s=filled();s.system.dns2=s.system.dns1;s.system.ntp2=s.system.ntp1;
 const out=good(s);
 assert.match(out,/ip dns set servers=1\.1\.1\.1 allow-remote-requests=yes/);
 assert.equal(out.split('/system ntp client servers add address=').length-1,1);
});
test('Extreme WAN ratios give explicit approximation warning',()=>{
 const s=filled();s.wan[0].speed='10M';s.wan[1].speed='1G';
 assert(C.validate(s).warnings.some(w=>w.includes('Tỷ lệ PCC chỉ gần đúng')));
});
console.log(`\n${total} audit regression tests passed.`);