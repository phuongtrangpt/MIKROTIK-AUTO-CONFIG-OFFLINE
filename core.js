/* MikroTik Auto Config Studio — core v1.5.0 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.5.0';
  const version = () => globalThis.MTDesktopVersion || VERSION;
  const MODELS = {
    RB5009: ['ether1','ether2','ether3','ether4','ether5','ether6','ether7','ether8','sfp-sfpplus1'],
    RB4011: ['ether1','ether2','ether3','ether4','ether5','ether6','ether7','ether8','ether9','ether10','sfp-sfpplus1'],
    RB3011: ['ether1','ether2','ether3','ether4','ether5','ether6','ether7','ether8','ether9','ether10','sfp1'],
    'hEX E50UG': ['ether1','ether2','ether3','ether4','ether5'],
    'hEX RB750Gr3': ['ether1','ether2','ether3','ether4','ether5'],
    'hAP ac2': ['ether1','ether2','ether3','ether4','ether5'],
    'CCR2116': ['ether1','ether2','ether3','ether4','ether5','ether6','ether7','ether8','ether9','ether10','ether11','ether12','ether13','sfp-sfpplus1','sfp-sfpplus2','sfp-sfpplus3','sfp-sfpplus4'],
    'Tùy chỉnh': ['ether1','ether2','ether3','ether4','ether5']
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  function defaultState() {
    return {
      meta: { project: 'KhachHang-01', identity: 'MT-KHACHHANG', model: 'RB5009', customPorts: '', note: '' },
      system: { dns1: '1.1.1.1', dns2: '8.8.8.8', ntp1: 'time.google.com', ntp2: 'pool.ntp.org', ssh: false, remoteWinbox: false, remoteWinboxSources: '', wanMode: 'pcc', disableIPv6: true },
      wan: [
        {label:'FPT',port:'ether1',type:'pppoe',pppoeMode:'unknown',ispConfirmed:false,vlanId:'',user:'',password:'',ip:'',gateway:'',probe:'',weight:1,speed:'500M'},
        {label:'VNPT',port:'ether2',type:'pppoe',pppoeMode:'unknown',ispConfirmed:false,vlanId:'',user:'',password:'',ip:'',gateway:'',probe:'',weight:1,speed:'500M'}
      ],
      lan: { portMode:'all', selectedPorts:[], gateway: '192.168.1.1/24', dhcp: true, poolStart: '',poolEnd:'',lease:'1d',interVlan:false },
      vlans: [],
      wireguard:{role:'remote',name:'wg-studio',address:'',listenPort:'51820',networks:'',peers:[]},
      qos: {enabled:false,upload:'100M',download:'500M'},
      ppp: {enabled:false,mode:'bridge',port:'ether8',ports:[],vlanId:'',sharedBridgeConfirmed:false,service:'MIKROTIK-PPPOE',gateway:'10.20.0.1',network:'10.20.0.0/24',poolStart:'10.20.0.10',poolEnd:'10.20.0.250',usersText:''}
    };
  }
  function ports(s) {
    if (s.meta.model !== 'Tùy chỉnh') return MODELS[s.meta.model] || MODELS.RB5009;
    return String(s.meta.customPorts||'').split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
  }
  function normName(v) { return String(v||'').trim(); }
  function validIf(v) { return /^[A-Za-z][A-Za-z0-9_.-]{0,30}$/.test(v); }
  function safeIdentifier(v) { return normName(v).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,24) || 'WAN'; }
  function q(v) { return '"' + String(v).replace(/\\/g,'\\\\').replace(/\"/g,'\\"').replace(/\$/g,'\\$').replace(/\r/g,'\\r').replace(/\n/g,'\\n') + '"'; }
  function validText(v, max=128) {return typeof v === 'string' && v.length > 0 && v.length <= max && !/[\r\n\x00-\x1f]/.test(v);}
  function ipToInt(ip) {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip))) return null;
    const a=String(ip).split('.').map(Number);
    if (a.some((v,i)=>v<0||v>255||!Number.isInteger(v)||String(v)!==String(ip).split('.')[i])) return null;
    return (((a[0]*16777216)+(a[1]<<16)+(a[2]<<8)+a[3])>>>0);
  }
  function intToIp(n) {return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
  function parseCIDR(str) {
    const m=/^(.+)\/(\d{1,2})$/.exec(String(str||'').trim()); if(!m) return null;
    const addr=ipToInt(m[1]), prefix=Number(m[2]); if(addr===null || prefix<1 || prefix>30) return null;
    const mask=(0xffffffff<<(32-prefix))>>>0, net=(addr & mask)>>>0;
    const bc=(net | (~mask>>>0))>>>0;
    return {ip:m[1],ipNum:addr,prefix,mask,net,broadcast:bc,subnet:intToIp(net)+'/'+prefix,first:net+1,last:bc-1};
  }
  function networkContains(c,ip) {const n=ipToInt(ip);return !!c && n!==null && n>=c.first&&n<=c.last;}
  function usableGateway(c) {return !!c && c.ipNum>=c.first && c.ipNum<=c.last;}
  function overlaps(a,b) {return !!a&&!!b && a.net<=b.broadcast && b.net<=a.broadcast;}
  function autoPool(c) {
    if(!c) return {start:'',end:''};
    const preferred=(c.net+Math.min(100,Math.max(2,Math.floor((c.last-c.net)*0.4))))>>>0;
    let start=Math.min(preferred,c.last), end=Math.min(c.last,start+149);
    if (c.ipNum>=start && c.ipNum<=end){ if(c.ipNum===start) start++; else if(c.ipNum===end) end--; else {if(c.ipNum-start<end-c.ipNum) start=c.ipNum+1;else end=c.ipNum-1;} }
    if(start>end) {start=c.first;end=c.last;if(start===c.ipNum)start++;else if(end===c.ipNum)end--;}
    return {start:intToIp(start),end:intToIp(end)};
  }
  function poolRange(c,start,end,owner,errors) {
    const a=ipToInt(start),b=ipToInt(end);
    if(a===null||b===null||a>b ||!c||a<c.first||b>c.last) errors.push(owner+': DHCP/Pool phải nằm trong subnet và có Start <= End.');
    else if(c.ipNum>=a && c.ipNum<=b) errors.push(owner+': Pool không được chứa địa chỉ gateway của router.');
  }
  function parseUsers(txt) {
    const users=[], errors=[], lines=String(txt||'').replace(/\r/g,'').split('\n');
    if(lines.length>1001) errors.push('File PPPoE vượt 1000 dòng (giới hạn an toàn).');
    function splitLine(line) {
      // Detect separator outside quoted fields (password may contain a comma/semicolon).
      let delimiter=null,quoted=false;
      for(let j=0;j<line.length;j++){
        if(line[j]==='"') {if(quoted&&line[j+1]==='"'){j++;continue;}quoted=!quoted;continue;}
        if(!quoted&&[',',';','\t','|'].includes(line[j])){delimiter=line[j];break;}
      }
      delimiter=delimiter||',';
      let arr=[],buf='',quote=false;
      for(let i=0;i<line.length;i++){let ch=line[i];
        if(ch==='"'){if(quote && line[i+1]==='"'){buf+='"';i++;}else quote=!quote;}
        else if(ch===delimiter&&!quote){arr.push(buf.trim());buf='';}
        else buf+=ch;
      }
      arr.push(buf.trim());return quote?null:arr;
    }
    const names=new Set();
    lines.slice(0,1000).forEach((line,index)=>{
      if(!line.trim()||line.trim().startsWith('#')) return;
      const cols=splitLine(line); if(!cols||cols.length<2||cols.length>3){errors.push('Dòng '+(index+1)+': cần user,password,upload/download (cột tốc độ tùy chọn).');return;}
      if(index===0 && /^(user(name)?|name)$/i.test(cols[0]) && /^pass(word)?$/i.test(cols[1]))return;
      const [name,password,rate='']=cols;
      if(!validText(name,63)|| !validText(password,128)){errors.push('Dòng '+(index+1)+': user/pass rỗng, quá dài hoặc chứa ký tự điều khiển.');return;}
      if(rate&&!/^(\d+(?:[kKmMgG])?)\/(\d+(?:[kKmMgG])?)$/.test(rate)){errors.push('Dòng '+(index+1)+': tốc độ phải dạng 20M/50M (upload/download).');return;}
      if(names.has(name)){errors.push('Trùng username: '+name);return;}
      names.add(name);users.push({name,password,rate:rate.toUpperCase()});
    });
    return {users,errors};
  }
  // Convert 250M / 1G / 250 Mbps / 1 Gbps into Mbps. Bare number means Mbps.
  function parseSpeed(v) {
    const m=/^(\d+(?:[.,]\d+)?)\s*(M|G|MBPS|GBPS)?$/i.exec(String(v ?? '').trim());
    if(!m)return null;
    const n=Number(m[1].replace(',','.'))*(m[2]&&m[2].toUpperCase().startsWith('G')?1000:1);
    return Number.isFinite(n)&&n>=1&&n<=1000000 ? n : null;
  }
  function computePcc(wans, maxSlots=24) {
    if(!Array.isArray(wans)||!wans.length)return {slots:[],weights:[],total:0,speeds:[],error:1};
    const speeds=wans.map(w=>parseSpeed(w.speed));
    if(speeds.some(v=>v===null))return {slots:[],weights:[],total:0,speeds,error:1};
    if(speeds.length===1)return {slots:[0],weights:[1],total:1,speeds,error:0};
    const sum=speeds.reduce((a,b)=>a+b,0);let best=null;
    for(let count=speeds.length;count<=maxSlots;count++){
      const expected=speeds.map(v=>v/sum*count);
      const weights=expected.map(v=>Math.max(1,Math.floor(v)));
      let remaining=count-weights.reduce((a,b)=>a+b,0);
      if(remaining<0)continue;
      while(remaining-->0){
        let k=0,score=-Infinity;
        weights.forEach((v,i)=>{const delta=expected[i]-v;if(delta>score){score=delta;k=i;}});
        weights[k]++;
      }
      const err=weights.reduce((a,v,i)=>a+Math.abs(v/count-speeds[i]/sum),0);
      if(!best||err<best.error-1e-9||(Math.abs(err-best.error)<1e-9&&count<best.total))best={weights,total:count,error:err};
      if(err<1e-9)break;
    }
    if(!best)return {slots:[],weights:[],total:0,speeds,error:1};
    const slots=[];best.weights.forEach((n,i)=>{for(let k=0;k<n;k++)slots.push(i);});
    return {...best,slots,speeds};
  }
  function getAlloc(s) {
    const all=ports(s),wanPorts=s.wan.map(w=>w.port);
    const p=s.ppp||{};
    const dedicated=p.enabled?(p.mode==='ports'?(p.ports||[]):p.mode==='port'?[p.port]:[]):[];
    const available=all.filter(v=>!wanPorts.includes(v));
    const lanPorts=(s.lan.portMode==='custom'?(s.lan.selectedPorts||[]):available)
      .filter(v=>available.includes(v)&&!dedicated.includes(v));
    const trunk=new Set(),access=new Map();
    s.vlans.forEach(v=>{
      (v.trunkPorts||[]).forEach(p=>trunk.add(p));
      (v.accessPorts||[]).forEach(p=>access.set(p,Number(v.id)));
    });
    const management=lanPorts.filter(v=>!trunk.has(v)&&!access.has(v));
    const unused=available.filter(v=>!lanPorts.includes(v)&&!dedicated.includes(v));
    return {all,wanPorts,dedicated,lanPorts,trunk:[...trunk],access,management,available,unused};
  }
  function validate(s) {
    const errors=[],warnings=[];
    const a=getAlloc(s), seen=new Set();
    if(!Object.prototype.hasOwnProperty.call(MODELS,s.meta.model))errors.push('Model MikroTik không được hỗ trợ; hãy chọn trong danh sách hoặc dùng Tùy chỉnh.');
    if(!a.all.length) errors.push('Model tùy chỉnh phải khai báo ít nhất một cổng.');
    a.all.forEach(p=>{if(!validIf(p))errors.push('Tên cổng không hợp lệ: '+p);if(seen.has(p))errors.push('Trùng cổng: '+p);seen.add(p);});
    if(!validText(s.meta.identity,64)||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s.meta.identity)) errors.push('Tên RouterOS Identity chỉ dùng chữ, số, dấu - _ . (không khoảng trắng).');
    if(s.wan.length<1||s.wan.length>4)errors.push('Phiên bản đầu hỗ trợ từ 1 tới 4 WAN.');
    const usedW=new Set(),allWanIPs=[],probeIPs=new Set();
    s.wan.forEach((w,i)=>{
      const label='WAN '+(i+1);
      if(!a.all.includes(w.port)) errors.push(label+': cổng '+w.port+' không có trên thiết bị.');
      if(usedW.has(w.port))errors.push(label+': trùng cổng WAN '+w.port+'.');usedW.add(w.port);
      if(!validText(w.label,30)) errors.push(label+': tên nhà mạng không được trống.');
      if(!['pppoe','dhcp','static'].includes(w.type))errors.push(label+': loại kết nối không hợp lệ.');
      if(w.type==='pppoe') {
        if(!validText(w.user,128)||!validText(w.password,128))errors.push(label+': bắt buộc nhập username và password PPPoE.');
        if(!['direct','tagged'].includes(w.pppoeMode))errors.push(label+': phải xác định PPPoE quay trực tiếp hay qua VLAN theo thông tin nhà mạng.');
        if(w.pppoeMode==='tagged' && (!/^\d+$/.test(String(w.vlanId??''))||!Number.isInteger(Number(w.vlanId))||Number(w.vlanId)<1||Number(w.vlanId)>4094))
          errors.push(label+': VLAN ID phía nhà mạng phải là số từ 1 tới 4094.');
        if(w.ispConfirmed!==true)errors.push(label+': cần xác nhận với nhà mạng về chế độ PPPoE và VLAN ID trước khi sinh lệnh.');
      }
      if(w.type==='static') {const n=parseCIDR(w.ip);if(!n)errors.push(label+': IP tĩnh phải dạng 172.16.1.2/24.');else{allWanIPs.push({label,c:n});if(!usableGateway(n))errors.push(label+': IP WAN không được là network/broadcast.');if(!networkContains(n,w.gateway))errors.push(label+': gateway IP phải thuộc subnet IP tĩnh (trừ cấu hình gateway đặc biệt).');if(ipToInt(w.gateway)===n.ipNum)errors.push(label+': gateway IP không được trùng IP của router.');}}
      if(w.probe){
        const probe=ipToInt(w.probe);
        if(probe===null||probe<0x01000000||(probe>>>24)===127||probe>=0xe0000000)errors.push(label+': đích giám sát phải là IPv4 unicast hợp lệ.');
        if(probeIPs.has(probe))errors.push(label+': mỗi WAN cần một IP giám sát riêng.');
        probeIPs.add(probe);
      }
      if(parseSpeed(w.speed)===null) errors.push(label+': băng thông đăng ký phải dạng 250M, 1G hoặc 1000 Mbps (> 0).');
    });
    for(let i=0;i<allWanIPs.length;i++)for(let j=i+1;j<allWanIPs.length;j++)if(overlaps(allWanIPs[i].c,allWanIPs[j].c))errors.push('WAN tĩnh '+allWanIPs[i].label+' và '+allWanIPs[j].label+' trùng subnet.');
    const pcc=computePcc(s.wan);
    if(s.system.remoteWinbox===true && s.system.remoteWinboxSources){
      if(!managementSources(s.system.remoteWinboxSources).length)errors.push('WinBox WAN: nhập một hoặc nhiều địa chỉ IPv4/CIDR hợp lệ, phân cách bằng dấu phẩy.');
    }
    if(!['pcc','failover'].includes(s.system.wanMode||'pcc'))errors.push('Chế độ WAN không hợp lệ.');
    if(s.wan.length>1&&s.system.wanMode!=='failover'&&pcc.total&&pcc.error>0.02)warnings.push('Tỷ lệ PCC chỉ gần đúng do giới hạn 24 phần; đường WAN có tốc độ rất nhỏ có thể nhận tỷ lệ kết nối cao hơn tỷ lệ băng thông.');
    if(s.wan.length>1&&s.wan.some(w=>w.type==='dhcp')) warnings.push('Multi-WAN DHCP dùng default-route-tables của RouterOS v7 mới; nên cập nhật RouterOS lên bản v7 stable gần nhất và kiểm tra các route sau khi chạy.');
    if(s.wan.length>1){if(s.system.wanMode!=='failover')warnings.push('PCC chia theo kết nối, không cộng băng thông cho một phiên tải đơn.');if(s.wan.some(w=>!w.probe))warnings.push('WAN bỏ trống IP giám sát chỉ kiểm tra trạng thái PPPoE hoặc gateway.');}
    if(!['all','custom'].includes(s.lan.portMode||'all'))errors.push('LAN: chế độ phân cổng không hợp lệ.');
    if(s.lan.portMode==='custom'){
      const selected=s.lan.selectedPorts||[];
      if(!Array.isArray(selected)||selected.length===0)errors.push('LAN: chọn ít nhất 1 cổng để vào bridge-LAN.');
      if(new Set(selected).size!==selected.length)errors.push('LAN: danh sách cổng trùng nhau.');
      selected.forEach(v=>{if(!a.available.includes(v))errors.push('LAN: cổng '+v+' không có hoặc đã dùng cho WAN.');if(a.dedicated.includes(v))errors.push('LAN: cổng '+v+' vừa được chọn Bridge LAN vừa dùng PPPoE Server riêng.');});
    }
    if(a.lanPorts.length<1) errors.push('Không còn cổng LAN sau khi trừ WAN/PPPoE Server.');
    if(a.management.length<1)errors.push('Phải giữ ít nhất 1 cổng LAN untagged (không trunk/access VLAN) để quản trị và khôi phục Winbox.');
    const lan=parseCIDR(s.lan.gateway);
    if(!lan) errors.push('IP LAN phải dạng 192.168.1.1/24 (CIDR từ /1 tới /30).');
    else if(!usableGateway(lan))errors.push('LAN: Gateway phải là địa chỉ host, không phải địa chỉ network/broadcast.');
    if(!['1h','12h','1d','3d','7d'].includes(s.lan.lease))errors.push('LAN: DHCP Lease Time không hợp lệ; hãy chọn một giá trị trong danh sách.');
    if(s.lan.dhcp&&lan) {const p=autoPool(lan); poolRange(lan,s.lan.poolStart||p.start,s.lan.poolEnd||p.end,'LAN',errors);}
    if(s.system.disableIPv6!==true)errors.push('IPv6: bộ sinh lệnh hiện chưa cấu hình firewall/định tuyến IPv6 an toàn. Hãy bật Tắt IPv6 và triển khai IPv6 riêng sau khi kiểm tra.');
    const dns=[s.system.dns1,s.system.dns2];dns.forEach((v,i)=>{if(ipToInt(v)===null)errors.push('DNS '+(i+1)+' phải là IPv4 hợp lệ.');});
    [s.system.ntp1,s.system.ntp2].forEach((v,i)=>{if(!/^[A-Za-z0-9._-]{1,120}$/.test(v))errors.push('Máy chủ NTP '+(i+1)+' không hợp lệ.');});
    const vlans=[],ids=new Set(),names=new Set(),portAccess=new Map(),portTrunk=new Set();
    const reservedInterfaces=new Set([...a.all,'bridge-LAN','bridge-PPPoE',...s.wan.flatMap((w,i)=>[w.type==='pppoe'?'pppoe-WAN'+(i+1):'',w.type==='pppoe'&&w.pppoeMode==='tagged'?'vlan-WAN'+(i+1):''].filter(Boolean))].map(x=>String(x).toLowerCase()));
    s.vlans.forEach((v,i)=>{
      const name='VLAN '+(i+1),id=Number(v.id);
      if(!Number.isInteger(id)||id<2||id>4094||id===1)errors.push(name+': VLAN ID phải từ 2 tới 4094.');
      if(ids.has(id))errors.push(name+': trùng VLAN ID '+id);ids.add(id);
      if(!validIf(v.name))errors.push(name+': tên interface VLAN không hợp lệ (chữ, số, - _ .).');
      if(names.has(String(v.name).toLowerCase()))errors.push(name+': tên interface bị trùng.');names.add(String(v.name).toLowerCase());
      if(reservedInterfaces.has(String(v.name).toLowerCase()))errors.push(name+': tên VLAN '+v.name+' trùng interface vật lý hoặc interface tự tạo.');
      const mode=v.mode||'routed';if(!['routed','pppoe'].includes(mode))errors.push(name+': chế độ VLAN không hợp lệ.');
      let net=null;if(mode==='routed'){net=parseCIDR(v.gateway);if(!net)errors.push(name+': thiếu gateway CIDR.');else {if(!usableGateway(net))errors.push(name+': Gateway không được là địa chỉ network/broadcast.');if(v.dhcp){const p=autoPool(net);poolRange(net,v.poolStart||p.start,v.poolEnd||p.end,name,errors);}}}
      if(mode==='pppoe'&&v.dhcp)errors.push(name+': VLAN chỉ cấp PPPoE không được bật DHCP IP.');
      const tr=v.trunkPorts||[],ac=v.accessPorts||[];
      if(tr.length+ac.length===0) errors.push(name+': phải chọn ít nhất 1 cổng trunk hoặc access.');
      if(new Set(tr).size!==tr.length||new Set(ac).size!==ac.length)errors.push(name+': trùng cổng trong danh sách trunk/access.');
      [...tr,...ac].forEach(p=>{if(!a.lanPorts.includes(p))errors.push(name+': '+p+' không thuộc các cổng LAN có thể sử dụng.');});
      tr.forEach(p=>{if(ac.includes(p))errors.push(name+': cổng '+p+' không thể đồng thời trunk và access của cùng VLAN.');portTrunk.add(p);});
      ac.forEach(p=>{if(portAccess.has(p))errors.push('Cổng '+p+' đang là access của nhiều VLAN.');portAccess.set(p,id);});
      vlans.push({label:name,c:net,id});
    });
    portTrunk.forEach(p=>{if(portAccess.has(p))errors.push('Cổng '+p+' đang đồng thời trunk và access VLAN khác (hybrid chưa hỗ trợ).');});
    const ranges=[];if(lan)ranges.push({name:'LAN',c:lan});vlans.forEach(v=>{if(v.c)ranges.push({name:v.label,c:v.c});});
    if(s.ppp.enabled){
      const p=s.ppp, net=parseCIDR(p.network),local=ipToInt(p.gateway);
      if(!net)errors.push('PPPoE Server: network phải dạng 10.20.0.0/24.');
      else if(net.ipNum!==net.net)errors.push('PPPoE Server: network phải là địa chỉ đầu mạng (ví dụ 10.20.0.0/24).');
      if(!net||local===null||!networkContains(net,p.gateway)) errors.push('PPPoE Server: local-address không thuộc subnet PPP.');
      if(net){if(local===net.net||local===net.broadcast)errors.push('PPPoE Server: local-address không được là network/broadcast.');const gw={...net,ipNum:local};poolRange(gw,p.poolStart,p.poolEnd,'PPPoE Server',errors); ranges.push({name:'PPPoE Server',c:net});}
      if(!validText(p.service,63))errors.push('PPPoE Server: service name không hợp lệ.');
      if(p.mode==='bridge'){
        if(a.lanPorts.length===0)errors.push('PPPoE Server: bridge-LAN không có cổng nào.');
        if(p.sharedBridgeConfirmed!==true)errors.push('PPPoE Server: cần xác nhận rõ sử dụng chung bridge-LAN có gán IP; MikroTik không khuyến nghị đặt IP trên interface nhận PPPoE.');
        warnings.push('PPPoE Server trên bridge-LAN có địa chỉ IP: MikroTik khuyến nghị dùng bridge/VLAN riêng không gán IP để nhận PPPoE. Chỉ dùng chung bridge khi hiểu rủi ro của cấu hình này.');
        if(s.lan.dhcp)warnings.push('PPPoE Server và DHCP LAN cùng chạy trên bridge-LAN: thiết bị có thể nhận DHCP nếu không quay PPPoE. Tắt DHCP LAN nếu muốn chỉ cho quay PPPoE.');
      }
      else if(p.mode==='ports'||p.mode==='port'){const dest=p.mode==='port'?[p.port]:(p.ports||[]);if(!dest.length)errors.push('PPPoE Server: chọn ít nhất 1 cổng riêng.');if(new Set(dest).size!==dest.length)errors.push('PPPoE Server: trùng cổng riêng.');dest.forEach(v=>{if(!a.all.includes(v))errors.push('PPPoE Server: cổng '+v+' không tồn tại.');if(a.wanPorts.includes(v))errors.push('PPPoE Server: cổng '+v+' đang dùng làm WAN.');});}
      else if(p.mode==='vlan'){const v=s.vlans.find(v=>Number(v.id)===Number(p.vlanId));if(!v||v.mode!=='pppoe')errors.push('PPPoE Server: cần chọn VLAN đã tạo ở chế độ PPPoE-only.');}
      else errors.push('PPPoE Server: chế độ cổng không hợp lệ.');
      const parsed=parseUsers(p.usersText);errors.push(...parsed.errors);
      if(!parsed.users.length)errors.push('PPPoE Server: chưa nhập/import tài khoản.');
      if(parsed.users.some(x=>!x.rate))warnings.push('Một số user PPPoE không có rate-limit; tốc độ sẽ không bị giới hạn riêng theo gói cước.');
    }
    for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length;j++)if(overlaps(ranges[i].c,ranges[j].c))errors.push('Chồng dải IP: '+ranges[i].name+' và '+ranges[j].name+'.');
    for(const w of allWanIPs) for(const r of ranges) if(overlaps(w.c,r.c))errors.push('WAN tĩnh '+w.label+' trùng subnet '+r.name+'.');
    for(const [index,w] of s.wan.entries()){
      if(!w.probe)continue;
      const probe=ipToInt(w.probe);
      if([...ranges,...allWanIPs].some(({c})=>probe!==null&&probe>=c.net&&probe<=c.broadcast)){
        errors.push('WAN '+(index+1)+': IP giám sát phải nằm ngoài các subnet LAN và WAN tĩnh.');
      }
    }
    if(s.qos.enabled){if(!/^\d+(?:[kKmMgG])$/.test(s.qos.upload)||!/^\d+(?:[kKmMgG])$/.test(s.qos.download)||Number(s.qos.upload.match(/^\d+/)?.[0])===0||Number(s.qos.download.match(/^\d+/)?.[0])===0)errors.push('PCQ: nhập tốc độ tổng dạng 100M và 500M, lớn hơn 0.');
      if(s.ppp.enabled)warnings.push('PCQ tổng và PPPoE rate-limit động có thể tương tác; đo thực tế và hiệu chỉnh mức tối đa trên router.');
    }
    if(s.vlans.length)warnings.push('Khi bật bridge vlan-filtering, kết nối Winbox MAC có thể ngắt tạm. Cắm máy quản trị vào cổng LAN untagged: '+a.management.join(', ')+'.');
    warnings.push('Chỉ chạy trên RouterOS 7 đã reset No Default Configuration; giữ Safe Mode/backup và thử từ cổng LAN quản trị. Không chạy lại script trên router đã cấu hình.');
    return {errors,warnings,alloc:a,lan,pcc,parsedUsers:s.ppp.enabled?parseUsers(s.ppp.usersText).users:[]};
  }
  // Guided workflow: each stage is a self-contained RouterOS Terminal block.
  // Stage order matters; scripts are intended for one clean no-defaults install.
  const STAGE_INFO = [
    {id:'system', title:'Thiết bị & hệ thống', optional:false},
    {id:'wan', title:'Đường Internet WAN', optional:false},
    {id:'lan', title:'Bridge LAN & DHCP', optional:false},
    {id:'vlan', title:'VLAN trunk/access', optional:true},
    {id:'ppp', title:'PPPoE Server', optional:true},
    {id:'firewall', title:'PCC, NAT & Firewall', optional:false},
    {id:'qos', title:'PCQ chia băng thông', optional:true}
  ];
  function managementSources(value) {
    const parts=String(value||'').split(',').map(x=>x.trim());
    if(parts.length>32)return [];
    const normalized=parts.map(value=>{
      const [ip,bits,...extra]=value.split('/');
      const n=ipToInt(ip);
      if(n===null||extra.length||(bits!==undefined&&!/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits)))return null;
      const prefix=bits===undefined?32:Number(bits);
      const network=prefix===0?0:(n&(0xffffffff<<(32-prefix)))>>>0;
      return intToIp(network)+'/'+prefix;
    });
    return normalized.includes(null)?[]:[...new Set(normalized)];
  }
  function createStageScripts(s) {
    const a=getAlloc(s), lan=parseCIDR(s.lan.gateway), lanNet=lan?.subnet||'0.0.0.0/32';
    const wanInfo=s.wan.map((w,i)=>({w,i,ifname:w.type==='pppoe'?'pppoe-WAN'+(i+1):w.port,table:'rt_WAN'+(i+1),mark:'cm_WAN'+(i+1)}));
    const pcc=s.wan.length>1&&s.system.wanMode!=='failover';
    const remoteWinbox=s.system.remoteWinbox===true;
    const policyRoutes=s.wan.length>1&&(pcc||remoteWinbox);
    const winboxSources=managementSources(s.system.remoteWinboxSources);
    const winboxFilter=winboxSources.length?' src-address-list=AUTO-WINBOX':'';
    const blocks=STAGE_INFO.map(()=>[]);
    function add(k,...lines){blocks[k].push(...lines);}
    function lineComment(v){return String(v??'').replace(/[\r\n\x00-\x1f]/g,' ').replace(/[\x7f]/g,' ').slice(0,130);}
    const txt=(k,t)=>add(k,'', '# '+t);
    txt(0,'01 - SYSTEM / SECURITY');
    add(0,'/system identity set name='+q(s.meta.identity),'/system clock set time-zone-name=Asia/Ho_Chi_Minh',
      '/ip dns set servers='+[...new Set([s.system.dns1,s.system.dns2])].join(',')+' allow-remote-requests=yes',
      '/system ntp client set enabled=yes mode=unicast');
    [...new Map([s.system.ntp1,s.system.ntp2].map(host=>[host.toLowerCase(),host])).values()]
      .forEach(host=>add(0,'/system ntp client servers add address='+q(host)));
    for(const service of ['telnet','ftp','www','www-ssl','api','api-ssl'])add(0,'/ip service set '+service+' disabled=yes');
    add(0,'/ip service set ssh disabled='+(s.system.ssh?'no':'yes'),'/ip service set winbox disabled=no');
    if(s.system.disableIPv6)add(0,'/ipv6 settings set disable-ipv6=yes');
    add(0,'/interface list add name=WAN comment='+q('AUTO WAN'),'/interface list add name=LAN comment='+q('AUTO LAN'),'/interface list add name=MGMT comment='+q('AUTO Management'));
    if(remoteWinbox)winboxSources.forEach(source=>add(0,'/ip firewall address-list add list=AUTO-WINBOX address='+source));
    // Protect an unconfigured router the moment a WAN client receives connectivity.
    // These bootstrap input rules remain above the final firewall rules.
    add(0,'/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment='+q('Bootstrap established'),
      '/ip firewall filter add chain=input action=drop connection-state=invalid comment='+q('Bootstrap drop invalid'),
      '/ip firewall filter add chain=input action=accept in-interface-list=WAN protocol=udp src-port=67 dst-port=68 comment='+q('Bootstrap DHCP reply'),
      ...(remoteWinbox?['/ip firewall filter add chain=input action=accept connection-state=new in-interface-list=WAN protocol=tcp dst-port=8291'+winboxFilter+' comment='+q('Explicit remote WinBox')]:[]),
      '/ip firewall filter add chain=input action=drop in-interface-list=WAN comment='+q('Bootstrap block WAN management')); 
    txt(1,'02 - WAN / ROUTING TABLES');
    if(policyRoutes)wanInfo.forEach(x=>add(1,'/routing table add name='+x.table+' fib'));
    wanInfo.forEach(({w,i,ifname})=>{
      add(1,'# WAN '+(i+1)+' '+lineComment(w.label)+' on '+lineComment(w.port));
      if(w.type==='pppoe'){
        // Tagged WAN VLAN belongs to the physical ISP port, not the LAN VLAN wizard.
        // Create it immediately before binding the PPPoE Client to the VLAN interface.
        const clientOn=w.pppoeMode==='tagged'?'vlan-WAN'+(i+1):w.port;
        if(w.pppoeMode==='tagged')add(1,'/interface vlan add name='+clientOn+' interface='+w.port+' vlan-id='+Number(w.vlanId)+' disabled=no comment='+q('ISP tagged WAN'+(i+1)));
        add(1,'/interface pppoe-client add name='+ifname+' interface='+clientOn+' user='+q(w.user)+' password='+q(w.password)+' add-default-route=no use-peer-dns=no disabled=no');
        add(1,'# Kiem tra PPPoE WAN'+(i+1)+': /interface pppoe-client monitor '+ifname+' once');
      }
      add(1,'/interface list member add list=WAN interface='+ifname);
      if(w.type==='static')add(1,'/ip address add address='+w.ip+' interface='+w.port+' comment='+q('WAN'+(i+1)));
    });
    wanInfo.forEach(({w,i,ifname})=>{
      const routes=[{table:'main',distance:i+1}];
      if(policyRoutes)wanInfo.forEach(x=>routes.push({table:x.table,distance:x.i===i?1:2+i}));
      const dhcp=w.type==='dhcp';
      const client='/ip dhcp-client add interface='+w.port+' use-peer-dns=no use-peer-ntp=no disabled=no';
      if(dhcp&&!w.probe){
        add(1,client+' add-default-route=yes default-route-tables='+routes.map(x=>x.table+':'+x.distance).join(',')+' check-gateway=ping');
        return;
      }
      const gateway=w.type==='pppoe'?ifname:w.gateway;
      if(w.probe){
        const probeComment='AUTO probe WAN'+(i+1);
        const probeRoute='/ip route add dst-address='+w.probe+'/32 routing-table=main scope=10 target-scope=10 comment='+q(probeComment);
        if(dhcp){
          const where='[find where routing-table=main and comment='+q(probeComment)+']';
          const leaseScript=':local studioRoute [/ip route find where routing-table=main and comment='+q(probeComment)+']; '+
            ':if ($bound = 1) do={ :local studioGw ($"gateway-address" . "%'+w.port+'"); '+
            ':if ([:len $studioRoute] = 0) do={ '+probeRoute+' gateway=$studioGw } else={ /ip route set $studioRoute gateway=$studioGw } '+
            '} else={ /ip route remove '+where+' }';
          add(1,client+' add-default-route=no script='+q(leaseScript));
        }else{
          add(1,probeRoute+' gateway='+gateway);
        }
      }
      for(const {table,distance} of routes){
        const nextHop=(w.probe||gateway)+(table!=='main'&&(w.probe||w.type==='static')?'@main':'');
        const check=w.probe?' target-scope=11 check-gateway=ping':w.type==='static'?' check-gateway=ping':'';
        add(1,'/ip route add dst-address=0.0.0.0/0 gateway='+nextHop+' routing-table='+table+' distance='+distance+check+
          ' comment='+q((table==='main'?'Main WAN':table+' fallback WAN')+(i+1)));
      }
    });
    txt(2,'03 - LAN BRIDGE / DHCP / MANAGEMENT');
    add(2,'/interface bridge add name=bridge-LAN protocol-mode=rstp vlan-filtering=no comment='+q('Auto LAN untagged management'));
    // VLAN pvid/frame-types are applied in VLAN stage, after LAN bridge already exists.
    a.lanPorts.forEach(p=>add(2,'/interface bridge port add bridge=bridge-LAN interface='+p));
    add(2,'/interface list member add list=LAN interface=bridge-LAN','/interface list member add list=MGMT interface=bridge-LAN',
      '/ip address add address='+s.lan.gateway+' interface=bridge-LAN comment='+q('LAN gateway'));
    if(s.lan.dhcp&&lan){const pool=autoPool(lan);
      add(2,'/ip pool add name=pool-LAN ranges='+(s.lan.poolStart||pool.start)+'-'+(s.lan.poolEnd||pool.end),
        '/ip dhcp-server add name=dhcp-LAN interface=bridge-LAN address-pool=pool-LAN lease-time='+s.lan.lease+' disabled=no',
        '/ip dhcp-server network add address='+lanNet+' gateway='+lan.ip+' dns-server='+lan.ip);
    }
    add(2,'/ip service set winbox disabled=no address='+(remoteWinbox?(winboxSources.length?[lanNet,...winboxSources].join(','):'0.0.0.0/0'):lanNet),
      ...(s.system.ssh?['/ip service set ssh disabled=no address='+lanNet]:[]),
      '/tool mac-server set allowed-interface-list=none',
      '/tool mac-server mac-winbox set allowed-interface-list=MGMT',
      '/tool mac-server ping set enabled=no',
      '/ip neighbor discovery-settings set discover-interface-list=MGMT');
    txt(3,'04 - VLAN TRUNK / ACCESS');
    if(!s.vlans.length)add(3,'# VLAN: bo qua');
    const accessMap=new Map(), trunkSet=new Set();
    s.vlans.forEach(v=>{(v.accessPorts||[]).forEach(p=>accessMap.set(p,Number(v.id)));(v.trunkPorts||[]).forEach(p=>trunkSet.add(p));});
    trunkSet.forEach(p=>add(3,'/interface bridge port set [find where interface='+p+'] ingress-filtering=yes frame-types=admit-only-vlan-tagged'));
    accessMap.forEach((id,p)=>add(3,'/interface bridge port set [find where interface='+p+'] pvid='+id+' ingress-filtering=yes frame-types=admit-only-untagged-and-priority-tagged'));
    s.vlans.forEach(v=>{
      const id=Number(v.id),name=v.name,mode=v.mode||'routed';
      add(3,'/interface vlan add name='+name+' interface=bridge-LAN vlan-id='+id,
        '/interface list member add list=LAN interface='+name);
      if(mode==='routed'){
        add(3,'/ip address add address='+v.gateway+' interface='+name);
        const c=parseCIDR(v.gateway);
        if(v.dhcp&&c){const pool=autoPool(c),pn='pool-'+name;
          add(3,'/ip pool add name='+pn+' ranges='+(v.poolStart||pool.start)+'-'+(v.poolEnd||pool.end),
            '/ip dhcp-server add name=dhcp-'+name+' interface='+name+' address-pool='+pn+' lease-time=1d disabled=no',
            '/ip dhcp-server network add address='+c.subnet+' gateway='+c.ip+' dns-server='+c.ip);
        }
      }
      const tagged=['bridge-LAN',...(v.trunkPorts||[])],untagged=v.accessPorts||[];
      add(3,'/interface bridge vlan add bridge=bridge-LAN vlan-ids='+id+' tagged='+tagged.join(',')+(untagged.length?' untagged='+untagged.join(','):'')+' comment='+q('Auto VLAN '+id));
    });
    if(s.vlans.length)add(3,'# Chu y: ket noi quan tri qua '+a.management.join(', '),'/interface bridge set bridge-LAN vlan-filtering=yes');
    txt(4,'05 - PPPoE SERVER');
    if(s.ppp.enabled){const p=s.ppp, users=parseUsers(p.usersText).users;
      const v=s.vlans.find(x=>Number(x.id)===Number(p.vlanId));
      const serverInterface=p.mode==='bridge'?'bridge-LAN':(p.mode==='vlan'?(v?.name||'CHUA_CHON_VLAN'):(p.mode==='port'?p.port:'bridge-PPPoE'));
      if(p.mode==='port'||p.mode==='ports'){
        const pports=p.mode==='port'?[p.port]:(p.ports||[]);
        pports.forEach(port=>add(4,':foreach autoBp in=[/interface bridge port find where interface='+port+'] do={ /interface bridge port remove $autoBp }'));
        if(p.mode==='ports') {
          add(4,'/interface bridge add name=bridge-PPPoE protocol-mode=rstp comment='+q('PPPoE dedicated ports'));
          pports.forEach(port=>add(4,'/interface bridge port add bridge=bridge-PPPoE interface='+port));
        }
      }
      add(4,'/ip pool add name=pool-PPPoE ranges='+p.poolStart+'-'+p.poolEnd);
      const rates=[...new Set(users.map(u=>u.rate))],map=new Map();
      rates.forEach((rate,i)=>{
        const name='PPPOE-PROFILE-'+(i+1);map.set(rate,name);
        add(4,'/ppp profile add name='+name+' local-address='+p.gateway+' remote-address=pool-PPPoE dns-server='+s.system.dns1+','+s.system.dns2+' interface-list=LAN only-one=yes'+(rate?' rate-limit='+q(rate):''));
      });
      users.forEach(u=>add(4,'/ppp secret add name='+q(u.name)+' password='+q(u.password)+' profile='+map.get(u.rate)+' service=pppoe'));
      add(4,'/interface pppoe-server server add interface='+serverInterface+' service-name='+q(p.service)+' default-profile='+map.get(rates[0]||'')+' one-session-per-host=yes authentication=chap,mschap2 disabled=no');
    }else add(4,'# PPPoE Server: bo qua');
    txt(5,'06 - PCC / NAT / FIREWALL');
    add(5,'/ip firewall address-list add list=AUTO-LOCAL address='+lanNet,
      '/ip firewall address-list add list=AUTO-INET address='+lanNet);
    s.wan.filter(w=>w.type==='static').forEach(w=>{const c=parseCIDR(w.ip);if(c)add(5,'/ip firewall address-list add list=AUTO-LOCAL address='+c.subnet+' comment='+q('Static WAN connected '+w.port));});
    s.vlans.filter(x=>(x.mode||'routed')==='routed').forEach(x=>{
      const c=parseCIDR(x.gateway);if(!c)return;
      add(5,'/ip firewall address-list add list=AUTO-LOCAL address='+c.subnet);
      if(x.internet!==false)add(5,'/ip firewall address-list add list=AUTO-INET address='+c.subnet);
    });
    if(s.ppp.enabled)add(5,'/ip firewall address-list add list=AUTO-LOCAL address='+s.ppp.network,
      '/ip firewall address-list add list=AUTO-INET address='+s.ppp.network);
    if(policyRoutes){
      wanInfo.forEach(x=>add(5,'/ip firewall mangle add chain=prerouting in-interface='+x.ifname+' connection-state=new connection-mark=no-mark'+(pcc?'':' dst-address-type=local protocol=tcp dst-port=8291')+' action=mark-connection new-connection-mark='+x.mark+' passthrough=yes comment='+q('Inbound WAN'+(x.i+1))));
      if(pcc){
      const calculated=computePcc(s.wan);
      add(5,'# PCC AUTO: '+wanInfo.map((x,i)=>x.w.label+' '+x.w.speed+' = '+(calculated.weights[i]||0)+'/'+calculated.total+' phan').join(' | '));
      const slots=calculated.slots.map(i=>wanInfo[i]);
      slots.forEach((x,i)=>add(5,'/ip firewall mangle add chain=prerouting in-interface-list=LAN dst-address-type=!local dst-address-list=!AUTO-LOCAL connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:'+slots.length+'/'+i+' action=mark-connection new-connection-mark='+x.mark+' passthrough=yes comment='+q('PCC '+x.mark+' '+(i+1)+'/'+slots.length)));
      wanInfo.forEach(x=>add(5,'/ip firewall mangle add chain=prerouting in-interface-list=LAN dst-address-type=!local dst-address-list=!AUTO-LOCAL connection-mark='+x.mark+' action=mark-routing new-routing-mark='+x.table+' passthrough=no'));
      }
      wanInfo.forEach(x=>add(5,'/ip firewall mangle add chain=output dst-address-type=!local connection-mark='+x.mark+' action=mark-routing new-routing-mark='+x.table+' passthrough=no'));
    } else add(5,s.wan.length===1?'# Mot WAN: khong dung PCC':'# Failover: main routing table, khong dung PCC');
    add(5,'/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade comment='+q('AUTO WAN NAT'),
      // Established and invalid already handled at top of input in bootstrap stage.
      '/ip firewall filter add chain=input action=accept protocol=icmp in-interface-list=LAN',
      '/ip firewall filter add chain=input action=accept in-interface-list=LAN protocol=udp dst-port=53,67',
      '/ip firewall filter add chain=input action=accept in-interface-list=LAN protocol=tcp dst-port=53',
      '/ip firewall filter add chain=input action=accept in-interface=bridge-LAN src-address='+lanNet+' protocol=tcp dst-port=8291'+(s.system.ssh?',22':'')+' comment='+q('Management LAN only'),
      '/ip firewall filter add chain=input action=drop comment='+q('Drop all other input'),
      '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked',
      '/ip firewall filter add chain=forward action=drop connection-state=invalid');
    if(s.lan.interVlan)add(5,'/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface-list=LAN src-address-list=AUTO-LOCAL dst-address-list=AUTO-LOCAL comment='+q('Inter LAN enabled'));
    add(5,'/ip firewall filter add chain=forward action=accept in-interface-list=LAN src-address-list=AUTO-INET out-interface-list=WAN comment='+q('Internet for allowed clients'),
      '/ip firewall filter add chain=forward action=drop comment='+q('Default deny forward'));
    txt(6,'07 - PCQ FAIR SHARE');
    if(s.qos.enabled){
      const targets=[lanNet,...s.vlans.filter(x=>(x.mode||'routed')==='routed'&&x.internet!==false).map(x=>parseCIDR(x.gateway)?.subnet).filter(Boolean),...(s.ppp.enabled?[s.ppp.network]:[])];
      add(6,'/queue type add name=auto-pcq-up kind=pcq pcq-classifier=src-address pcq-rate=0',
        '/queue type add name=auto-pcq-down kind=pcq pcq-classifier=dst-address pcq-rate=0',
        '/queue simple add name=Auto-FairShare target='+targets.join(',')+' max-limit='+s.qos.upload.toUpperCase()+'/'+s.qos.download.toUpperCase()+' queue=auto-pcq-up/auto-pcq-down comment='+q('Shared cap; PCQ fairness'));
    }else add(6,'# PCQ: bo qua');
    return blocks.map((lines,i)=>({id:STAGE_INFO[i].id,title:STAGE_INFO[i].title,optional:STAGE_INFO[i].optional,
      enabled:i===3?!!s.vlans.length:i===4?!!s.ppp.enabled:i===6?!!s.qos.enabled:true,
      script: '# MikroTik Auto Config Studio v'+version()+' | BUOC '+(i+1)+'/7 | '+STAGE_INFO[i].title+'\r\n'
        +'# RouterOS 7 - Chi dan 1 lan tren No Default Configuration\r\n'
        +lines.filter(Boolean).join('\r\n')+'\r\n'}));
  }
  // Read-only commands to verify a lab router after applying each module.
  function diagnostics(s){
    const lines=['# MikroTik Auto Config Studio - KIEM TRA LAB (chi doc, khong thay doi cau hinh)',
      '/interface print detail','/interface pppoe-client print detail','/ip dhcp-client print detail',
      '/ip address print','/ip route print detail','/ip dns print','/system ntp client print',
      '/interface bridge port print','/interface bridge vlan print',
      '/ip dhcp-server print detail','/ip dhcp-server lease print',
      '/ip firewall mangle print stats','/ip firewall filter print stats','/ip firewall nat print stats',
      '/ppp active print','/queue simple print'];
    return lines.join('\r\n')+'\r\n';
  }
  function renderStages(s){return createStageScripts(s);}
  function render(s){
    const validation=validate(s);
    if(validation.errors.length)return {script:'',stages:[],...validation};
    const stages=createStageScripts(s);
    const top=['# MikroTik Auto Config Studio v'+version(),
      '# PROJECT: '+String(s.meta.project).replace(/[\r\n\x00-\x1f]/g,' '),
      '# RouterOS 7 - NO DEFAULT CONFIGURATION ONLY',
      '# CHI CHAY MOT LAN TREN ROUTER TRONG; KHONG DAN LAI SAU KHI DA CAU HINH TUNG BUOC.',
      '# DAY LA FILE CAU HINH TONG CHO MOT ROUTER MOI.', ''];
    const active=stages.filter(x=>x.enabled);
    return {script:top.join('\r\n')+'\r\n'+active.map(x=>x.script).join('\r\n')+'# SCRIPT COMPLETE\r\n',stages,...validation};
  }
  return {get VERSION(){return version();},STAGE_INFO,renderStages,MODELS,defaultState,ports,parseSpeed,computePcc,parseCIDR,ipToInt,intToIp,autoPool,parseUsers,validate,render,diagnostics,copy,q,getAlloc};
});