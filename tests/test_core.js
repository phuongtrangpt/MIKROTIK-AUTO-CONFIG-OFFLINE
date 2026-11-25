'use strict';
const assert = require('node:assert/strict');
const C = require('../core.js');
let n=0;
function test(name,fn){try{fn();n++;console.log('PASS',name)}catch(e){console.error('FAIL',name);throw e;}}
const filled=()=>{const s=C.defaultState();s.wan[0].user='fpt-001';s.wan[0].password='fptpass';s.wan[0].pppoeMode='direct';s.wan[0].ispConfirmed=true;s.wan[1].user='vnpt-002';s.wan[1].password='vnptpass';s.wan[1].pppoeMode='direct';s.wan[1].ispConfirmed=true;return s;};
function ok(s){const v=C.validate(s);assert.deepEqual(v.errors,[],v.errors.join(' | '));const r=C.render(s);assert(r.script.length>800);return r.script;}
test('default PPPoE requires credentials, connection mode and ISP confirmation',()=>{const errors=C.validate(C.defaultState()).errors;assert.equal(errors.filter(x=>x.includes('username và password')).length,2);assert.equal(errors.filter(x=>x.includes('trực tiếp hay qua VLAN')).length,2);assert.equal(errors.filter(x=>x.includes('xác nhận với nhà mạng')).length,2);});
test('IPv4 and subnet pool',()=>{assert.equal(C.parseCIDR('192.168.1.1/24').subnet,'192.168.1.0/24');assert.equal(C.autoPool(C.parseCIDR('192.168.1.1/24')).start,'192.168.1.100');assert(!C.parseCIDR('192.168.1.256/24'));assert(!C.parseCIDR('192.168.1.1/31'));});
test('dual PPPoE PCC routes, secure firewall, NAT',()=>{const str=ok(filled());assert.match(str,/name=pppoe-WAN1 interface=ether1/);assert.match(str,/name=pppoe-WAN2 interface=ether2/);assert.match(str,/both-addresses-and-ports:2\/1/);assert.match(str,/routing-table=rt_WAN1/);assert.match(str,/routing-table=rt_WAN2/);assert.match(str,/out-interface-list=WAN action=masquerade/);assert.match(str,/action=drop comment="Default deny forward"/);assert.match(str,/in-interface=bridge-LAN src-address=192.168.1.0\/24/);assert.doesNotMatch(str,/fasttrack-connection/);});
test('special characters in PPP password escaped',()=>{const s=filled();s.wan[0].password='foo$bar"quote\\path';const str=ok(s);assert(str.includes('password="foo\\$bar\\"quote\\\\path"'));});
test('one WAN DHCP requires no PPP and no PCC',()=>{const s=C.defaultState();s.wan=[{label:'DHCP',port:'ether1',type:'dhcp',user:'',password:'',ip:'',gateway:'',weight:1,speed:'500M'}];let str=ok(s);assert.match(str,/default-route-tables=main:1/);assert.doesNotMatch(str,/per-connection-classifier/);});
test('two DHCP WAN routes into all routing tables',()=>{const s=filled();s.wan.forEach(x=>{x.type='dhcp';x.user='';x.password='';});let str=ok(s);assert.match(str,/default-route-tables=main:1,rt_WAN1:1,rt_WAN2:2/);assert.match(str,/default-route-tables=main:2,rt_WAN1:3,rt_WAN2:1/);});
test('static WAN route with gateway',()=>{const s=filled();s.wan[0]={...s.wan[0],type:'static',ip:'172.16.10.2/30',gateway:'172.16.10.1'};let str=ok(s);assert.match(str,/gateway=172.16.10.1 routing-table=main/);});
test('WAN port collision rejected',()=>{const s=filled();s.wan[1].port='ether1';assert(C.validate(s).errors.some(x=>x.includes('trùng cổng WAN')));});
test('LAN/VLAN network overlap rejected',()=>{const s=filled();s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.1.2/24',dhcp:false, internet:true,trunkPorts:['sfp-sfpplus1'],accessPorts:[]}];assert(C.validate(s).errors.some(x=>x.includes('Chồng dải IP')));});
test('multiple trunk VLAN with native management allowed',()=>{const s=filled();s.vlans=[10,20].map(id=>({name:'VLAN'+id,id,mode:'routed',gateway:`192.168.${id}.1/24`,dhcp:true,poolStart:'',poolEnd:'',internet:true,trunkPorts:['sfp-sfpplus1'],accessPorts:[]}));let str=ok(s);assert.match(str,/vlan-ids=10 tagged=bridge-LAN,sfp-sfpplus1/);assert.match(str,/vlan-ids=20 tagged=bridge-LAN,sfp-sfpplus1/);assert.match(str,/vlan-filtering=yes/);});
test('access port reused across VLAN rejected',()=>{const s=filled();s.vlans=[10,20].map(id=>({name:'VLAN'+id,id,mode:'routed',gateway:`192.168.${id}.1/24`,dhcp:false,internet:true,trunkPorts:[],accessPorts:['ether5']}));assert(C.validate(s).errors.some(x=>x.includes('access của nhiều VLAN')));});
test('PPPoE server dedicated, users, profiles, PCQ',()=>{const s=filled();s.ppp.enabled=true;s.ppp.mode='port';s.ppp.port='ether8';s.ppp.usersText='phong101,pass 01,20M/50M\nphong102,"pass,02",30M/100M\nphong103,pass03,20M/50M';s.qos.enabled=true;
 const str=ok(s);assert.match(str,/interface=ether8 service-name="MIKROTIK-PPPOE"/);assert.match(str,/password="pass,02"/);assert.match(str,/rate-limit="20M\/50M"/);assert.match(str,/name=Auto-FairShare/);assert.match(str,/10.20.0.0\/24/);assert.doesNotMatch(str,/bridge=bridge-LAN interface=ether8/);});
test('PPPoE-only VLAN server, not L3',()=>{const s=filled();s.vlans=[{name:'VLAN100',id:100,mode:'pppoe',gateway:'',dhcp:false,internet:false,trunkPorts:['sfp-sfpplus1'],accessPorts:[]}];s.ppp.enabled=true;s.ppp.mode='vlan';s.ppp.vlanId='100';s.ppp.usersText='u1,p1,10M/20M';const str=ok(s);assert.match(str,/server add interface=VLAN100/);assert.doesNotMatch(str,/ip address add address=\s+interface=VLAN100/);});
test('PPPoE file row errors, duplicate, missing, rates',()=>{let p=C.parseUsers('a,pass,20M/50M\na,pass,20M/50M\nb,pwd,bad');assert.equal(p.errors.length,2);assert.equal(p.users.length,1);});
test('management port must remain untagged LAN',()=>{const s=filled();s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.10.1/24',dhcp:false,internet:true,trunkPorts:['ether3','ether4','ether5','ether6','ether7','ether8','sfp-sfpplus1'],accessPorts:[]}];assert(C.validate(s).errors.some(x=>x.includes('quản trị')));});
test('separate WAN and PPPoE physical port',()=>{const s=filled();s.ppp.enabled=true;s.ppp.mode='port';s.ppp.port='ether1';s.ppp.usersText='u1,p1,10M/20M';assert(C.validate(s).errors.some(x=>x.includes('đang dùng làm WAN')));});
test('unsafe overlapping PPP pool rejected',()=>{const s=filled();s.ppp.enabled=true;s.ppp.usersText='u1,p1,10M/20M';s.ppp.network='192.168.1.0/24';s.ppp.gateway='192.168.1.1';s.ppp.poolStart='192.168.1.100';s.ppp.poolEnd='192.168.1.150';assert(C.validate(s).errors.some(x=>x.includes('Chồng dải IP')));});
console.log(`\n${n} automated tests passed.`);
test('guided sections independent and ordered; WAN routing before LAN/PCC',()=>{
 const s=filled();const stages=C.renderStages(s);
 assert.equal(stages.length,7);
 assert.match(stages[0].script,/Bootstrap block WAN management/);
 assert.match(stages[1].script,/\/routing table add name=rt_WAN1/);
 assert.match(stages[1].script,/\/interface pppoe-client add name=pppoe-WAN1/);
 assert.doesNotMatch(stages[1].script,/\/ip firewall mangle add/);
 assert.match(stages[2].script,/\/interface bridge add name=bridge-LAN/);
 assert.match(stages[2].script,/\/ip dhcp-server add name=dhcp-LAN/);
 assert.match(stages[5].script,/\/ip firewall mangle add/);
 assert.match(stages[5].script,/\/ip firewall nat add/);
});
test('guided VLAN updates bridge ports created in prior step',()=>{
 const s=filled();s.vlans=[{id:10,name:'VLAN10',mode:'routed',gateway:'192.168.10.1/24',dhcp:true,poolStart:'',poolEnd:'',internet:true,trunkPorts:['sfp-sfpplus1'],accessPorts:['ether4']}];
 const stages=C.renderStages(s);
 assert.match(stages[2].script,/\/interface bridge port add bridge=bridge-LAN interface=ether4/);
 assert.doesNotMatch(stages[2].script,/pvid=10/);
 assert.match(stages[3].script,/find where interface=ether4\] pvid=10/);
 assert.match(stages[3].script,/find where interface=sfp-sfpplus1\] ingress-filtering=yes/);
 assert.match(stages[3].script,/vlan-filtering=yes/);
 assert(!C.validate(s).errors.length);
});
test('final combined output includes only enabled optional stages',()=>{
 const s=filled();let out=ok(s);
 assert.doesNotMatch(out,/\/interface bridge vlan add/);
 assert.doesNotMatch(out,/\/ppp secret add/);
 assert.doesNotMatch(out,/\/queue simple add/);
 s.qos.enabled=true;out=ok(s);
 assert.match(out,/Auto-FairShare/);
 assert(out.indexOf('# 03 - LAN')<out.indexOf('# 06 - PCC'));
});
test('PPPoE Server stage detaches selected physical port after LAN was pasted',()=>{
 const s=filled();s.ppp.enabled=true;s.ppp.mode='port';s.ppp.port='ether8';s.ppp.usersText='u1,p1,10M/20M';
 const stages=C.renderStages(s);
 assert.match(stages[4].script,/bridge port find where interface=ether8/);
 assert.match(stages[4].script,/bridge port remove \$autoBp/);
});

test('PCC auto ratio 250M plus 1G produces 1:4 = 5 slots',()=>{
 const s=filled();s.wan[0].speed='250M';s.wan[1].speed='1G';
 const pc=C.computePcc(s.wan);assert.deepEqual(pc.weights,[1,4]);assert.equal(pc.total,5);
 const output=ok(s);assert.match(output,/both-addresses-and-ports:5\/4/);assert.match(output,/PCC AUTO: FPT 250M = 1\/5 phan.*VNPT 1G = 4\/5 phan/);
});
test('PCC rejects invalid speed and accepts 1000 Mbps',()=>{
 const s=filled();s.wan[1].speed='1000 Mbps';assert.equal(C.computePcc(s.wan).speeds[1],1000);
 s.wan[0].speed='0M';assert(C.validate(s).errors.some(x=>x.includes('băng thông')));
});
test('custom LAN selection uses only chosen ports, unused untouched',()=>{
 const s=filled();s.lan.portMode='custom';s.lan.selectedPorts=['ether3','ether4'];
 const output=ok(s);assert.match(output,/bridge=bridge-LAN interface=ether3/);assert.match(output,/bridge=bridge-LAN interface=ether4/);
 assert.doesNotMatch(output,/bridge=bridge-LAN interface=ether5/);
 assert(C.getAlloc(s).unused.includes('ether5'));
});
test('PPPoE Server running on bridge-LAN',()=>{
 const s=filled();s.ppp.enabled=true;s.ppp.mode='bridge';s.ppp.sharedBridgeConfirmed=true;s.ppp.usersText='u1,p1,20M/50M';
 const output=ok(s);assert.match(output,/pppoe-server server add interface=bridge-LAN/);
 assert.doesNotMatch(output,/bridge-PPPoE/);
});
test('PPPoE Server dedicated multiport bridge, DHCP only on custom LAN',()=>{
 const s=filled();s.lan.portMode='custom';s.lan.selectedPorts=['ether3','ether4'];s.ppp.enabled=true;
 s.ppp.mode='ports';s.ppp.ports=['ether5','ether6'];s.ppp.usersText='u1,p1,20M/50M';
 const output=ok(s);assert.match(output,/bridge port add bridge=bridge-PPPoE interface=ether5/);
 assert.match(output,/bridge port add bridge=bridge-PPPoE interface=ether6/);
 assert.match(output,/pppoe-server server add interface=bridge-PPPoE/);
 assert.doesNotMatch(output,/bridge=bridge-LAN interface=ether5/);
 s.lan.selectedPorts.push('ether5');assert(C.validate(s).errors.some(x=>x.includes('vừa được chọn')));
});

// v1.3.0 — ISP tagged PPPoE WAN is distinct from LAN VLAN features.
test('tagged VLAN WAN created before PPPoE Client and PCC still targets PPPoE logical interface',()=>{
 const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId='35';s.wan[0].ispConfirmed=true;
 const stages=C.renderStages(s);assert.equal(C.validate(s).errors.length,0);
 const wanStage=stages[1].script;
 const vlan=wanStage.indexOf('/interface vlan add name=vlan-WAN1 interface=ether1 vlan-id=35');
 const pppoe=wanStage.indexOf('/interface pppoe-client add name=pppoe-WAN1 interface=vlan-WAN1');
 assert(vlan>=0&&pppoe>vlan,'VLAN must be created first');
 assert.match(wanStage,/name=pppoe-WAN2 interface=ether2/);
 assert.doesNotMatch(stages[3].script,/vlan-WAN1/);
 assert.match(stages[5].script,/in-interface=pppoe-WAN1/);
 assert.match(stages[5].script,/out-interface-list=WAN/);
});
test('two separate ISP WAN VLAN IDs and physically distinct WAN ports',()=>{
 const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId=35;
 s.wan[1].pppoeMode='tagged';s.wan[1].vlanId=35;
 assert.equal(C.validate(s).errors.length,0, 'same VLAN ID is allowed on separate physical ports');
 const wan=C.renderStages(s)[1].script;
 assert.match(wan,/name=vlan-WAN1 interface=ether1 vlan-id=35/);
 assert.match(wan,/name=vlan-WAN2 interface=ether2 vlan-id=35/);
 assert.match(wan,/name=pppoe-WAN2 interface=vlan-WAN2/);
});
test('ISP mode unknown prevents generation even when credentials entered',()=>{
 const s=filled();s.wan[0].pppoeMode='unknown';s.wan[0].ispConfirmed=false;
 const v=C.validate(s);assert(v.errors.some(x=>x.includes('quay trực tiếp hay qua VLAN')));assert.equal(C.render(s).script,'');
});
test('ISP must be confirmed for direct PPPoE as well',()=>{
 const s=filled();s.wan[1].ispConfirmed=false;
 assert(C.validate(s).errors.some(x=>x.includes('WAN 2: cần xác nhận')));
});
test('ISP tagged VLAN ID range and integer validation',()=>{
 for(const id of ['',0,'0','4095','100.5','abc','-1']){
  const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId=id;
  assert(C.validate(s).errors.some(x=>x.includes('VLAN ID phía nhà mạng')),String(id));
 }
 for(const id of [1,35,'100',4094]){
  const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId=id;
  assert.equal(C.validate(s).errors.length,0,'Should accept '+id);
 }
});
test('WAN VLAN and LAN VLAN IDs do not collide if their parent interfaces differ',()=>{
 const s=filled();s.wan[0].pppoeMode='tagged';s.wan[0].vlanId=10;
 s.vlans=[{name:'VLAN10',id:10,mode:'routed',gateway:'192.168.10.1/24',dhcp:false,internet:true,trunkPorts:['sfp-sfpplus1'],accessPorts:[]}];
 assert.equal(C.validate(s).errors.length,0);
 const out=C.render(s).script;
 assert.match(out,/name=vlan-WAN1 interface=ether1 vlan-id=10/);
 assert.match(out,/name=VLAN10 interface=bridge-LAN vlan-id=10/);
});
test('DHCP and static WAN not forced to choose ISP PPPoE mode',()=>{
 const s=filled();s.wan[1].type='dhcp';s.wan[1].pppoeMode='unknown';s.wan[1].ispConfirmed=false;
 assert.equal(C.validate(s).errors.length,0);
});