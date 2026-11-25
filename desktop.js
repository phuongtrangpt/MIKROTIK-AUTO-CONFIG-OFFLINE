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
        <h2>Kết nối RouterOS</h2>
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
        open.onclick = () => {
          if (!confirm('Mở dự án này sẽ thay nội dung đang chỉnh sửa. Tiếp tục?')) return;
          loadProject(record.data);
          dialog.close();
          toast('Đã mở dự án ' + record.data.meta.project);
        };
        const remove = document.createElement('button');
        remove.className = 'btn btn-outline btn-small';
        remove.textContent = 'Xóa';
        remove.onclick = () => {
          if (!confirm('Xóa dự án ' + record.data.meta.project + '?')) return;
          try {
            saveProjects(projects().filter(project => project.id !== record.id));
            projectList();
          } catch { toast('Không thể cập nhật danh sách dự án.'); }
        };
        item.append(name, open, remove);
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
        saveProjects([{id, ...snapshot}, ...records.filter(record => record.id !== id)]);
        projectList();
        toast('Đã lưu dự án ' + name);
      } catch { toast('Không thể lưu dự án trên máy.'); }
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

    button('desktopRouter', 'RouterOS').onclick = () => show('router');
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
      const connection = {
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
      for (const id of ['studioPassword','studioBackupPassword','studioPppPassword']) byId(id).value = '';
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
  }
};
