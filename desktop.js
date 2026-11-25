'use strict';

window.MTDesktop = {
  start({projectSnapshot, loadProject, toast}) {
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
      <section id="studioRouter" hidden>
        <h2>Kết nối RouterOS</h2>
        <form id="studioRouterForm">
          <div class="studio-grid">
            <div class="field"><label for="studioHost">Địa chỉ IP</label><input id="studioHost" required placeholder="192.168.1.1"></div>
            <div class="field"><label for="studioPort">Cổng API</label><input id="studioPort" type="number" value="8729" min="1" max="65535" required></div>
            <div class="field"><label for="studioUser">Tài khoản</label><input id="studioUser" required maxlength="128" autocomplete="off"></div>
            <div class="field"><label for="studioPassword">Mật khẩu router</label><input id="studioPassword" type="password" maxlength="256" autocomplete="off"></div>
          </div>
          <label class="checkrow"><input id="studioTls" type="checkbox" checked> Dùng API-SSL</label>
          <div id="studioTlsOptions" class="studio-grid">
            <div class="field"><label for="studioTlsName">Tên trên chứng chỉ</label><input id="studioTlsName" placeholder="Để trống nếu chứng chỉ chứa IP"></div>
            <div class="field"><label for="studioCa">CA nội bộ dạng PEM (tùy chọn)</label><textarea id="studioCa" rows="2" maxlength="32768"></textarea></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit" value="info">Kiểm tra kết nối</button>
            <button class="btn btn-outline" type="submit" value="ppp">Xem thuê bao PPPoE</button>
          </div>
          <details id="studioBackupOptions">
            <summary>Sao lưu cấu hình vào router</summary>
            <div class="studio-grid">
              <div class="field"><label for="studioBackupName">Tên bản sao lưu</label><input id="studioBackupName" maxlength="48" placeholder="truoc-cap-nhat"></div>
              <div class="field"><label for="studioBackupPassword">Mật khẩu mã hóa bản sao lưu</label><input id="studioBackupPassword" type="password" maxlength="128" autocomplete="off" placeholder="Ít nhất 12 ký tự"></div>
            </div>
            <button class="btn btn-outline" type="submit" value="backup">Tạo bản sao lưu mã hóa</button>
          </details>
        </form>
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
    let activeProjectId;
    function show(section) {
      byId('studioProjects').hidden = section !== 'projects';
      byId('studioRouter').hidden = section !== 'router';
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
          activeProjectId = record.id;
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
            if (activeProjectId === record.id) activeProjectId = undefined;
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
      const active = records.find(record => record.id === activeProjectId);
      const id = active?.data.meta.project === name ? active.id : crypto.randomUUID();
      const snapshot = projectSnapshot();
      snapshot.data.meta.project = name;
      try {
        saveProjects([{id, ...snapshot}, ...records.filter(record => record.id !== id)]);
        activeProjectId = id;
        projectList();
        toast('Đã lưu dự án ' + name);
      } catch { toast('Không thể lưu dự án trên máy.'); }
    };

    button('desktopRouter', 'RouterOS').onclick = () => show('router');
    const tls = byId('studioTls');
    tls.onchange = () => {
      byId('studioPort').value = tls.checked ? '8729' : '8728';
      byId('studioTlsOptions').hidden = !tls.checked;
      byId('studioBackupOptions').hidden = !tls.checked;
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
      const backup = {name: val('studioBackupName').trim(), password: val('studioBackupPassword')};
      const status = byId('studioRouterStatus');
      const result = byId('studioRouterResult');
      result.replaceChildren();
      controls.forEach(control => control.disabled = true);
      status.textContent = 'Đang chờ RouterOS phản hồi…';
      try {
        if (action === 'backup') {
          const file = await invoke('router_backup', {connection, backup});
          status.textContent = 'Đã tạo ' + file + ' trong mục Files của router.';
          byId('studioBackupPassword').value = '';
        } else if (action === 'ppp') {
          const records = await invoke('ppp_subscribers', {connection});
          status.textContent = 'Thuê bao PPPoE: ' + records.length;
          const list = document.createElement('ul');
          for (const row of records) {
            const item = document.createElement('li');
            item.textContent = [row.name, row.profile, row.disabled === 'true' ? 'Tạm khóa' : 'Bật', row.comment].filter(Boolean).join(' · ');
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
    dialog.addEventListener('close', () => {
      for (const id of ['studioPassword','studioBackupPassword']) byId(id).value = '';
    });
    const update = byId('updateCheckButton');
    update.hidden = true;
  }
};
