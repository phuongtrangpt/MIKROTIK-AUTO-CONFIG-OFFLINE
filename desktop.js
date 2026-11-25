'use strict';

window.MTDesktop = {
  start({projectSnapshot, loadProject, toast, download, copyScript, state, setWireGuard}) {
    const byId = id => document.getElementById(id);
    const button = (id, label) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'btn btn-outline btn-small';
      item.id = id;
      item.textContent = label;
      byId('updateCheckButton').before(item);
      return item;
    };
    const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
    const theme = button('desktopTheme', 'Nền tối');
    function setTheme(dark) {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      theme.textContent = dark ? 'Nền sáng' : 'Nền tối';
    }
    setTheme((localStorage.getItem('studio-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark');
    theme.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      setTheme(dark);
      localStorage.setItem('studio-theme', dark ? 'dark' : 'light');
    });
    document.querySelector('.offline-box').textContent = 'Xuất script offline · API theo yêu cầu';

    const dialog = document.createElement('dialog');
    dialog.className = 'studio-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="studio-close"><button class="btn btn-outline btn-small">Đóng</button></form>
      <section id="studioProjects" hidden>
        <h2>Dự án khách hàng</h2>
        <div class="field"><label for="studioProjectName">Tên dự án</label><input id="studioProjectName" maxlength="80"></div>
        <div class="btn-row"><button class="btn btn-primary" id="studioProjectSave">Lưu cấu hình hiện tại</button></div>
        <ul id="studioProjectList"></ul>
      </section>
      <section id="studioRemote" hidden>
        <h2 id="studioRemoteTitle">Quản trị dự án</h2>
        <p id="studioRemoteStatus" role="status"></p>
        <div id="studioRemoteFinish" hidden>
          <div class="field"><label for="studioRemoteName">Tên dự án</label><input id="studioRemoteName" maxlength="80" required></div>
          <label class="checkrow"><input id="studioRemoteFetch" type="checkbox"> Chuẩn bị Fetch cho NetWatch</label>
          <div id="studioRemoteFetchHelp" hidden>
            <p class="hint">Dùng <code>/system/device-mode/print</code> để kiểm tra. Nếu Fetch đang tắt, chạy lệnh bên dưới khi ở cạnh router và xác nhận theo thông báo của RouterOS. Sau đó nhập script NetWatch riêng.</p>
            <button class="btn btn-outline btn-small" id="studioRemoteFetchCopy" type="button">Sao chép lệnh bật Fetch</button>
          </div>
          <label class="checkrow"><input id="studioRemoteEnable" type="checkbox"> Thiết lập WireGuard để quản trị từ xa</label>
        </div>
        <form id="studioRemoteSetup" hidden>
          <div class="studio-grid">
            <div class="field"><label for="studioRemoteEndpoint">DNS MikroTik Cloud hoặc IP WAN</label><input id="studioRemoteEndpoint" required maxlength="254" placeholder="router.sn.mynetname.net"></div>
            <div class="field"><label for="studioRemotePort">Cổng UDP WireGuard</label><input id="studioRemotePort" type="number" required value="51820" min="1" max="65535"></div>
            <div class="field"><label for="studioRemoteWan">Interface WAN (tùy chọn)</label><input id="studioRemoteWan" maxlength="60" placeholder="Để trống nếu router có danh sách WAN"></div>
            <div class="field"><label for="studioRemoteAddress">IP router trong đường hầm /30</label><input id="studioRemoteAddress" required></div>
          </div>
          <label class="checkrow"><input id="studioRemoteReuse" type="checkbox"> Giữ API-SSL đã cài trên router</label>
          <div id="studioRemoteReuseOptions" class="studio-grid" hidden>
            <div class="field"><label for="studioRemoteApiPort">Cổng API-SSL hiện tại</label><input id="studioRemoteApiPort" type="number" value="8729" min="1" max="65535"></div>
            <div class="field"><label for="studioRemoteTlsName">Tên trên chứng chỉ hiện tại</label><input id="studioRemoteTlsName" maxlength="254"></div>
            <div class="field"><label for="studioRemoteCa">CA PEM hiện tại (nếu dùng CA nội bộ)</label><textarea id="studioRemoteCa" maxlength="32768" rows="2"></textarea></div>
          </div>
          <p class="hint">Với router mới, áp dụng cấu hình Internet và firewall trước. Với router đang chạy, dùng WinBox để áp dụng phần bổ sung VPN một lần.</p>
          <button class="btn btn-primary" type="submit">Tạo VPN và lưu dự án</button>
        </form>
        <button class="btn btn-primary" id="studioRemoteSaveOnly" type="button" hidden>Lưu dự án</button>
        <div id="studioRemoteConnectPanel" hidden>
          <p id="studioRemoteEndpointView"></p>
          <details>
            <summary>Cài VPN trên router lần đầu</summary>
            <p id="studioRemoteApplyHint" class="hint"></p>
            <button class="btn btn-outline" id="studioRemoteCopy" type="button">Sao chép lệnh cài VPN</button>
            <p class="hint">Đoạn lệnh chứa khóa của router. Dán trực tiếp vào Terminal WinBox, giữ riêng cho dự án. Đợi dòng <code>Studio VPN ready</code>.</p>
          </details>
          <form id="studioRemoteConnect">
            <div class="studio-grid">
              <div class="field"><label for="studioRemoteUser">Tài khoản RouterOS</label><input id="studioRemoteUser" required maxlength="128" autocomplete="off"></div>
              <div class="field"><label for="studioRemotePassword">Mật khẩu RouterOS</label><input id="studioRemotePassword" required type="password" maxlength="256" autocomplete="off"></div>
            </div>
            <div class="btn-row">
              <button class="btn btn-primary" type="submit">Kết nối VPN</button>
              <button class="btn btn-outline" id="studioRemoteDisconnect" type="button">Ngắt VPN</button>
            </div>
          </form>
          <p class="hint">Dùng WireGuard for Windows. Windows có thể yêu cầu quyền quản trị để bật đường hầm.</p>
        </div>
      </section>
      <section id="studioWireGuard" hidden>
        <h2>Tạo cấu hình WireGuard</h2>
        <p class="hint">Chạy script sau cấu hình cơ sở. Với Remote Access và Hub, thiết bị ngoài kết nối vào WAN 1. Cấu hình chỉ cấp quyền đến các mạng nội bộ được chọn.</p>
        <div class="studio-grid">
          <div class="field"><label for="studioVpnRole">Mô hình</label><select id="studioVpnRole"><option value="remote">Remote Access</option><option value="hub">Hub tập trung</option><option value="site">Site-to-Site / chi nhánh</option></select></div>
          <div class="field"><label for="studioVpnName">Interface</label><input id="studioVpnName" value="wg-studio"></div>
          <div class="field"><label for="studioVpnIp">IP router trong VPN</label><input id="studioVpnIp" placeholder="10.80.0.1/24"></div>
          <div class="field"><label for="studioVpnPort">Cổng UDP</label><input id="studioVpnPort" type="number" min="1" max="65535" value="51820"></div>
        </div>
        <div class="field"><label for="studioVpnNetworks">LAN/VLAN được truy cập (phân cách bằng dấu phẩy)</label><input id="studioVpnNetworks" placeholder="192.168.1.0/24"></div>
        <div id="studioVpnPeers"></div>
        <label class="checkrow"><input id="studioVpnWinbox" type="checkbox"> Cho phép WinBox từ IP đường hầm của các peer</label>
        <div class="btn-row">
          <button id="studioVpnAdd" class="btn btn-outline">Thêm peer</button>
          <button id="studioVpnRender" class="btn btn-primary">Sinh script .RSC</button>
        </div>
        <p id="studioVpnStatus" role="status"></p>
        <div class="field" id="studioVpnOutput" hidden><label for="studioVpnScript">Script RouterOS 7</label><textarea id="studioVpnScript" readonly rows="8"></textarea><button class="btn btn-outline" id="studioVpnDownload">Xuất .RSC</button></div>
      </section>
      <section id="studioRouter" hidden>
        <h2 id="studioRouterTitle">Kết nối RouterOS</h2>
        <p id="studioManagedSummary" class="hint" hidden></p>
        <button class="btn btn-outline btn-small" id="studioManagedBack" type="button" hidden>Quay lại kết nối VPN</button>
        <form id="studioRouterForm">
          <div class="studio-grid">
            <div class="field"><label for="studioHost">IP hoặc DNS MikroTik Cloud</label><input id="studioHost" required maxlength="254" placeholder="192.168.88.1 hoặc router.sn.mynetname.net" autocapitalize="none" spellcheck="false"></div>
            <div class="field"><label for="studioPort">Cổng API</label><input id="studioPort" type="number" value="8729" min="1" max="65535" required></div>
            <div class="field"><label for="studioUser">Tài khoản</label><input id="studioUser" required maxlength="128" autocomplete="off"></div>
            <div class="field"><label for="studioPassword">Mật khẩu router</label><input id="studioPassword" type="password" maxlength="256" autocomplete="off"></div>
          </div>
          <label class="checkrow"><input id="studioTls" type="checkbox" checked> Dùng API-SSL</label>
          <p id="studioPlainHint" class="hint" hidden>API thường chỉ xem được danh sách. Bật API-SSL để thêm, sửa hoặc khóa thuê bao PPPoE.</p>
          <div id="studioTlsOptions" class="studio-grid">
            <div class="field"><label for="studioTlsName">Tên trên chứng chỉ</label><input id="studioTlsName" maxlength="254" placeholder="Mặc định dùng IP hoặc DNS đã nhập"></div>
            <div class="field"><label for="studioCa">CA nội bộ dạng PEM (tùy chọn)</label><textarea id="studioCa" rows="2" maxlength="32768" spellcheck="false"></textarea><label for="studioCaFile">Hoặc chọn tệp CA công khai</label><input id="studioCaFile" type="file" accept=".crt,.cer,.pem,text/plain"></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit" value="info">Kiểm tra kết nối</button>
            <button class="btn btn-outline" type="submit" value="ppp">Xem thuê bao PPPoE</button>
          </div>
          <fieldset id="studioPppEditor" hidden>
            <legend>Thông tin thuê bao PPPoE</legend>
            <div class="studio-grid">
              <div class="field"><label for="studioPppName">Tên thuê bao</label><input id="studioPppName" maxlength="63"></div>
              <div class="field"><label for="studioPppProfile">Gói cước</label><select id="studioPppProfile"></select></div>
              <div class="field"><label for="studioPppPassword">Mật khẩu PPPoE</label><input id="studioPppPassword" type="password" maxlength="128" autocomplete="off"></div>
              <div class="field"><label for="studioPppComment">Ghi chú</label><input id="studioPppComment" maxlength="128"></div>
            </div>
            <label class="checkrow"><input id="studioPppDisabled" type="checkbox"> Tạm khóa thuê bao</label>
            <p class="hint">Khi chỉnh sửa, để trống mật khẩu để giữ mật khẩu cũ. Việc khóa tài khoản áp dụng cho lần quay số tiếp theo.</p>
            <button class="btn btn-primary" type="submit" value="ppp-save">Lưu thuê bao</button>
          </fieldset>
          <details id="studioBackupOptions">
            <summary>Sao lưu cấu hình vào router</summary>
            <div class="studio-grid">
              <div class="field"><label for="studioBackupName">Tên bản sao lưu</label><input id="studioBackupName" maxlength="48" placeholder="truoc-cap-nhat"></div>
              <div class="field"><label for="studioBackupPassword">Mật khẩu mã hóa bản sao lưu</label><input id="studioBackupPassword" type="password" maxlength="128" autocomplete="off" placeholder="Ít nhất 12 ký tự"></div>
            </div>
            <button class="btn btn-outline" type="submit" value="backup">Tạo bản sao lưu mã hóa</button>
          </details>
        </form>
        <details>
          <summary>Hẹn tự khôi phục trên RouterOS</summary>
          <p class="hint">Router tự khôi phục bản sao lưu mã hóa và khởi động lại khi hết thời gian. Dán lệnh chuẩn bị trong Terminal trước khi đổi cấu hình. Đợi dòng <code>Studio rollback armed</code> rồi mới thay đổi.</p>
          <div class="field"><label for="studioRollbackTime">Thời gian chờ xác nhận</label><select id="studioRollbackTime"><option value="120">2 phút</option><option value="300" selected>5 phút</option><option value="600">10 phút</option></select></div>
          <div class="btn-row">
            <button class="btn btn-outline" id="studioRollbackArm">Sao chép lệnh chuẩn bị</button>
            <button class="btn btn-outline" id="studioRollbackConfirm">Sao chép lệnh giữ cấu hình mới</button>
          </div>
          <p class="hint">Sau khi kiểm tra đường quản trị qua một phiên mới, dán lệnh giữ cấu hình mới bằng cùng tài khoản RouterOS. Dùng cơ chế này khi chỉnh cấu hình đang chạy. Các thao tác reset, khởi động lại và nâng firmware cần đường quản trị dự phòng.</p>
        </details>
        <details>
          <summary>Khôi phục từ bản sao lưu</summary>
          <ol>
            <li>Tạo bản sao lưu mã hóa trong mục trên và tải tệp từ Files trong WinBox.</li>
            <li>Kết nối từ cổng LAN quản trị. Bật Safe Mode trong WinBox hoặc nhấn Ctrl+X trong Terminal.</li>
            <li>Áp dụng từng nhóm lệnh nhỏ. Mở một phiên WinBox mới để kiểm tra đường quản trị, rồi tắt Safe Mode để giữ thay đổi.</li>
            <li>Nếu phiên Safe Mode bị rớt, RouterOS tự hoàn tác. Khi cần phục hồi toàn bộ, mở Files trên router gốc, chọn bản sao lưu và Restore. Router sẽ khởi động lại.</li>
          </ol>
        </details>
        <p id="studioRouterStatus" role="status"></p>
        <div id="studioRouterResult"></div>
      </section>`;
    document.body.append(dialog);
    const storageKey = 'studio-projects-v1';
    const projects = () => {
      try {
        const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(records) ? records.filter(item => item?.id && item.data?.meta?.project) : [];
      } catch {
        return [];
      }
    };
    const saveProjects = records => localStorage.setItem(storageKey, JSON.stringify(records));
    function show(section) {
      byId('studioProjects').hidden = section !== 'projects';
      byId('studioRouter').hidden = section !== 'router';
      byId('studioRemote').hidden = section !== 'remote';
      byId('studioWireGuard').hidden = section !== 'wireguard';
      if (!dialog.open) dialog.showModal();
    }
    function projectList() {
      const list = byId('studioProjectList');
      list.replaceChildren();
      for (const record of projects()) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = record.data.meta.project;
        const open = document.createElement('button');
        open.className = 'btn btn-outline btn-small';
        open.textContent = 'Mở';
        open.onclick = () => openRemote(record);
        const edit = document.createElement('button');
        edit.className = 'btn btn-outline btn-small';
        edit.textContent = 'Sửa cấu hình';
        edit.onclick = () => {
          if (!confirm('Mở dự án này sẽ thay nội dung đang chỉnh sửa. Tiếp tục?')) return;
          loadProject(record.data);
          dialog.close();
          toast('Đã mở dự án ' + record.data.meta.project);
        };
        const remove = document.createElement('button');
        remove.className = 'btn btn-outline btn-small';
        remove.textContent = 'Xóa';
        remove.onclick = async () => {
          if (!confirm('Xóa dự án ' + record.data.meta.project + '?')) return;
          try {
            if (record.remote) await invoke('vpn_disconnect', {id:record.remote.id,remove:true});
            saveProjects(projects().filter(project => project.id !== record.id));
            projectList();
          } catch (error) { toast(String(error)); }
        };
        item.append(name, open, edit, remove);
        list.append(item);
      }
    }
    button('desktopProjects', 'Dự án').onclick = () => {
      byId('studioProjectName').value = projectSnapshot().data.meta.project;
      projectList();
      show('projects');
    };
    byId('studioProjectSave').onclick = () => {
      const name = byId('studioProjectName').value.trim();
      if (!name) { toast('Nhập tên dự án.'); return; }
      const records = projects();
      const sameName = records.find(record => record.data.meta.project.toLowerCase() === name.toLowerCase());
      if (sameName && !confirm('Ghi đè cấu hình đã lưu của ' + sameName.data.meta.project + '?')) return;
      const id = sameName?.id || crypto.randomUUID();
      const snapshot = projectSnapshot();
      snapshot.data.meta.project = name;
      try {
        saveProjects([{...sameName, id, ...snapshot}, ...records.filter(record => record.id !== id)]);
        projectList();
        toast('Đã lưu dự án ' + name);
      } catch { toast('Không thể lưu dự án trên máy.'); }
    };

    let remoteRecord;
    let remoteWizard = false;
    let remoteBusy = false;
    let managed;
    let managedRecord;
    const remoteStatus = byId('studioRemoteStatus');
    const remoteForm = byId('studioRemoteConnect');
    const setupForm = byId('studioRemoteSetup');

    function saveRemoteRecord(record) {
      const existing = projects();
      saveProjects([record, ...existing.filter(item => item.id !== record.id)]);
    }

    function nextTunnelAddress() {
      const used = new Set(projects().map(record => record.remote?.routerIp));
      const [b,c] = crypto.getRandomValues(new Uint8Array(2));
      for (let i = 0; i < 16384; i++) {
        const n = ((b * 64 + (c % 64)) + i) % 16384;
        const ip = '10.241.' + Math.floor(n / 64) + '.' + (4*(n % 64)+1);
        if (!used.has(ip)) return ip;
      }
      return '';
    }

    function openRemote(record, wizard = false) {
      remoteRecord = record;
      remoteWizard = wizard;
      const remote = record.remote;
      byId('studioRemoteTitle').textContent = wizard ? 'Hoàn tất dự án' : record.data.meta.project;
      byId('studioRemoteFinish').hidden = !wizard;
      byId('studioRemoteName').value = record.data.meta.project;
      byId('studioRemoteFetch').checked = Boolean(record.netwatchFetch);
      byId('studioRemoteFetchHelp').hidden = !record.netwatchFetch;
      byId('studioRemoteEnable').checked = false;
      byId('studioRemoteSaveOnly').hidden = !wizard;
      setupForm.hidden = Boolean(remote) || wizard;
      byId('studioRemoteConnectPanel').hidden = !remote || wizard;
      remoteForm.reset();
      byId('studioRemoteUser').value = record.routerUser || '';
      setupForm.reset();
      byId('studioRemoteReuseOptions').hidden = true;
      byId('studioRemoteAddress').value = nextTunnelAddress();
      remoteStatus.textContent = !remote && !wizard
        ? 'Dự án cũ có thể thêm VPN một lần trên router đang chạy.'
        : '';
      if (remote) {
        byId('studioRemoteEndpointView').textContent = remote.endpoint + ' · VPN ' + remote.routerIp;
        byId('studioRemoteApplyHint').textContent = remote.tlsName
          ? 'Trong IP → Services → api-ssl, nếu đã giới hạn nguồn, hãy thêm ' + remote.clientIp + '/32 vào danh sách hiện có. Giữ chứng chỉ và cổng đang dùng.'
          : 'Đoạn lệnh tạo đường hầm và chứng chỉ quản trị riêng. API-SSL chỉ nhận IP của máy này trong VPN.';
      }
      show('remote');
    }

    const finish = () => {
      const snapshot = projectSnapshot();
      const name = snapshot.data.meta.project.trim();
      const previous = projects().find(record => record.data.meta.project.toLowerCase() === name.toLowerCase());
      openRemote({...previous, ...snapshot, id:previous?.id || crypto.randomUUID()}, true);
    };
    function snapshotOfRemote(record) {
      if (!remoteWizard) return record;
      const name = byId('studioRemoteName').value.trim();
      if (!name) throw new Error('Nhập tên dự án.');
      const other = projects().find(item => item.id !== record.id && item.data.meta.project.toLowerCase() === name.toLowerCase());
      if (other) throw new Error('Tên dự án này đã tồn tại.');
      return {...record, data:{...record.data,meta:{...record.data.meta,project:name}}, netwatchFetch:byId('studioRemoteFetch').checked};
    }
    byId('studioRemoteFetch').onchange = event => { byId('studioRemoteFetchHelp').hidden = !event.target.checked; };
    byId('studioRemoteFetchCopy').onclick = () => copyScript('/system/device-mode/update fetch=yes\n');
    byId('studioRemoteEnable').onchange = event => {
      const selected = event.target.checked;
      setupForm.hidden = Boolean(remoteRecord.remote) || !selected;
      byId('studioRemoteConnectPanel').hidden = !remoteRecord.remote || !selected;
      byId('studioRemoteSaveOnly').hidden = selected && !remoteRecord.remote;
    };
    byId('studioRemoteSaveOnly').onclick = () => {
      try {
        saveRemoteRecord(snapshotOfRemote(remoteRecord));
        projectList();
        show('projects');
        toast('Đã lưu dự án.');
      } catch (error) { remoteStatus.textContent = String(error.message || error); }
    };
    byId('studioRemoteReuse').onchange = event => { byId('studioRemoteReuseOptions').hidden = !event.target.checked; };
    setupForm.onsubmit = async event => {
      event.preventDefault();
      if (remoteBusy) return;
      remoteBusy = true;
      const submit = event.submitter;
      submit.disabled = true;
      let newTunnel;
      try {
        const record = snapshotOfRemote(remoteRecord);
        const input = id => byId('studioRemote'+id).value.trim();
        const routerIp = input('Address');
        if (projects().some(item => item.remote?.routerIp === routerIp)) throw new Error('Dải VPN đã được dùng trong dự án khác.');
        const ip = window.MTCore.ipToInt(routerIp);
        const sameNetwork = cidr => {
          const network = window.MTCore.parseCIDR(cidr);
          return network && ip >= network.net && ip <= network.broadcast;
        };
        if ([record.data.lan.gateway, ...record.data.vlans.map(vlan => vlan.gateway)].some(sameNetwork)) {
          throw new Error('IP đường hầm trùng dải LAN hoặc VLAN trong dự án.');
        }
        remoteStatus.textContent = 'Đang tạo và mã hóa khóa WireGuard…';
        newTunnel = await invoke('vpn_prepare', {options:{
          endpoint:input('Endpoint'), port:Number(input('Port')), wan:input('Wan'), routerIp,
          reuseSsl:byId('studioRemoteReuse').checked, apiPort:Number(input('ApiPort')),
          tlsName:input('TlsName'),caPem:input('Ca')
        }});
        const updated = {...record, remote:newTunnel};
        saveRemoteRecord(updated);
        newTunnel = null;
        openRemote(updated);
        remoteStatus.textContent = 'Đã lưu dự án và khóa VPN trên máy này. Cài VPN trên router một lần để kết nối.';
      } catch (error) {
        if (newTunnel) await invoke('vpn_disconnect', {id:newTunnel.id,remove:true}).catch(() => {});
        remoteStatus.textContent = String(error.message || error);
      } finally {
        remoteBusy = false;
        submit.disabled = false;
      }
    };
    byId('studioRemoteCopy').onclick = async () => {
      if (!confirm('Đoạn lệnh có khóa riêng của router. Chỉ dán vào Terminal WinBox của dự án này.')) return;
      try { copyScript(await invoke('vpn_script', {id:remoteRecord.remote.id})); }
      catch (error) { remoteStatus.textContent = String(error); }
    };
    byId('studioRemoteDisconnect').onclick = async event => {
      if (remoteBusy) return;
      remoteBusy = true;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await invoke('vpn_disconnect', {id:remoteRecord.remote.id,remove:false});
        remoteStatus.textContent = 'Đã ngắt VPN.';
      } catch (error) { remoteStatus.textContent = String(error); }
      finally { remoteBusy = false; button.disabled = false; }
    };
    remoteForm.onsubmit = async event => {
      event.preventDefault();
      if (remoteBusy) return;
      remoteBusy = true;
      const submit = event.submitter;
      const record = remoteRecord;
      const remote = record.remote;
      const connection = {
        host:remote.routerIp,port:remote.apiPort,tls:true,tlsName:remote.tlsName,caPem:remote.caPem,
        username:byId('studioRemoteUser').value.trim(),password:byId('studioRemotePassword').value
      };
      submit.disabled = true;
      try {
        remoteStatus.textContent = 'Đang khởi động WireGuard…';
        await invoke('vpn_connect', {id:remote.id});
        remoteStatus.textContent = 'Đang xác minh router qua API-SSL trong VPN…';
        const router = await invoke('router_info', {connection});
        const updated = {...record,routerUser:connection.username};
        saveRemoteRecord(updated);
        if (dialog.open && !byId('studioRemote').hidden && remoteRecord.id === record.id) openManaged(updated, connection, router);
      } catch (error) { remoteStatus.textContent = String(error); }
      finally {
        remoteBusy = false;
        submit.disabled = false;
        byId('studioRemotePassword').value = '';
      }
    };

    const vpnPeers = byId('studioVpnPeers');
    const vpnOutput = byId('studioVpnOutput');
    const vpnFields = {role:'Role',name:'Name',address:'Ip',listenPort:'Port',networks:'Networks'};
    function readWireGuard() {
      const config = Object.fromEntries(Object.entries(vpnFields).map(([key,id]) => [key,byId('studioVpn'+id).value.trim()]));
      config.winbox = byId('studioVpnWinbox').checked;
      config.peers = Array.from(vpnPeers.children, row => Object.fromEntries(
        Array.from(row.querySelectorAll('[data-peer]'), input => [input.dataset.peer,input.value.trim()])));
      return config;
    }
    const updateWireGuard = () => {
      vpnOutput.hidden = true;
      setWireGuard(readWireGuard());
    };
    const addPeer = (peer = {}) => {
      const row = document.createElement('fieldset');
      row.innerHTML = `
        <legend>Peer</legend>
        <div class="studio-grid">
          <label class="field">Public key<input data-peer="key" maxlength="44"></label>
          <label class="field">IP trong VPN<input data-peer="ip" placeholder="10.80.0.2"></label>
          <label class="field">LAN chi nhánh (CIDR)<input data-peer="networks" placeholder="192.168.2.0/24"></label>
          <label class="field">Endpoint (Site-to-Site)<input data-peer="endpoint" placeholder="vpn.example.com"></label>
          <label class="field">Cổng endpoint<input data-peer="port" type="number" min="1" max="65535" value="51820"></label>
          <div><button class="btn btn-outline btn-small" type="button">Bỏ peer</button></div>
        </div>`;
      for (const input of row.querySelectorAll('[data-peer]')) {
        if (Object.hasOwn(peer,input.dataset.peer)) input.value = peer[input.dataset.peer];
      }
      row.querySelector('button').onclick = () => { row.remove(); updateWireGuard(); };
      vpnPeers.append(row);
      vpnOutput.hidden = true;
    };
    button('desktopVpn', 'WireGuard').onclick = () => {
      const config = state().wireguard;
      for (const [key,id] of Object.entries(vpnFields)) byId('studioVpn'+id).value = config[key];
      byId('studioVpnWinbox').checked = config.winbox;
      vpnPeers.replaceChildren();
      for (const peer of config.peers.length ? config.peers : [{}]) addPeer(peer);
      vpnOutput.hidden = true;
      byId('studioVpnStatus').textContent = '';
      show('wireguard');
    };
    byId('studioWireGuard').oninput = updateWireGuard;
    byId('studioVpnAdd').onclick = () => {
      if (vpnPeers.children.length < 32) {
        addPeer();
        updateWireGuard();
      }
    };
    byId('studioVpnRender').onclick = () => {
      const config = readWireGuard();
      setWireGuard(config);
      const result = window.MTWireGuard.render(config,state());
      byId('studioVpnStatus').textContent = result.errors.join(' ');
      byId('studioVpnScript').value = result.script;
      vpnOutput.hidden = !result.script;
    };
    byId('studioVpnDownload').onclick = () => download(byId('studioVpnScript').value,'WireGuard_RouterOS7.rsc','text/plain;charset=utf-8');

    function setManaged(connection) {
      managed = connection;
      const isManaged = Boolean(connection);
      const fields = ['studioHost','studioPort','studioUser','studioPassword','studioTlsName','studioCa'];
      for (const id of fields) byId(id).readOnly = isManaged;
      byId('studioTls').disabled = isManaged;
      byId('studioTlsOptions').hidden = isManaged || !byId('studioTls').checked;
      byId('studioCaFile').disabled = isManaged;
      byId('studioManagedSummary').hidden = !isManaged;
      byId('studioManagedBack').hidden = !isManaged;
      byId('studioRouterStatus').textContent = '';
      byId('studioRouterResult').replaceChildren();
      byId('studioPppEditor').hidden = true;
      byId('studioPassword').value = '';
      loadedRouter = undefined;
    }
    function openManaged(record, connection, router) {
      managedRecord = record;
      setManaged(connection);
      byId('studioRouterTitle').textContent = 'Quản trị · ' + record.data.meta.project;
      byId('studioManagedSummary').textContent = 'VPN đã kết nối · ' + router.identity + ' · RouterOS ' + router.version;
      byId('studioHost').value = connection.host;
      byId('studioPort').value = connection.port;
      byId('studioUser').value = connection.username;
      byId('studioTls').checked = true;
      byId('studioPlainHint').hidden = true;
      byId('studioBackupOptions').hidden = false;
      show('router');
    }
    byId('studioManagedBack').onclick = () => {
      setManaged(undefined);
      if (managedRecord) openRemote(managedRecord);
    };
    button('desktopRouter', 'RouterOS').onclick = () => {
      const wasManaged = byId('studioHost').readOnly;
      setManaged(undefined);
      if (wasManaged) {
        byId('studioRouterForm').reset();
        byId('studioTls').onchange();
      }
      byId('studioRouterTitle').textContent = 'Kết nối RouterOS';
      show('router');
    };
    byId('studioRollbackArm').onclick = () => {
      const random = crypto.getRandomValues(new Uint8Array(8));
      const token = Array.from(random, byte => byte.toString(16).padStart(2,'0')).join('');
      copyScript(window.MTRollback.arm(Number(byId('studioRollbackTime').value),token));
    };
    byId('studioRollbackConfirm').onclick = () => copyScript(window.MTRollback.confirm());
    const tls = byId('studioTls');
    const editor = byId('studioPppEditor');
    let loadedRouter;
    let pppProfiles = [];
    let subscriberId = null;
    function openSubscriber(row) {
      subscriberId = row?.['.id'] || null;
      byId('studioPppName').value = row?.name || '';
      byId('studioPppComment').value = row?.comment || '';
      byId('studioPppPassword').value = '';
      byId('studioPppDisabled').checked = ['true','yes'].includes(row?.disabled);
      const profile = byId('studioPppProfile');
      profile.replaceChildren(...pppProfiles.map(name => new Option(name,name)));
      if (row) profile.value = row.profile;
      editor.hidden = false;
      byId('studioPppName').focus();
    }
    byId('studioCaFile').onchange = async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (file.size > 32768) throw new Error('Tệp CA vượt 32 KB.');
        const pem = (await file.text()).trim();
        if (!/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----$/.test(pem)) {
          throw new Error('Chọn một chứng chỉ CA công khai dạng PEM (.crt hoặc .pem).');
        }
        byId('studioCa').value = pem;
        byId('studioRouterStatus').textContent = 'Đã nạp chứng chỉ CA.';
      } catch (error) {
        byId('studioRouterStatus').textContent = String(error.message || error);
      }
    };
    tls.onchange = () => {
      byId('studioPort').value = tls.checked ? '8729' : '8728';
      byId('studioTlsOptions').hidden = !tls.checked;
      byId('studioPlainHint').hidden = tls.checked;
      byId('studioBackupOptions').hidden = !tls.checked;
      editor.hidden = true;
      loadedRouter = undefined;
      byId('studioRouterResult').replaceChildren();
    };
    byId('studioRouterForm').onsubmit = async event => {
      event.preventDefault();
      const action = event.submitter?.value || 'info';
      const form = event.currentTarget;
      const controls = Array.from(form.querySelectorAll('button'));
      if (controls.some(control => control.disabled)) return;
      if (!tls.checked && !confirm('API thường truyền mật khẩu dạng rõ. Chỉ tiếp tục trên mạng quản trị tin cậy.')) return;
      const val = id => byId(id).value;
      const connection = managed || {
        host: val('studioHost').trim(), port: Number(val('studioPort')), username: val('studioUser'),
        password: val('studioPassword'), tls: tls.checked, tlsName: val('studioTlsName'), caPem: val('studioCa')
      };
      const routerId = JSON.stringify([connection.host, connection.port, connection.username, connection.tls, connection.tlsName, connection.caPem]);
      if (action === 'ppp-save' && (!connection.tls || loadedRouter !== routerId)) {
        byId('studioRouterStatus').textContent = 'Hãy tải lại danh sách thuê bao từ router này trước khi sửa.';
        return;
      }
      const backup = {name: val('studioBackupName').trim(), password: val('studioBackupPassword')};
      const status = byId('studioRouterStatus');
      const result = byId('studioRouterResult');
      if (action !== 'ppp-save') editor.hidden = true;
      if (action !== 'ppp-save') result.replaceChildren();
      controls.forEach(control => control.disabled = true);
      status.textContent = 'Đang chờ RouterOS phản hồi…';
      try {
        if (action === 'backup') {
          const file = await invoke('router_backup', {connection, backup});
          status.textContent = 'Đã tạo ' + file + ' trong mục Files của router.';
          byId('studioBackupPassword').value = '';
        } else if (action === 'ppp' || action === 'ppp-save') {
          if (action === 'ppp-save') {
            const subscriber = {
              id:subscriberId, name:val('studioPppName').trim(), password:val('studioPppPassword'),
              profile:val('studioPppProfile'), comment:val('studioPppComment'), disabled:byId('studioPppDisabled').checked
            };
            await invoke('ppp_save', {connection, subscriber});
            byId('studioPppPassword').value = '';
            editor.hidden = true;
            status.textContent = 'Đã lưu thuê bao. Đang tải lại danh sách…';
          }
          result.replaceChildren();
          const records = await invoke('ppp_subscribers', {connection});
          status.textContent = (action === 'ppp-save' ? 'Đã lưu. ' : '') + 'Thuê bao PPPoE: ' + records.length;
          if (connection.tls) {
            pppProfiles = await invoke('ppp_profiles', {connection});
            loadedRouter = routerId;
            const add = document.createElement('button');
            add.className = 'btn btn-outline btn-small';
            add.textContent = 'Thêm thuê bao';
            add.onclick = () => openSubscriber();
            result.append(add);
          }
          const list = document.createElement('ul');
          for (const row of records) {
            const item = document.createElement('li');
            item.textContent = [row.name, row.profile, ['true','yes'].includes(row.disabled) ? 'Tạm khóa' : 'Bật', row.comment].filter(Boolean).join(' · ');
            if (connection.tls && row['.id']) {
              const edit = document.createElement('button');
              edit.className = 'btn btn-outline btn-small';
              edit.textContent = 'Sửa';
              edit.onclick = () => openSubscriber(row);
              item.append(' ',edit);
            }
            list.append(item);
          }
          result.append(list);
        } else {
          const router = await invoke('router_info', {connection});
          status.textContent = [router.identity, 'RouterOS ' + router.version, router.board, 'Uptime ' + router.uptime].join(' · ');
        }
      } catch (error) {
        status.textContent = String(error);
      } finally {
        controls.forEach(control => control.disabled = false);
      }
    };
    function clearCredentials() {
      managed = undefined;
      for (const id of ['studioRemotePassword','studioPassword','studioBackupPassword','studioPppPassword']) byId(id).value = '';
    }
    dialog.querySelector('.studio-close').addEventListener('submit', clearCredentials);
    dialog.addEventListener('close', clearCredentials);
    const update = byId('updateCheckButton');
    update.hidden = true;
    const panel = byId('updatePanel');
    panel.innerHTML = '<div class="update-title">Cập nhật ứng dụng<button id="studioUpdateClose" type="button" aria-label="Đóng">×</button></div><p id="studioUpdateStatus"></p><progress id="studioUpdateProgress" hidden></progress><button class="btn btn-primary btn-small" id="studioUpdateInstall" hidden>Tải và cài đặt</button>';
    byId('studioUpdateClose').onclick = () => { panel.hidden = true; };
    const updateStatus = byId('studioUpdateStatus');
    const install = byId('studioUpdateInstall');
    const progressBar = byId('studioUpdateProgress');
    let busy = false;
    async function checkUpdate(quiet) {
      if (busy) return;
      busy = true;
      install.hidden = true;
      progressBar.hidden = true;
      if (!quiet) {
        panel.hidden = false;
        updateStatus.textContent = 'Đang kiểm tra phiên bản…';
      }
      try {
        const version = await invoke('update_check');
        if (version) {
          panel.hidden = false;
          updateStatus.textContent = 'Đã có phiên bản ' + version + '. Lưu dự án trước khi cài đặt.';
          install.dataset.version = version;
          install.hidden = false;
        } else if (!quiet) updateStatus.textContent = 'Đang dùng phiên bản mới nhất của kênh thử nghiệm.';
      } catch (error) {
        if (!quiet) updateStatus.textContent = String(error);
      } finally { busy = false; }
    }
    install.onclick = async () => {
      if (busy) return;
      busy = true;
      install.disabled = true;
      progressBar.hidden = false;
      progressBar.removeAttribute('value');
      updateStatus.textContent = 'Đang tải bản cập nhật…';
      const progress = new window.__TAURI__.core.Channel();
      progress.onmessage = data => {
        if (data.total) {
          progressBar.max = data.total;
          progressBar.value = data.downloaded;
          updateStatus.textContent = 'Đang tải ' + Math.min(100, Math.round(data.downloaded / data.total * 100)) + '%';
        }
      };
      try {
        await invoke('update_install', {version:install.dataset.version, progress});
        updateStatus.textContent = 'Đã chuyển bản cập nhật cho bộ cài.';
        install.hidden = true;
      } catch (error) {
        updateStatus.textContent = String(error);
      } finally {
        busy = false;
        install.disabled = false;
        progressBar.hidden = true;
      }
    };
    invoke('update_available').then(available => {
      update.hidden = !available;
      if (!available) return;
      update.onclick = () => checkUpdate(false);
      checkUpdate(true);
    }).catch(() => {});
    this.finish = finish;
  }
};
