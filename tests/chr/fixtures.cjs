const fs = require('node:fs');
const path = require('node:path');
const C = require('../../core.js');
const out = process.argv[2];

for (const mode of ['pcc', 'failover', 'recursive']) {
  const config = C.defaultState();
  config.meta.model = 'Tùy chỉnh';
  config.meta.customPorts = 'ether1 ether2 ether3 ether4 ether5';
  config.meta.identity = 'CHR-' + mode.toUpperCase();
  config.wan[0].type = 'dhcp';
  Object.assign(config.wan[1], {type:'static', ip:'10.16.2.15/24', gateway:'10.16.2.2'});
  config.system.wanMode = mode === 'recursive' ? 'pcc' : mode;
  if (mode === 'recursive') {
    config.wan[0].probe = '203.0.113.5';
    config.wan[1].probe = '198.51.100.7';
  }
  config.system.remoteWinbox = true;
  config.system.remoteWinboxSources = '10.16.1.2/32,10.16.2.2/32';
  config.vlans.push({
    id:10,name:'vlan10',mode:'routed',gateway:'192.168.10.1/24',dhcp:true,
    poolStart:'',poolEnd:'',internet:true,trunkPorts:[],accessPorts:['ether4']
  });
  Object.assign(config.ppp, {
    enabled:true,mode:'port',port:'ether5',usersText:'lab-user,lab-test,10M/20M'
  });
  const result = C.render(config);
  if (result.errors.length) throw Error(result.errors.join('\n'));
  fs.writeFileSync(path.join(out, mode + '.rsc'), result.script);
}

const WG = require('../../wireguard.js');
const {generateKeyPairSync} = require('node:crypto');
const router = C.defaultState();
router.wan[0].type = 'dhcp';
const publicKey = () => generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const variants = [
  ['remote', {ip:'10.80.1.2',key:publicKey()}],
  ['hub', {ip:'10.80.2.2',networks:'192.168.22.0/24',key:publicKey()}],
  ['site', {ip:'10.80.3.2',networks:'192.168.23.0/24',endpoint:'192.0.2.23',port:51820,key:publicKey()}]
];
const tunnels = variants.map(([role, peer], index) => {
  const n = index + 1;
  const config = {
    role,name:'wg-'+role,address:'10.80.'+n+'.1/24',listenPort:51820+n,
    networks:'192.168.1.0/24',winbox:role==='remote',peers:[peer]
  };
  const result = WG.render(config,router);
  if (result.errors.length) throw Error(result.errors.join('\n'));
  return result.script;
});
fs.writeFileSync(path.join(out, 'wireguard.rsc'), tunnels.join('\r\n'));

const keypair = generateKeyPairSync('x25519');
const clientPublic = keypair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const clientPrivate = keypair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
const live = WG.render({
  role:'remote',name:'wg-live',address:'10.81.0.1/24',listenPort:51830,networks:'192.168.1.0/24',
  winbox:true,peers:[{ip:'10.81.0.2',key:clientPublic}]
},router);
if (live.errors.length) throw Error(live.errors.join('\n'));
fs.writeFileSync(path.join(out, 'wireguard-live.rsc'), live.script);
fs.writeFileSync(path.join(out, 'wireguard-client.key'),clientPrivate,{mode:0o600});

const rollback = require('../../rollback.js');
fs.writeFileSync(path.join(out,'rollback-first.rsc'),rollback.arm(30,'1111111122222222'));
fs.writeFileSync(path.join(out,'rollback-keep.rsc'),rollback.confirm());
fs.writeFileSync(path.join(out,'rollback-timer.rsc'),rollback.arm(20,'3333333344444444'));
