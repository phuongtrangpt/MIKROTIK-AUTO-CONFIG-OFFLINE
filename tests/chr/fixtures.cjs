const fs = require('node:fs');
const path = require('node:path');
const C = require('../../core.js');
const out = process.argv[2];

for (const mode of ['pcc', 'failover']) {
  const config = C.defaultState();
  config.meta.model = 'Tùy chỉnh';
  config.meta.customPorts = 'ether1 ether2 ether3 ether4 ether5';
  config.meta.identity = 'CHR-' + mode.toUpperCase();
  config.wan[0].type = 'dhcp';
  Object.assign(config.wan[1], {type:'static', ip:'10.16.2.15/24', gateway:'10.16.2.2'});
  config.system.wanMode = mode;
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
