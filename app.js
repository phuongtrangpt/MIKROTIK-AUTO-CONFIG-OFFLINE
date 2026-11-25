/* MikroTik Auto Config Studio v1.5.0 — browser UI, runs entirely offline. */
(function(){
'use strict';
const C=window.MTCore;
const Updater=window.MTUpdater;
if(!C){document.body.textContent='Thiếu file core.js. Hãy giải nén toàn bộ ZIP trước khi mở index.html.';return;}
const STEPS=[
  ['Thiết bị & bảo mật','Chọn model, DNS, thời gian và bảo mật ban đầu.','01'],
  ['Đường Internet (WAN)','Xác nhận PPPoE trực tiếp hay VLAN 802.1Q theo nhà mạng; khai báo tài khoản và tốc độ WAN.','02'],
  ['Mạng LAN & DHCP','Tạo Bridge LAN, IP quản trị và DHCP Server.','03'],
  ['VLAN & phân cổng','Tạo VLAN trunk/access hoặc bỏ qua nếu không cần.','04'],
  ['PPPoE Server','Tạo máy chủ PPPoE, gói cước và danh sách tài khoản.','05'],
  ['PCC, NAT & Firewall','Tạo mangle cân bằng tải, NAT và firewall bảo vệ router.','06'],
  ['Chia băng thông PCQ','Chia đều tốc độ khi nhiều thiết bị cùng tải.','07'],
  ['Kiểm tra & hoàn tất','Xem toàn bộ script và xuất TXT/RSC hoặc lưu mẫu.','08']
];
let s=C.defaultState(),step=0,started=false,phase='form',furthest=0,showSecrets=false,toastTimeout=null;
const copiedSteps=new Set();
// Keep a snapshot of copied CLI, so editing previous steps cannot silently
// invalidate commands that may already have been pasted into Winbox.
const copiedScriptSnapshots=new Map();
let changedAfterCopy=false;
function invalidateCopiedScripts(){
 if(copiedScriptSnapshots.size){
  const stages=C.renderStages(s);
  if([...copiedScriptSnapshots].some(([idx,script])=>stages[idx]?.script!==script))changedAfterCopy=true;
 }
 copiedSteps.clear();
}

const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(path)=>path.split('.').reduce((a,k)=>a?.[k],s);
function set(path,value){const parts=path.split('.');let obj=s;for(let i=0;i<parts.length-1;i++)obj=obj[parts[i]];obj[parts.at(-1)]=value;}
function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.classList.remove('visible'),3300);}
function field(label,path,placeholder='',hint='',type='text'){return `<div class="field"><label for="f-${esc(path)}">${label}</label><input id="f-${esc(path)}" data-path="${esc(path)}" type="${type}" ${type==='password'?'autocomplete="off"':''} value="${esc(get(path))}" placeholder="${esc(placeholder)}">${hint?`<span class="hint">${hint}</span>`:''}</div>`;}
function select(label,path,options,hint=''){return `<div class="field"><label for="f-${esc(path)}">${label}</label><select data-path="${esc(path)}" id="f-${esc(path)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(get(path))===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select>${hint?`<span class="hint">${hint}</span>`:''}</div>`;}
function toggle(label,path,hint=''){return `<label class="checkrow"><input type="checkbox" data-path="${esc(path)}" ${get(path)?'checked':''}><span><strong>${label}</strong>${hint?`<small>${hint}</small>`:''}</span></label>`;}
function hSection(title,sub){return `<h2 class="section-title">${title}</h2><p class="section-sub">${sub}</p>`;}
function wanPage(){
 const wanCount=s.wan.length, all=C.ports(s);
 let html=hSection('Kết nối Internet','WAN mặc định bắt đầu từ ether1. Với PPPoE, hãy xác nhận nhà mạng yêu cầu quay trực tiếp hay gắn thẻ VLAN 802.1Q.');
 html+=`<div class="form-grid"><div class="field"><label for="wanCount">Số lượng đường WAN</label><select id="wanCount">${[1,2,3,4].map(x=>`<option value="${x}" ${wanCount===x?'selected':''}>${x} WAN</option>`).join('')}</select><span class="hint">Các cổng WAN được loại khỏi Bridge LAN.</span></div><div class="callout">${wanCount>1?'Có thể chọn PCC + Failover hoặc chỉ dùng Failover.':'Một WAN sẽ sử dụng default route đơn giản, không sinh PCC.'}</div></div><hr class="rule">`;
 s.wan.forEach((w,i)=>{
  html+=`<div class="wan-card"><div class="card-head"><strong>🌐 WAN ${i+1} <span class="badge-lite">${esc(w.type.toUpperCase())}</span></strong><small>${i===0?'WAN chính':'WAN dự phòng / cân bằng tải'}</small></div><div class="form-grid triple">`;
  html+=field('Tên nhà mạng',`wan.${i}.label`,'FPT / VNPT');
  html+=select('Cổng vật lý',`wan.${i}.port`,all.map(p=>[p,p]));
  html+=select('Kiểu kết nối',`wan.${i}.type`,[['pppoe','PPPoE Client'],['dhcp','DHCP Client'],['static','Static IP']]);
  html+='</div><div class="form-grid" style="margin-top:17px">';
  if(w.type==='pppoe'){
    html+=`<div class="field" style="grid-column:1/-1"><label>Hình thức quay PPPoE * — cần hỏi nhà mạng trước</label>
       ${select('Kết nối PPPoE của WAN '+(i+1),`wan.${i}.pppoeMode`,[['unknown','-- Chưa xác nhận với nhà mạng --'],['direct','PPPoE trực tiếp (untagged) trên '+w.port],['tagged','PPPoE qua VLAN 802.1Q (tagged)']])}
       <span class="hint">Đây là VLAN WAN của nhà mạng, KHÔNG phải VLAN LAN ở bước 4. Không suy đoán VLAN ID theo tên nhà mạng.</span></div>`;
    if(w.pppoeMode==='tagged')html+=field('VLAN ID do nhà mạng cung cấp *',`wan.${i}.vlanId`,'Ví dụ: 35','Số nguyên 1–4094. Phần mềm tạo VLAN trước rồi gắn PPPoE Client lên VLAN đó.');
    html+=`<label class="checkrow" style="align-self:end"><input type="checkbox" data-path="wan.${i}.ispConfirmed" ${w.ispConfirmed?'checked':''}><span><strong>Đã xác nhận với nhà mạng / kỹ thuật viên ONT *</strong><small>Đã kiểm tra hình thức quay PPPoE ${w.pppoeMode==='tagged'?'và VLAN ID đang nhập':w.pppoeMode==='direct'?'không cần tag VLAN':'(chưa chọn kiểu kết nối)'}; nếu đổi kiểu kết nối hoặc VLAN ID sẽ phải xác nhận lại.</small></span></label>`;
    html+=field('PPPoE Username *',`wan.${i}.user`,'Nhập tên tài khoản nhà mạng');
    html+=`<div class="field"><label for="pass-${i}">PPPoE Password *</label><div style="display:flex;gap:5px"><input id="pass-${i}" data-path="wan.${i}.password" type="password" autocomplete="off" value="${esc(w.password)}" placeholder="Nhập mật khẩu PPPoE"><button type="button" class="btn btn-outline btn-small" data-action="peek" data-input="pass-${i}" aria-label="Hiện hoặc ẩn mật khẩu">◉</button></div><span class="hint">Mật khẩu chỉ nằm trong bộ nhớ trình duyệt, trừ khi anh xuất script chứa mật khẩu.</span></div>`;
  }
  if(w.type==='static') {html+=field('WAN IP / Prefix *',`wan.${i}.ip`,'Ví dụ 203.0.113.2/30');html+=field('Gateway WAN *',`wan.${i}.gateway`,'Ví dụ 203.0.113.1');}
  if(w.type==='dhcp') html+='<div class="callout">WAN sẽ xin IP, gateway tự động từ modem/nhà mạng qua DHCP Client. Không cần nhập user/pass.</div>';
  html+=field('IP giám sát Internet (tùy chọn)',`wan.${i}.probe`,'Ví dụ 1.1.1.1','Dùng một địa chỉ trả lời ping riêng cho từng WAN. Để trống dùng kiểm tra cơ bản.');
  html+=field('Băng thông đăng ký với nhà mạng *',`wan.${i}.speed`,'250M hoặc 1G','Nhập tốc độ theo gói cước: 250M, 1000M, 1G. Dùng cho PCC tự tính tỷ lệ.');
  html+='</div></div>';
 });
 if(wanCount>1)html+=select("Chế độ nhiều WAN","system.wanMode",[["pcc","PCC + Failover"],["failover","Failover theo thứ tự WAN"]],"WAN 1 ưu tiên. Nếu bật WinBox WAN, app tạo thêm bảng để phản hồi đúng đường vào.")+`<div id="pccLive">${pccPanel()}</div>`;
 html+=`<div class="callout warn"><b>Quan trọng:</b> PCC sử dụng một WAN cho từng kết nối; không tăng tốc một kết nối đơn. Nhập IP giám sát nếu muốn kiểm tra đường Internet ngoài modem.</div>`;
 return html;
}
function pccPanel(){
 if(s.system.wanMode==='failover')return '<div class="callout">WAN dự phòng theo thứ tự khai báo; không tạo PCC.</div>';
 const ratio=C.computePcc(s.wan);
 return `<div class="soft-panel"><h3 class="subhead" style="margin:0 0 12px">⚖️ PCC tự động tính từ gói Internet</h3>${ratio.total?`<p class="helper">Tổng tốc độ khai báo: <b>${ratio.speeds.reduce((a,b)=>a+b,0).toLocaleString('vi-VN')} Mbps</b> • Chia <b>${ratio.total} phần</b></p><div class="pcc-ratio">${s.wan.map((w,i)=>`<div class="pcc-share"><div class="pcc-row"><strong>${esc(w.label)}</strong><span>${ratio.weights[i]} / ${ratio.total} phần (${(100*ratio.weights[i]/ratio.total).toFixed(1)}%)</span></div><div class="pcc-track"><span style="width:${100*ratio.weights[i]/ratio.total}%"></span></div></div>`).join('')}</div>`:'<p class="helper">Vui lòng nhập băng thông hợp lệ cho tất cả đường WAN.</p>'}<p class="hint">PCC chỉ phân chia số kết nối theo tỷ lệ tốc độ đã nhập; không đảm bảo thông lượng thực tế hoặc cộng tốc độ cho một kết nối đơn.</p></div>`;
}
function refreshPccPanel(){const target=el('pccLive');if(target)target.innerHTML=pccPanel();}
function portsSummary(){const a=C.getAlloc(s);return `<div class="soft-panel"><div class="subhead" style="margin-top:0">Phân bổ cổng hiện tại</div><div class="port-grid">${a.all.map(p=>{const wan=a.wanPorts.indexOf(p),ded=a.dedicated.includes(p),tag=a.trunk.includes(p),access=a.access.get(p);return `<div class="port-check"><b>${esc(p)}</b><span style="margin-left:auto;font-size:10px;color:#6d83a4">${wan>=0?'WAN'+(wan+1):ded?'PPPoE':access?'VLAN'+access:tag?'TRUNK':a.lanPorts.includes(p)?'LAN':'CHƯA GÁN'}</span></div>`;}).join('')}</div><p class="hint">Cổng LAN untagged dự phòng để quản trị: ${esc(a.management.join(', ')||'KHÔNG CÓ — SẼ BÁO LỖI')}.</p></div>`;}
function basicPage(){const modelOpts=Object.keys(C.MODELS).map(x=>[x,x]);return hSection('Cấu hình ban đầu','Thiết bị phải được reset no-defaults=yes và anh đã đặt mật khẩu quản trị trước khi chạy script.')+
 `<div class="form-grid">${field('Tên dự án / khách hàng','meta.project','Nhà trọ A / Khách hàng B')}${field('Tên RouterOS Identity','meta.identity','MT-KHACHHANG')}${select('Model thiết bị','meta.model',modelOpts)}${s.meta.model==='Tùy chỉnh'?field('Danh sách cổng','meta.customPorts','ether1,ether2,ether3,sfp1','Ngăn cách bằng dấu phẩy hoặc dấu cách.'):`<div class="field"><label>Phát hiện cổng theo model</label><div class="callout">${esc(C.ports(s).join(' · '))}</div></div>`}</div>
 <hr class="rule"><h2 class="section-title">DNS & Đồng bộ thời gian</h2><p class="section-sub">Sử dụng múi giờ Asia/Ho_Chi_Minh và cấu hình NTP để đồng bộ thời gian router.</p>
 <div class="form-grid">${field('DNS chính','system.dns1','1.1.1.1')}${field('DNS dự phòng','system.dns2','8.8.8.8')}${field('NTP Server 1','system.ntp1','time.google.com')}${field('NTP Server 2','system.ntp2','pool.ntp.org')}</div><hr class="rule">
 <h2 class="section-title">Bảo mật cơ bản</h2><p class="section-sub">Telnet, FTP, WebFig và API sẽ bị tắt; WinBox mặc định chỉ cho phép LAN; có thể chủ động mở từ WAN.</p>
 <div style="display:grid;gap:10px">${toggle('Cho phép WinBox từ Internet','system.remoteWinbox','Mở TCP 8291 trên WAN; cần mật khẩu mạnh và RouterOS cập nhật. Ưu tiên VPN nếu có.')}${s.system.remoteWinbox?field('Nguồn được truy cập WinBox từ WAN','system.remoteWinboxSources','203.0.113.10/32, 198.51.100.0/24','Để trống để giữ lựa chọn cho phép mọi IP trên WAN.'):''}${toggle('Cho phép SSH','system.ssh','Mặc định tắt SSH; nếu bật, chỉ cho kết nối từ mạng LAN quản trị.')}${toggle('Tắt IPv6 (bắt buộc cho mẫu IPv4 hiện tại)','system.disableIPv6','Bản này chưa sinh firewall/routing IPv6; phải tắt IPv6 để tránh vô tình mở truy cập từ WAN.')}</div>
 <div class="callout warn" style="margin-top:17px">Sau khi chạy script, Winbox qua MAC chỉ còn cho LAN; hãy nối máy của anh vào cổng LAN untagged và đặt IP cùng dải LAN nếu cần.</div>`;}
function lanPage(){const lan=C.parseCIDR(s.lan.gateway),pool=C.autoPool(lan),a=C.getAlloc(s);return hSection('Bridge LAN & DHCP','Chọn tất cả cổng LAN hoặc tự chọn chính xác cổng nào được đưa vào bridge-LAN. Cổng không chọn để dành cho PPPoE Server hoặc mục đích khác.')+
 `<div class="soft-panel"><h3 class="subhead" style="margin:0 0 9px">Phân cổng Bridge LAN</h3>${select('Chọn cổng đưa vào Bridge LAN','lan.portMode',[['all','Tất cả cổng còn lại (trừ WAN và PPPoE riêng)'],['custom','Tự chọn cổng LAN']])}${s.lan.portMode==='custom'?`<div class="field" style="margin-top:15px"><label>Chọn cổng thuộc bridge-LAN</label><div class="port-grid">${a.available.map(v=>`<label class="port-check ${a.dedicated.includes(v)?'disabled':''}"><input type="checkbox" data-lanport="${esc(v)}" ${s.lan.selectedPorts.includes(v)?'checked':''} ${a.dedicated.includes(v)?'disabled':''}>${esc(v)}</label>`).join('')}</div><span class="hint">Cổng không chọn KHÔNG được thêm vào bridge-LAN. Có thể dành cho PPPoE Server riêng ở bước 5.</span></div>`:''}</div><div class="form-grid">${field('Địa chỉ Gateway LAN (CIDR) *','lan.gateway','192.168.1.1/24','IP đặt cho bridge-LAN. Không nhập network .0 mà nhập IP router.')}${select('DHCP Lease Time','lan.lease',[['1h','1 giờ'],['12h','12 giờ'],['1d','1 ngày'],['3d','3 ngày'],['7d','7 ngày']])}</div><div style="margin-top:17px">${toggle('Bật DHCP Server cho LAN','lan.dhcp','Tự tạo IP Pool, DHCP Network và gateway cho client.')}</div>`+
 (s.lan.dhcp?`<div class="soft-panel"><h3 class="subhead" style="margin:0 0 12px">Dải DHCP cấp phát (để trống = tự chọn)</h3><div class="form-grid">${field('Pool Start','lan.poolStart',pool.start)}${field('Pool End','lan.poolEnd',pool.end)}</div><p class="hint">Tự đề xuất theo gateway hiện tại: ${esc(pool.start)} – ${esc(pool.end)}. Không chứa địa chỉ của router.</p></div>`:'')+
 `<hr class="rule">${toggle('Cho phép các mạng LAN/VLAN giao tiếp liên mạng','lan.interVlan','Mặc định chặn lưu lượng giữa các mạng khác subnet để phân tách an toàn.')}`+portsSummary();}
function portChoices(v,i,kind){const a=C.getAlloc(s),selected=v[kind]||[];return `<div class="port-grid">${a.all.map(p=>{const disabled=!a.lanPorts.includes(p);return `<label class="port-check ${disabled?'disabled':''}"><input type="checkbox" data-vport="${i}|${kind}|${esc(p)}" ${selected.includes(p)?'checked':''} ${disabled?'disabled':''}>${esc(p)}</label>`;}).join('')}</div>`;}
function vlanPage(){let html=hSection('VLAN Trunk / Access','VLAN có gateway và DHCP riêng hoặc loại PPPoE-only không gán IP trên interface VLAN.');
 html+=`<div class="btn-row" style="margin-bottom:19px"><button type="button" class="btn btn-primary btn-small" data-action="add-vlan">＋ Thêm VLAN</button><span class="helper">Trunk có thể chia sẻ cổng giữa nhiều VLAN; Access mỗi cổng chỉ thuộc một VLAN.</span></div>`;
 if(!s.vlans.length)html+='<div class="empty-state">Chưa có VLAN. Nếu không sử dụng, anh có thể bỏ qua bước này.</div>';
 s.vlans.forEach((v,i)=>{
  const c=C.parseCIDR(v.gateway),pool=C.autoPool(c);
  html+=`<div class="vlan-card"><div class="card-head"><strong>◫ VLAN ${esc(v.id||'?')} — ${esc(v.name||'Chưa đặt tên')}</strong><button type="button" class="btn btn-red btn-small" data-action="remove-vlan" data-index="${i}">Xóa</button></div><div class="form-grid triple">${field('Tên VLAN / Interface',`vlans.${i}.name`,'VLAN10')}${field('VLAN ID',`vlans.${i}.id`,'10','', 'number')}${select('Mục đích',`vlans.${i}.mode`,[['routed','VLAN có IP / DHCP'],['pppoe','PPPoE-only (Layer 2)']])}</div>`;
  if((v.mode||'routed')==='routed'){
    html+=`<div class="form-grid" style="margin:17px 0">${field('Gateway VLAN (CIDR)',`vlans.${i}.gateway`,'192.168.10.1/24')}<div class="field"><label>Trạng thái Internet</label>${toggle('Được phép ra Internet',`vlans.${i}.internet`,'Bỏ chọn để VLAN bị chặn Internet ở firewall.')}</div></div>${toggle('Bật DHCP cho VLAN',`vlans.${i}.dhcp`,'Tự tạo pool và DHCP network.')}`;
    if(v.dhcp)html+=`<div class="form-grid" style="margin-top:13px">${field('DHCP Start',`vlans.${i}.poolStart`,pool.start)}${field('DHCP End',`vlans.${i}.poolEnd`,pool.end)}</div>`;
  }else html+='<div class="callout" style="margin-top:14px">PPPoE-only không tạo gateway IP hoặc DHCP trên VLAN. Dùng VLAN này làm interface PPPoE Server.</div>';
  html+=`<h3 class="subhead">Cổng Trunk (Tagged) — đến Switch/AP</h3>${portChoices(v,i,'trunkPorts')}<h3 class="subhead">Cổng Access (Untagged) — thiết bị đầu cuối</h3>${portChoices(v,i,'accessPorts')}`;
  html+='</div>';
 });
 html+='<div class="callout warn">Giữ ít nhất một cổng LAN không phải Trunk/Access để quản trị IP/MAC Winbox. Khi bật VLAN Filtering có thể ngắt kết nối Winbox tạm thời.</div>';
 return html;
}
function pppPage(){let html=hSection('PPPoE Server cho khách hàng','Đặc biệt phù hợp mạng nhà trọ và hệ thống phát tài khoản thuê bao.')+toggle('Bật PPPoE Server','ppp.enabled','Tạo pool IP, profile, secret và máy chủ PPPoE từ danh sách tải lên.');
 if(!s.ppp.enabled)return html+'<div class="empty-state" style="margin-top:21px">PPPoE Server hiện đang tắt. Bật để khai báo cổng và nhập tài khoản.</div>';
 const a=C.getAlloc(s), options=a.all.filter(p=>!a.wanPorts.includes(p)).map(p=>[p,p]);
 const vlanOptions=s.vlans.filter(v=>v.mode==='pppoe').map(v=>[String(v.id),v.name+' (ID '+v.id+')']);
 html+='<hr class="rule"><div class="form-grid">';
 html+=select('Kiểu kết nối PPPoE Server','ppp.mode',[['bridge','Chạy chung trên bridge-LAN (mọi cổng LAN đã chọn)'],['ports','Dùng nhóm cổng vật lý riêng (tạo bridge-PPPoE)'],['vlan','Dùng VLAN PPPoE-only'],['port','1 cổng riêng (chế độ cũ)']]);
 if(s.ppp.mode==='bridge')html+=`<div class="callout warn"><b>PPPoE Server dùng chung bridge-LAN có IP:</b> MikroTik không khuyến nghị gán IP lên interface nhận PPPoE. Nên chọn bridge riêng hoặc VLAN PPPoE-only để ổn định và tách biệt mạng. <br>${esc(a.lanPorts.join(', ')||'chưa có cổng')}. ${s.lan.dhcp?'DHCP LAN đang bật trên cùng bridge; thiết bị có thể nhận DHCP mà không quay PPPoE.':''}</div>${toggle('Tôi hiểu rủi ro và xác nhận cố ý dùng chung bridge-LAN','ppp.sharedBridgeConfirmed','Bắt buộc xác nhận mới tạo lệnh PPPoE Server trong chế độ này.')}`;
 else if(s.ppp.mode==='ports')html+=`<div class="field wide"><label>Chọn các cổng riêng cho PPPoE Server</label><div class="port-grid">${options.map(([v])=>`<label class="port-check"><input type="checkbox" data-pppport="${esc(v)}" ${(s.ppp.ports||[]).includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><span class="hint">Các cổng này ghép vào bridge-PPPoE riêng, không dùng DHCP LAN. Nếu ở bước LAN chọn Tự chọn cổng, đừng chọn trùng cổng.</span></div>`;
 else if(s.ppp.mode==='port')html+=select('Cổng riêng (chế độ cũ)','ppp.port',options);
 else html+=select('VLAN chạy PPPoE Server','ppp.vlanId',vlanOptions.length?vlanOptions:[['','Chưa có VLAN PPPoE-only']]);
 html+=field('Service Name','ppp.service','MIKROTIK-PPPOE')+field('Local Address của Server','ppp.gateway','10.20.0.1')+field('Subnet PPPoE','ppp.network','10.20.0.0/24')+'<div></div>'+field('IP Pool Start','ppp.poolStart','10.20.0.10')+field('IP Pool End','ppp.poolEnd','10.20.0.250')+'</div>';
 html+=`<hr class="rule"><div class="card-head"><div><h2 class="section-title">Danh sách tài khoản PPPoE</h2><p class="section-sub" style="margin:2px 0 0">Mỗi dòng: <code>username,password,upload/download</code></p></div><button class="btn btn-outline btn-small" type="button" data-action="example-ppp">Mẫu TXT</button></div>`;
 html+=`<div class="field"><label for="pppText">Nhập thủ công hoặc dán nội dung TXT</label><textarea id="pppText" class="editor" data-path="ppp.usersText" spellcheck="false" rows="8" style="font-family:Consolas,monospace" placeholder="phong101,matkhau101,20M/50M&#10;phong102,matkhau102,30M/100M">${esc(s.ppp.usersText)}</textarea></div><div class="btn-row" style="margin:13px 0"><label class="btn btn-outline btn-small" for="pppTxtFile">↥ Nhập file TXT/CSV</label><input id="pppTxtFile" type="file" accept=".txt,.csv,text/plain,text/csv" hidden></div>`;
 const parsed=C.parseUsers(s.ppp.usersText);
 html+=`<div class="soft-panel"><b style="font-size:12px">Đã phân tích: ${parsed.users.length} tài khoản</b>${parsed.errors.length?`<ul class="err-list">${parsed.errors.slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${parsed.users.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Username</th><th>Password</th><th>Up / Down</th></tr></thead><tbody>${parsed.users.slice(0,8).map(u=>`<tr><td>${esc(u.name)}</td><td>••••••••</td><td>${esc(u.rate||'Không giới hạn')}</td></tr>`).join('')}</tbody></table></div>${parsed.users.length>8?`<span class="smallnote">Còn ${parsed.users.length-8} tài khoản khác…</span>`:''}`:''}</div>`;
 html+=`<div class="callout warn" style="margin-top:15px">Lưu ý: 20M/50M nghĩa là khách upload 20 Mbps, download 50 Mbps. File xuất RSC/TXT sẽ chứa mật khẩu dạng rõ; không chia sẻ công khai.</div>`;
 return html;
}
function qosPage(){let html=hSection('PCQ — chia đều thông minh','Khi ít thiết bị dùng mạng, thiết bị đó có thể đạt toàn bộ tốc độ khả dụng. Khi nhiều thiết bị cùng tải, PCQ phân chia theo địa chỉ IP.')+
 toggle('Bật chia băng thông bằng PCQ','qos.enabled','Không áp dụng FastTrack để Queue và định tuyến PCC hoạt động đúng.');
 if(s.qos.enabled)html+=`<div class="form-grid" style="margin-top:19px">${field('Tổng Upload (Router → Internet)','qos.upload','100M','Tốc độ tổng được cấp, ví dụ 100M.')}${field('Tổng Download (Internet → Client)','qos.download','500M','Tốc độ tổng được cấp, ví dụ 500M.')}</div><div class="soft-panel"><b>Nguyên lý chia sẻ (minh họa)</b><div class="stat-pairs" style="margin-top:14px"><div class="stat"><b>1</b><span>Người tải → tối đa giới hạn tổng</span></div><div class="stat"><b>10</b><span>Người tải → chia đều khi nghẽn</span></div></div></div>`;
 html+=`<div class="callout warn" style="margin-top:19px"><b>Lưu ý:</b> Tốc độ thực tế phụ thuộc ISP, CPU, đường truyền và lưu lượng. PCQ là một giới hạn chia sẻ tổng theo các subnet được chọn, không cộng gộp băng thông của nhiều WAN cho một phiên đơn lẻ. Nếu user PPPoE có rate-limit riêng, cần kiểm tra sự tương tác giữa các queue.</div>`;
 return html;
}
function firewallPage(){const errors=C.validate(s).errors;
 return hSection('Kích hoạt Internet và Firewall','Đây là bước bắt buộc sau LAN, VLAN và PPPoE Server. Tạo NAT, PCC nếu có nhiều WAN và bộ lọc an toàn cho router.')+
 `<div class="soft-panel"><h3 class="subhead" style="margin:0 0 9px">Cấu hình sẽ sinh</h3><div class="stat-pairs"><div class="stat"><b>${s.wan.length}</b><span>Đường WAN</span></div><div class="stat"><b>${s.wan.length>1?(s.system.wanMode==='failover'?'Failover':'PCC'):'NAT'}</b><span>${s.wan.length>1?(s.system.wanMode==='failover'?'Dự phòng theo thứ tự':'Cân bằng theo kết nối'):'Định tuyến WAN đơn'}</span></div></div><p class="helper" style="margin-top:14px">Firewall: NAT ra Internet, cho phép lưu lượng hợp lệ, hạn chế truy cập router từ WAN và chặn các kết nối chuyển tiếp không được phép. Không sử dụng FastTrack.</p></div>`+
 `<div class="callout warn" style="margin-top:16px"><b>Cẩn trọng:</b> Hãy dán các bước 1–5 trước khi dán bước này. Nếu đã thay đổi WAN, LAN hoặc VLAN sau khi dán lệnh cũ, phải reset router về No Default Configuration và tạo lại bộ lệnh mới; không dán đè.</div>`+
 (errors.length?`<div class="validation-panel fail"><b>Còn ${errors.length} lỗi trong cấu hình. Hãy sửa trước khi tạo lệnh bảo mật.</b><ul class="err-list">${errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'');
}
function welcomePage(){return `<div class="wizard-welcome"><div class="welcome-kicker">TRÌNH HƯỚNG DẪN • TỪNG BƯỚC • OFFLINE</div><div class="welcome-hero-icon">▦</div><h2>Thiết lập MikroTik mới chỉ bằng các bước Next</h2><p>Chọn thiết bị → nhập thông số → xem lệnh RouterOS → <b>Sao chép</b> vào Terminal Winbox → sang bước tiếp theo. Các module VLAN, PPPoE Server và PCQ có thể bỏ qua.</p><div class="welcome-steps"><span>① Nhập cấu hình</span><span>② Xem lệnh</span><span>③ Sao chép & dán</span><span>④ Tiếp tục</span></div><div class="callout warn"><b>Điều kiện bắt đầu:</b> RouterOS 7 đã reset với <code>no-defaults=yes</code>, anh tự đổi mật khẩu quản trị, kết nối Winbox qua MAC và giữ cổng LAN quản trị. Hướng dẫn này <b>không tự cấu hình router</b>; các lệnh được dán thủ công theo đúng thứ tự.</div><button type="button" class="btn btn-primary btn-wide" data-action="start-wizard">Bắt đầu cấu hình →</button></div>`;}
function errorsForStage(i){
 const all=C.validate(s).errors;
 if(i>=5)return all;
 function matches(error,j){
  if(j===0)return /^(Model|Tên RouterOS|Trùng cổng:|Tên cổng|DNS |Máy chủ NTP|IPv6:)/.test(error);
  if(j===1)return /^(WAN |Phiên bản đầu hỗ trợ)/.test(error);
  if(j===2)return /^(IP LAN|LAN:|Không còn cổng LAN|Phải giữ ít nhất 1 cổng LAN)/.test(error);
  if(j===3)return /^(VLAN |Cổng .*VLAN|Chồng dải IP|Phải giữ ít nhất 1 cổng LAN|WAN tĩnh.*trùng subnet)/.test(error);
  if(j===4)return /^(PPPoE Server|Trùng username|Dòng \d+|File PPPoE|Chồng dải IP)/.test(error);
  return false;
 }
 return all.filter(e=>Array.from({length:i+1},(_,j)=>matches(e,j)).some(Boolean));
}
function stepCodePage(){
 const stage=C.renderStages(s)[step];const errs=errorsForStage(step);const ok=!errs.length;
 let html=hSection('Lệnh RouterOS — Bước '+(step+1), 'Sao chép riêng đoạn lệnh này, dán vào Terminal Winbox và kiểm tra kết quả rồi mới sang bước tiếp theo.');
 html+=`<div class="code-workflow"><span class="pill green">Bước ${step+1}/7</span><span class="workflow-arrow">→</span><span>Copy</span><span class="workflow-arrow">→</span><span>Dán Winbox Terminal</span><span class="workflow-arrow">→</span><span>Next</span></div>`;
 if(!ok)html+=`<div class="validation-panel fail"><b>Không thể xuất lệnh bước này khi cấu hình còn lỗi.</b><ul class="err-list">${errs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><button class="btn btn-outline" type="button" data-action="edit-step">← Sửa thông số</button>`;
 else{
  html+=`<div class="code-header"><span class="code-title">${esc(stage.title)} — ${stage.script.trim().split(/\r?\n/).length} dòng</span><button class="btn btn-ghost btn-small" type="button" data-action="toggle-secrets">${showSecrets?'Ẩn mật khẩu':'Hiện mật khẩu'}</button></div>`;
  html+=`<pre class="codeblock code-per-step" id="stepCode">${esc(showSecrets?stage.script:redact(stage.script))}</pre>`;
  html+=`<div class="btn-row" style="margin:17px 0"><button class="btn btn-primary" type="button" data-action="copy-step">▣ Sao chép lệnh bước ${step+1}</button><button class="btn btn-outline" type="button" data-action="edit-step">← Sửa thông số</button></div>`;
  html+=`<div class="callout ${copiedSteps.has(step)?'':'warn'}">${copiedSteps.has(step)?'<b>Đã yêu cầu sao chép.</b> Hãy xác nhận đã dán thành công trong Winbox.':'<b>Chưa sao chép trong phiên làm việc này.</b> Sao chép và dán Terminal trước khi bấm Tiếp theo.'} <br>Mật khẩu trong khung xem trước được che; nút Copy luôn dùng mật khẩu thật. Tránh gửi script chứa mật khẩu cho người khác.</div>`;
 }
 return html;
}
function redact(text){return text.replace(/(password=)"(?:\\.|[^"\\])*"/g,'$1"********"').replace(/^# PROJECT:.*$/m,'# PROJECT: [du an]');}
function outputPage(){const result=C.render(s),ok=!result.errors.length;
 let html=hSection('Tổng hợp cấu hình hoàn chỉnh','Tệp tổng chỉ dành cho router mới reset No Default Configuration. Nếu đã dán lệnh từng bước, KHÔNG dán lại toàn bộ script vì sẽ bị trùng cấu hình.')+
 `<div class="stat-pairs"><div class="stat"><b>${result.errors.length}</b><span>Lỗi phải sửa</span></div><div class="stat"><b>${result.warnings.length}</b><span>Cảnh báo cần đọc</span></div></div>`;
 html+=`<div class="validation-panel ${ok?'':'fail'}"><b>${ok?'✓ Hợp lệ — Có thể sinh script':'⚠ Chưa thể xuất cấu hình'}</b>`;
 if(result.errors.length)html+=`<ul class="err-list">${result.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
 if(result.warnings.length)html+=`<ul class="warn-list">${result.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
 html+='</div>';
 if(ok){html+=`<div class="code-header"><span class="code-title">Bản xem trước RouterOS CLI • ${result.script.split(/\n/).length} dòng</span><button class="btn btn-ghost btn-small" type="button" data-action="toggle-secrets">${showSecrets?'Ẩn mật khẩu':'Hiện mật khẩu'}</button></div><pre class="codeblock" id="generatedCode">${esc(showSecrets?result.script:redact(result.script))}</pre><p class="smallnote">Bản xem trước mặc định che mật khẩu. Tệp tải xuống và lệnh copy sẽ chứa mật khẩu đầy đủ.</p><div class="btn-row" style="margin:20px 0"><button class="btn btn-primary" data-action="download-rsc">↓ Tải file .RSC</button><button class="btn btn-outline" data-action="download-txt">↓ Tải file .TXT</button><button class="btn btn-outline" data-action="copy">▣ Sao chép Terminal</button></div>`;}
 else html+='<div class="empty-state" style="margin:16px 0">Sửa các lỗi được liệt kê phía trên, sau đó quay lại bước cuối để xuất file.</div>';
 html+=`<div class="callout warn" style="margin-top:16px"><b>Kiểm tra cú pháp trước khi áp dụng:</b> Trên RouterOS 7.16+ có thể tải file .RSC lên router lab rồi chạy <code>import file-name=ten_file.rsc verbose=yes dry-run=yes</code>. Đây chỉ là kiểm thử cú pháp, vẫn cần kiểm tra trên thiết bị thật và không chạy lặp cấu hình.</div>`;
 html+=`<div class="soft-panel" style="margin-top:20px"><h3 class="subhead">Kiểm tra trên MikroTik sau khi dán script</h3><p class="helper">Sao chép các lệnh <b>chỉ đọc</b> để xem kết nối PPPoE, route, DHCP, VLAN, firewall, PCQ và các phiên khách hàng khi thử nghiệm lab.</p><button type="button" class="btn btn-outline btn-small" data-action="copy-diagnostics">▣ Sao chép lệnh kiểm tra (chỉ đọc)</button></div>`;
 html+=`<hr class="rule"><h2 class="section-title">Lưu / mở mẫu khách hàng</h2><p class="section-sub">Lưu cấu hình để chỉnh sửa lần sau. Mẫu JSON lưu cấu hình WAN và LAN. Nhập lại mật khẩu WAN và danh sách tài khoản PPPoE khi cần sinh lệnh.</p><div class="btn-row" style="margin-top:14px"><button class="btn btn-outline" data-action="save-json">↓ Lưu mẫu .JSON</button><button class="btn btn-red" data-action="reset-project">Tạo cấu hình mới</button></div>`;
 return html;
}
function renderStep(){
 const total=STEPS.length, title=!started?'Chào mừng':STEPS[step][0];
 el('pageTitle').textContent=title;
 el('pageDesc').textContent=!started?'Cài mới RouterOS 7 từng bước, xem lệnh và sao chép riêng từng module.':STEPS[step][1];
 el('topCrumb').textContent=title;
 el('stepMarker').textContent=(!started?'00':String(step+1).padStart(2,'0'))+' / '+String(total).padStart(2,'0');
 el('progressFill').style.width=(!started?0:((step+1)/total*100))+'%';
 el('sideNav').innerHTML=STEPS.map((x,i)=>`<button type="button" class="navbtn ${started&&i===step?'active':''}" data-step="${i}" ${!started||i>furthest?'disabled':''}><span class="nav-icon">${x[2]}</span><span>${esc(x[0])}</span>${started&&i===step?'<span class="nav-meta">'+(phase==='code'?'CODE':'●')+'</span>':''}</button>`).join('');
 el('sideVer').textContent=C.VERSION;
 const pages=[basicPage,wanPage,lanPage,vlanPage,pppPage,firewallPage,qosPage,outputPage];
 let content=!started?welcomePage():step===7?outputPage():phase==='code'?stepCodePage():pages[step]();
 if(started && phase==='form' && step<7){
   const errs=errorsForStage(step);
   if(errs.length)content+=`<div class="validation-panel fail"><b>Cần sửa ${errs.length} lỗi trước khi xem code bước này:</b><ul class="err-list">${errs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
 }
 if(started&&changedAfterCopy)content=`<div class="validation-panel fail"><b>⚠ Cấu hình đã thay đổi sau khi sao chép lệnh trước đó.</b><p class="helper">Nếu các lệnh cũ đã được dán vào router, hãy reset RouterOS về No Default Configuration rồi thực hiện lại theo đúng thứ tự. Không dán lệnh mới đè lên cấu hình cũ.</p></div>`+content;
 el('stepContent').innerHTML=content;
 el('prevStep').disabled=!started;
 el('skipStep').hidden=!started||phase==='code'||![3,4,6].includes(step);
 el('nextStep').textContent=!started?'Bắt đầu →':step===7?'Hoàn tất ✓':phase==='form'?'Xem lệnh bước này →':'Tiếp theo →';
 el('footerNote').textContent=(!started?'Chạy hoàn toàn offline • không kết nối router':phase==='code'?'Sao chép và dán đoạn code trước khi sang bước mới':'Nhập thông số trước khi tạo lệnh');
 updateSummary();
}
function advance(){
 if(!started){started=true;step=0;phase='form';renderStep();return;}
 if(step===7){toast('Đã hoàn tất quy trình. Có thể xuất file tổng dùng cho router mới.');return;}
 if(phase==='form'){
   const errs=errorsForStage(step);
   if(errs.length){toast('Còn '+errs.length+' lỗi ở bước này. Hãy sửa trước khi xem code.');renderStep();return;}
   if([3,4,6].includes(step) && (step===3&&!s.vlans.length || step===4&&!s.ppp.enabled || step===6&&!s.qos.enabled)){
     toast('Chưa bật chức năng này. Hãy cấu hình hoặc chọn Bỏ qua.');return;
   }
   phase='code';showSecrets=false;
 } else {
   if(!copiedSteps.has(step) && !window.confirm('Anh chưa sao chép lệnh bước này trong phiên làm việc. Vẫn tiếp tục?'))return;
   step++;phase='form';furthest=Math.max(furthest,step);showSecrets=false;
 }
 renderStep();window.scrollTo({top:0,behavior:'smooth'});
}
function goBack(){
 if(!started)return;
 if(step===7){step=6;phase='form';}
 else if(phase==='code')phase='form';
 else if(step>0){step--;phase='form';}
 else {started=false;phase='form';}
 renderStep();window.scrollTo({top:0,behavior:'smooth'});
}
function skipCurrent(){
 if(!started||phase!=='form'||![3,4,6].includes(step))return;
 if(step===3){
   if(s.vlans.length&&!confirm('Bỏ qua sẽ xóa toàn bộ VLAN đang khai báo. Tiếp tục?'))return;
   if(s.ppp.enabled&&s.ppp.mode==='vlan'&&!confirm('PPPoE Server đang dùng VLAN; bỏ qua VLAN sẽ khiến cấu hình này không hợp lệ. Tiếp tục?'))return;
   s.vlans=[];
 }
 if(step===4)s.ppp.enabled=false;
 if(step===6)s.qos.enabled=false;
 invalidateCopiedScripts();
 step++;phase='form';furthest=Math.max(furthest,step);
 renderStep();window.scrollTo({top:0,behavior:'smooth'});toast('Đã bỏ qua module không sử dụng.');
}
function updateSummary(){
 const result=C.validate(s),a=result.alloc;const all=C.ports(s);const relevant=started && step<7 ? errorsForStage(step) : []; 
 el('summaryPanel').innerHTML=`<div class="summary-card"><div class="summary-heading"><span class="circle">▦</span> Tóm tắt cấu hình</div><div class="sum-item"><span class="sum-label">Dự án</span><span class="sum-val">${esc(s.meta.project)}</span></div><div class="sum-item"><span class="sum-label">Model</span><span class="sum-val">${esc(s.meta.model)}</span></div><div class="sum-item"><span class="sum-label">Cổng thiết bị</span><span class="sum-val">${all.length}</span></div><div class="line"></div><div class="sum-item"><span class="sum-label">WAN</span><span class="sum-val">${s.wan.length}</span></div>${s.wan.map((w,i)=>`<div class="sum-item"><span class="sum-label">↳ ${esc(w.port)}</span><span class="sum-val">${esc(w.label||'WAN'+(i+1))} / ${esc(w.type==='pppoe'?(w.pppoeMode==='tagged'?'PPPoE VLAN '+w.vlanId:w.pppoeMode==='direct'?'PPPoE trực tiếp':'PPPoE chưa xác nhận'):w.type.toUpperCase())}</span></div>`).join('')}<div class="sum-item"><span class="sum-label">Cổng LAN</span><span class="sum-val">${a.lanPorts.length}</span></div><div class="sum-item"><span class="sum-label">Tỷ lệ PCC</span><span class="sum-val">${esc(C.computePcc(s.wan).weights.join(' : ')||'Chưa có')}</span></div><div class="sum-item"><span class="sum-label">Gateway LAN</span><span class="sum-val">${esc(s.lan.gateway)}</span></div><div class="sum-item"><span class="sum-label">VLAN</span><span class="sum-val">${s.vlans.length}</span></div><div class="sum-item"><span class="sum-label">PPPoE Server</span><span class="sum-val">${s.ppp.enabled?'Bật ('+C.parseUsers(s.ppp.usersText).users.length+' user)':'Tắt'}</span></div><div class="sum-item"><span class="sum-label">PCQ</span><span class="sum-val">${s.qos.enabled?'Bật':'Tắt'}</span></div><div class="line"></div><div class="summary-heading" style="font-size:12px">${relevant.length?'<span class="pill red">'+relevant.length+' lỗi bước này</span>':'<span class="pill green">Bước này hợp lệ</span>'}<span class="pill orange">${result.warnings.length} lưu ý</span></div>${relevant.slice(0,3).map(x=>`<div class="summary-error">• ${esc(x)}</div>`).join('')}${relevant.length>3?`<div class="smallnote" style="margin-top:8px">+ ${relevant.length-3} lỗi khác — xem chi tiết bên trái</div>`:''}</div><div class="summary-card"><div class="summary-heading">🔒 An toàn triển khai</div><p class="helper">RouterOS 7 · No Default Config. Tự kiểm tra lỗi xung đột IP/VLAN/port trước khi xuất. Không áp dụng trực tiếp lên thiết bị.</p><span class="pill green">100% xử lý tại máy</span></div>`;
}
function addVlan(){const ids=s.vlans.map(v=>Number(v.id));let id=10;while(ids.includes(id))id+=10;s.vlans.push({id,name:'VLAN'+id,mode:'routed',gateway:'192.168.'+id+'.1/24',dhcp:true,poolStart:'',poolEnd:'',internet:true,trunkPorts:[],accessPorts:[]});invalidateCopiedScripts();renderStep();toast('Đã tạo VLAN '+id+'. Chọn cổng Trunk hoặc Access.');}
function changeWanCount(n){const all=C.ports(s);if(n>all.length){toast('Không đủ cổng vật lý trên thiết bị.');return;}const old=s.wan;
 s.wan=Array.from({length:n},(_,i)=>old[i]||{label:'WAN'+(i+1),port:all[i]||'ether'+(i+1),type:'pppoe',pppoeMode:'unknown',ispConfirmed:false,vlanId:'',user:'',password:'',ip:'',gateway:'',probe:'',weight:1,speed:'500M'});
 const used=new Set();s.wan.forEach((w,i)=>{if(!all.includes(w.port)||used.has(w.port))w.port=all.find(p=>!used.has(p))||w.port;used.add(w.port);});
 if(s.wan.some(w=>w.port===s.ppp.port))s.ppp.port=all.findLast(p=>!s.wan.some(w=>w.port===p))||'';
 s.lan.selectedPorts=(s.lan.selectedPorts||[]).filter(p=>!s.wan.some(w=>w.port===p));
 s.ppp.ports=(s.ppp.ports||[]).filter(p=>!s.wan.some(w=>w.port===p));
 invalidateCopiedScripts();renderStep();}
function projectSnapshot(){
 const data=mergeKnown(C.defaultState(),s);
 data.wan.forEach(w=>w.password='');
 data.ppp.usersText='';
 return {app:'MikroTik Auto Config Studio',schema:1,version:C.VERSION,containsSecrets:false,data};
}
function loadProject(data){
 s=mergeKnown(C.defaultState(),data);
 if(!s.wan.length)s.wan=C.defaultState().wan;
 s.wan.forEach(w=>{if(w.type==='pppoe')w.ispConfirmed=false;});
 step=0;furthest=7;started=true;phase='form';copiedSteps.clear();
 copiedScriptSnapshots.clear();changedAfterCopy=false;showSecrets=false;renderStep();
}
function download(data,name,mime){const blob=new Blob([data],{type:mime});const u=URL.createObjectURL(blob);const link=document.createElement('a');link.href=u;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);}
function filename(ext){return (s.meta.project.trim().replace(/[^A-Za-z0-9_-]/g,'_').slice(0,35)||'MikroTik')+'_RouterOS7.'+ext;}
function safeConfirm(){return window.confirm('Script TXT/RSC sẽ chứa mật khẩu PPPoE ở dạng đọc được. Chỉ sử dụng trên RouterOS 7 trống, không chia sẻ file công khai. Tiếp tục?');}
function copyScript(str,onSuccess){
 function success(){toast('Đã sao chép lệnh; kiểm tra và dán trong Winbox.');if(onSuccess)onSuccess();}
 function fallback(){
   const t=document.createElement('textarea');t.value=str;t.style.position='fixed';t.style.left='-9999px';document.body.appendChild(t);t.select();let ok=false;
   try{ok=document.execCommand('copy');}catch{}t.remove();
   if(ok)success();else toast('Trình duyệt chặn Copy. Hãy chọn thủ công trong khung code hoặc xuất TXT/RSC.');
 }
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(str).then(success).catch(fallback);
 else fallback();
}
function mergeKnown(target,data){if(!data||typeof data!=='object'||Array.isArray(data))return target;
 for(const key of Object.keys(target)){if(!Object.hasOwn(data,key))continue;const val=data[key];if(Array.isArray(target[key])){if(Array.isArray(val)){if(key==='peers'){
 target[key]=val.slice(0,32).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>mergeKnown({key:'',ip:'',networks:'',endpoint:'',port:'51820'},x));
 }else if(key==='wan'||key==='vlans'){target[key]=val.slice(0,key==='wan'?4:40).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>{const shape=key==='wan'?C.defaultState().wan[0]:{id:10,name:'VLAN10',mode:'routed',gateway:'192.168.10.1/24',dhcp:true,poolStart:'',poolEnd:'',internet:true,trunkPorts:[],accessPorts:[]};const item=mergeKnown(shape,x);if(key==='wan'&&typeof item.speed!=='string')item.speed='500M';if(key==='vlans'){item.trunkPorts=Array.isArray(x.trunkPorts)?x.trunkPorts.filter(y=>typeof y==='string').slice(0,30):[];item.accessPorts=Array.isArray(x.accessPorts)?x.accessPorts.filter(y=>typeof y==='string').slice(0,30):[];}return item;});}else if(key==='selectedPorts'||key==='ports'){target[key]=val.filter(y=>typeof y==='string').slice(0,32);}}}
 else if(target[key]&&typeof target[key]==='object'){mergeKnown(target[key],val);}
 else if(typeof target[key]===typeof val && (['string','number','boolean'].includes(typeof val))){target[key]=val;}
 }
 return target;
}
async function readJSON(file){if(!file)return;try{if(file.size>1000000)throw new Error('Mẫu JSON quá lớn (tối đa 1MB).');const obj=JSON.parse(await file.text());if(obj.app!=='MikroTik Auto Config Studio'||obj.schema!==1||!obj.data)throw new Error('Không đúng định dạng mẫu cấu hình phiên bản 1.');if(obj.containsSecrets&&!confirm('Mẫu chứa mật khẩu. Chỉ nhập từ nguồn tin cậy. Tiếp tục?'))return;
 loadProject(obj.data);toast('Đã mở mẫu cấu hình. Kiểm tra lại thông tin WAN trước khi xuất.');}catch(err){toast('Không đọc được JSON: '+err.message);}}
function eventClick(e){const nav=e.target.closest('[data-step]');if(nav){const to=Number(nav.dataset.step);if(!started||to>furthest)return;step=to;phase='form';showSecrets=false;renderStep();window.scrollTo({top:0,behavior:'smooth'});return;}
 const btn=e.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action;
 if(action==='start-wizard'){started=true;step=0;phase='form';renderStep();return;}
 if(action==='edit-step'){phase='form';renderStep();return;}
 if(action==='copy-step'){
   const errs=errorsForStage(step);if(errs.length){toast('Cấu hình còn lỗi.');return;}
   const stage=C.renderStages(s)[step];
   copyScript(stage.script,()=>{copiedSteps.add(step);copiedScriptSnapshots.set(step,stage.script);renderStep();});return;
 }
 if(action==='add-vlan')return addVlan();
 if(action==='remove-vlan'){if(confirm('Xóa VLAN này khỏi cấu hình?')){s.vlans.splice(Number(btn.dataset.index),1);invalidateCopiedScripts();renderStep();}return;}
 if(action==='peek'){const input=el(btn.dataset.input);input.type=input.type==='password'?'text':'password';return;}
 if(action==='example-ppp'){if(s.ppp.usersText&&!confirm('Thay danh sách PPPoE hiện tại bằng dữ liệu ví dụ?'))return;s.ppp.usersText='phong101,matkhau101,20M/50M\nphong102,matkhau102,30M/100M\nphong103,matkhau103,50M/150M';invalidateCopiedScripts();renderStep();return;}
 if(action==='toggle-secrets'){showSecrets=!showSecrets;renderStep();return;}
 if(action==='reset-project'){if(confirm('Xóa toàn bộ thông tin đang nhập? (Không thể khôi phục nếu chưa lưu mẫu.)')){s=C.defaultState();step=0;furthest=0;started=false;phase='form';copiedSteps.clear();copiedScriptSnapshots.clear();changedAfterCopy=false;showSecrets=false;renderStep();}return;}
 if(action==='copy-diagnostics'){copyScript(C.diagnostics(s));return;}
 if(action==='save-json'){download(JSON.stringify(projectSnapshot(),null,2),filename('json'),'application/json;charset=utf-8');toast('Đã tạo mẫu JSON.');return;}
 if(['download-rsc','download-txt','copy'].includes(action)) {const r=C.render(s);if(r.errors.length){toast('Cấu hình có lỗi; chưa thể xuất script.');renderStep();return;}if(!safeConfirm())return;
 if(action==='copy')copyScript(r.script);else{download(r.script,filename(action==='download-rsc'?'rsc':'txt'),'text/plain;charset=utf-8');toast('Đã tạo file '+(action==='download-rsc'?'.RSC':'.TXT')+'.');}return;}
}
function eventChange(e){const t=e.target;if(t.id==='wanCount')return changeWanCount(Number(t.value));
 if(t.id==='pppTxtFile'){const file=t.files[0];if(!file)return;if(file.size>500000){toast('TXT quá lớn, tối đa 500 KB.');return;}file.text().then(x=>{s.ppp.usersText=x;invalidateCopiedScripts();renderStep();toast('Đã đọc '+C.parseUsers(x).users.length+' tài khoản từ TXT/CSV.');}).catch(()=>toast('Không đọc được file TXT.'));return;}
 if(t.id==='importJsonFile'){readJSON(t.files[0]);t.value='';return;}
 if(t.dataset.lanport){const port=t.dataset.lanport;if(t.checked){if(!s.lan.selectedPorts.includes(port))s.lan.selectedPorts.push(port);}else s.lan.selectedPorts=s.lan.selectedPorts.filter(p=>p!==port);invalidateCopiedScripts();renderStep();return;}
 if(t.dataset.pppport){const port=t.dataset.pppport;if(t.checked){if(!s.ppp.ports.includes(port))s.ppp.ports.push(port);}else s.ppp.ports=s.ppp.ports.filter(p=>p!==port);invalidateCopiedScripts();renderStep();return;}
 if(t.dataset.vport){const [i,kind,p]=t.dataset.vport.split('|'),arr=s.vlans[Number(i)][kind];if(t.checked){if(!arr.includes(p))arr.push(p);}else s.vlans[Number(i)][kind]=arr.filter(x=>x!==p);invalidateCopiedScripts();renderStep();return;}
 if(t.dataset.path){const path=t.dataset.path;let val=t.type==='checkbox'?t.checked:t.value;
 if(path==='wan.0.weight'||/\.weight$/.test(path)||/\.id$/.test(path))val=Number(val);
 set(path,val);
 if(path==='ppp.mode'||path==='lan.dhcp')s.ppp.sharedBridgeConfirmed=false;
 invalidateCopiedScripts();
 // A changed ISP method requires fresh explicit confirmation. Never carry the old confirmation across.
 if(/^wan\.\d+\.(pppoeMode|type|port)$/.test(path)){
   const w=s.wan[Number(path.split('.')[1])];w.ispConfirmed=false;
   if(path.endsWith('.pppoeMode')&&val!=='tagged')w.vlanId='';
 }
 if(/^vlans\.\d+\.mode$/.test(path)){const v=s.vlans[Number(path.split('.')[1])];if(v.mode==='pppoe')v.dhcp=false;}
 if(path==='ppp.mode'&&val==='vlan'){const valid=s.vlans.filter(v=>v.mode==='pppoe');if(!valid.some(v=>String(v.id)===String(s.ppp.vlanId)))s.ppp.vlanId=valid.length?String(valid[0].id):'';}
 if(path==='meta.model'){const modelPorts=C.ports(s);const used=new Set();s.wan.forEach((w,i)=>{if(!modelPorts.includes(w.port)||used.has(w.port))w.port=modelPorts.find(p=>!used.has(p))||'';used.add(w.port);});if(!modelPorts.includes(s.ppp.port)||used.has(s.ppp.port))s.ppp.port=modelPorts.findLast(p=>!used.has(p))||'';s.vlans.forEach(v=>{v.trunkPorts=(v.trunkPorts||[]).filter(p=>modelPorts.includes(p));v.accessPorts=(v.accessPorts||[]).filter(p=>modelPorts.includes(p));});s.lan.selectedPorts=(s.lan.selectedPorts||[]).filter(p=>modelPorts.includes(p));s.ppp.ports=(s.ppp.ports||[]).filter(p=>modelPorts.includes(p));}
 if(t.type==='checkbox'||t.tagName==='SELECT'||t.type==='number')renderStep();else updateSummary();
 }
}
function eventInput(e){const t=e.target;if(t.dataset.path&&t.type!=='checkbox'&&t.tagName!=='SELECT'){
 let val=t.value;if(/\.weight$/.test(t.dataset.path)||/\.id$/.test(t.dataset.path))val=Number(val);
 set(t.dataset.path,val);invalidateCopiedScripts();
 if(/^wan\.\d+\.vlanId$/.test(t.dataset.path)){
   const i=Number(t.dataset.path.split('.')[1]);s.wan[i].ispConfirmed=false;
   // Keep visible confirmation checkbox consistent with state as VLAN ID is edited.
   const checkbox=el('stepContent').querySelector?.('[data-path="wan.'+i+'.ispConfirmed"]');
   if(checkbox)checkbox.checked=false;
 }
 // Avoid re-rendering form on keystrokes so password input, caret and IME remain stable.
 if(/^wan\.\d+\.(speed|label)$/.test(t.dataset.path))refreshPccPanel();
 updateSummary();
 }}

// Kiểm tra phiên bản khi người dùng yêu cầu; không gửi cấu hình/mật khẩu lên GitHub.
let lastUpdateLink='';
function showUpdatePanel(body){
 const panel=el('updatePanel');
 if(!panel)return;
 panel.innerHTML='<div class="update-title"><span>↻ Cập nhật MikroTik Studio</span><button type="button" id="closeUpdatePanel" aria-label="Đóng">×</button></div>'+body;
 panel.hidden=false;
 const close=el('closeUpdatePanel');
 if(close)close.addEventListener('click',()=>{panel.hidden=true;});
 const retry=el('retryUpdateDownload');
 if(retry)retry.addEventListener('click',()=>{if(lastUpdateLink)downloadReleaseZip(lastUpdateLink);});
}
function downloadReleaseZip(url){
 // Chỉ tải đường dẫn đã được xác minh chính xác từ repository chính thức.
 try{
   const link=document.createElement('a');
   link.href=url;link.rel='noopener noreferrer';
   document.body.appendChild(link);link.click();link.remove();
   return true;
 }catch(err){toast('Trình duyệt không cho tải ZIP tự động. Thử nút Tải ZIP bên dưới.');return false;}
}
async function checkUpdateAndDownload(){
 const button=el('updateCheckButton');
 if(!Updater){toast('Thiếu update.js. Hãy giải nén đủ file.');return;}
 if(button.disabled)return;
 button.disabled=true;button.textContent='Đang kiểm tra...';lastUpdateLink='';
 showUpdatePanel('<p>Đang kết nối GitHub Releases để tìm bản mới nhất. Chỉ truy vấn thông tin phiên bản, không gửi dữ liệu khách hàng.</p>');
 try{
   const release=await Updater.checkLatest(C.VERSION);
   if(release.state==='current'){
     showUpdatePanel('<p>✓ <b>Đang dùng phiên bản mới nhất: v'+esc(C.VERSION)+'</b>.</p><p>Khi có bản mới, anh chỉ cần nhấn nút kiểm tra một lần nữa.</p>');
   }else{
     lastUpdateLink=release.url;
     const triggered=downloadReleaseZip(release.url);
     showUpdatePanel('<p>Đã tìm thấy <b>v'+esc(release.version)+'</b> (máy đang dùng <b>v'+esc(C.VERSION)+'</b>).</p>'+
       '<p>'+(triggered?'Đã yêu cầu trình duyệt tải ZIP mới nhất. Kiểm tra mục Downloads của trình duyệt.':'Chưa thể tự khởi động tải ZIP.')+'</p>'+
       '<div class="btn-row"><button class="btn btn-primary btn-small" id="retryUpdateDownload" type="button">↓ Tải ZIP lại</button></div>'+
       '<div class="note"><b>Cập nhật tại chỗ trên Windows:</b> để tự tải, sao lưu và thay file chương trình mà không cần giải nén thủ công, hãy chạy <code>CAP_NHAT_TU_DONG.bat</code> trong thư mục phần mềm. Trình duyệt không có quyền ghi đè file đang chạy. Nên lưu mẫu JSON trước khi cập nhật.</div>');
   }
 }catch(err){
   showUpdatePanel('<p>⚠ <b>Không kiểm tra được phiên bản mới.</b></p><p>'+esc(err?.message||String(err))+'</p><div class="note">Cần kết nối Internet để kiểm tra GitHub; chức năng cấu hình MikroTik vẫn hoạt động offline bình thường.</div>');
 }finally{button.disabled=false;button.textContent='↻ Kiểm tra cập nhật';}
}

el('stepContent').addEventListener('click',eventClick);
el('sideNav').addEventListener('click',eventClick);
el('stepContent').addEventListener('change',eventChange);
el('stepContent').addEventListener('input',eventInput);
el('stepContent').addEventListener('keydown',e=>{if(e.key==='Tab')return;});
el('importJsonTop').addEventListener('click',()=>el('importJsonFile').click());
if(window.MTDesktop)window.MTDesktop.start({
 projectSnapshot,loadProject,toast,download,state:()=>C.copy(s),
 setWireGuard:config=>{s.wireguard=config;}
});
else el('updateCheckButton').addEventListener('click',checkUpdateAndDownload);
el('importJsonFile').addEventListener('change',eventChange);
el('prevStep').addEventListener('click',goBack);
el('nextStep').addEventListener('click',advance);
el('skipStep').addEventListener('click',skipCurrent);
renderStep();
})();