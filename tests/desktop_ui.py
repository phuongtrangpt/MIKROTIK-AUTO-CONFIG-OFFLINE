from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--chromium', help='Optional executable path, defaults to the Playwright Chromium')
args = parser.parse_args()
workspace = Path(__file__).resolve().parents[1]
with ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=workspace/'desktop-dist')) as server:
    Thread(target=server.serve_forever,daemon=True).start()
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1280,'height':850}, color_scheme='light')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('dialog',lambda dialog:dialog.accept())
        page.add_init_script("""window.__TAURI__ = {core:{invoke:async (cmd,args)=>{
          if(cmd==='update_available') return true;
          if(cmd==='update_check') return '2.0.0-alpha.5';
          if(cmd==='update_install'){ args.progress.onmessage({downloaded:10,total:10}); return; }
          if(cmd==='router_info' && args.connection.host==='router.sn.mynetname.net' && args.connection.tlsName==='' && args.connection.caPem.includes('BEGIN CERTIFICATE')) return {identity:'LAB-RB5009',version:'7.21.5',board:'CHR',uptime:'1h'};
          if(cmd==='vpn_prepare') return {id:'0123456789abcdef',endpoint:args.options.endpoint,routerIp:args.options.routerIp,
            clientIp:'10.241.0.2',port:args.options.port,apiPort:8729,tlsName:'',caPem:'public CA'};
          if(cmd==='vpn_script') return ':put "Studio VPN ready"';
          if(cmd==='vpn_connect' && args.id==='0123456789abcdef') return;
          if(cmd==='router_info' && args.connection.host.startsWith('10.241.') && args.connection.tls===true && args.connection.caPem==='public CA')
            return {identity:'VPN LAB',version:'7.21.5',board:'CHR',uptime:'1h'};
          if(cmd==='ppp_subscribers') return [{'.id':'*1',name:'lab',profile:'lab-plan',disabled:'false'}];
          if(cmd==='ppp_profiles') return ['lab-plan'];
          if(cmd==='ppp_save') return;
          if(cmd==='router_backup') return 'lab.backup';
          throw new Error(cmd);
        },Channel:class {}}};""")
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        assert page.locator('#sideVer').inner_text()=='2.0.0-alpha.4'
        page.locator('#desktopTheme').click()
        assert page.locator('html').get_attribute('data-theme')=='dark'
        page.locator('#studioUpdateClose').click()
        page.locator('#desktopProjects').click()
        page.locator('#studioProjectName').fill('Khách hàng A')
        page.locator('#studioProjectSave').click()
        assert 'Khách hàng A' in page.locator('#studioProjectList').inner_text()
        page.locator('.studio-close button').click()
        page.context.grant_permissions(['clipboard-read','clipboard-write'])
        page.locator('#desktopRouter').click()
        page.locator('#studioHost').fill('router.sn.mynetname.net')
        page.locator('#studioCaFile').set_input_files({'name':'studio-ca.crt','mimeType':'text/plain',
            'buffer':b'-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----'})
        page.wait_for_function("document.querySelector('#studioCa').value.includes('BEGIN CERTIFICATE')")
        page.locator('#studioUser').fill('admin')
        page.locator('#studioPassword').fill('test-only-router-secret')
        page.get_by_role('button',name='Kiểm tra kết nối').click()
        assert 'LAB-RB5009' in page.locator('#studioRouterStatus').inner_text()
        page.locator('#studioTls').uncheck()
        page.get_by_role('button',name='Xem thuê bao PPPoE').click()
        assert page.locator('#studioPlainHint').is_visible()
        assert page.get_by_role('button',name='Sửa').count() == 0
        page.locator('#studioTls').check()
        page.get_by_role('button',name='Xem thuê bao PPPoE').click()
        page.get_by_role('button',name='Sửa').click()
        page.locator('#studioPppDisabled').check()
        page.get_by_role('button',name='Lưu thuê bao').click()
        page.wait_for_function("document.querySelector('#studioRouterStatus').textContent.includes('Đã lưu')")
        page.get_by_text('Sao lưu cấu hình vào router').click()
        page.locator('#studioBackupName').fill('lab')
        page.locator('#studioBackupPassword').fill('test-only-backup-secret')
        page.get_by_role('button',name='Tạo bản sao lưu mã hóa').click()
        assert 'lab.backup' in page.locator('#studioRouterStatus').inner_text()
        page.get_by_text('Hẹn tự khôi phục trên RouterOS').click()
        page.get_by_role('button',name='Sao chép lệnh chuẩn bị').click()
        assert 'Studio rollback armed' in page.evaluate('navigator.clipboard.readText()')
        page.get_by_role('button',name='Sao chép lệnh giữ cấu hình mới').click()
        assert 'Studio changes confirmed' in page.evaluate('navigator.clipboard.readText()')
        page.locator('.studio-close button').click()
        assert page.locator('#studioPassword').input_value()==''
        cache=page.evaluate('JSON.stringify(localStorage)')
        assert 'test-only' not in cache and 'Khách hàng A' in cache
        page.locator('#desktopVpn').click()
        page.locator('#studioVpnIp').fill('10.80.0.1/24')
        page.locator('#studioVpnNetworks').fill('192.168.1.0/24')
        page.locator('[data-peer="key"]').fill('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=')
        page.locator('[data-peer="ip"]').fill('10.80.0.2')
        page.locator('#studioVpnRender').click()
        assert '/interface wireguard add' in page.locator('#studioVpnScript').input_value()
        with page.expect_download() as download:
            page.locator('#studioVpnDownload').click()
        assert download.value.suggested_filename.endswith('.rsc')
        page.locator('.studio-close button').click()
        page.locator('#desktopProjects').click()
        page.locator('#studioProjectName').fill('Khách hàng B')
        page.locator('#studioProjectSave').click()
        page.locator('#studioProjectList li').filter(has_text='Khách hàng A').get_by_role('button',name='Sửa cấu hình').click()
        page.locator('#desktopVpn').click()
        assert page.locator('#studioVpnIp').input_value()==''
        page.locator('.studio-close button').click()
        page.locator('#desktopProjects').click()
        page.locator('#studioProjectList li').filter(has_text='Khách hàng B').get_by_role('button',name='Sửa cấu hình').click()
        page.locator('#desktopVpn').click()
        assert page.locator('#studioVpnIp').input_value()=='10.80.0.1/24'
        page.locator('.studio-close button').click()
        page.evaluate("window.MTDesktop.finish()")
        page.locator('#studioRemoteName').fill('Dự án VPN')
        page.locator('#studioRemoteFetch').check()
        page.locator('#studioRemoteFetchCopy').click()
        page.wait_for_function("navigator.clipboard.readText().then(text=>text.includes('device-mode/update fetch=yes scheduler=yes'))")
        page.locator('#studioRemoteEnable').check()
        page.locator('#studioRemoteEndpoint').fill('vpn.sn.mynetname.net')
        page.get_by_role('button',name='Tạo VPN và lưu dự án').click()
        page.locator('#studioRemoteEndpointView').wait_for(state='visible')
        assert 'vpn.sn.mynetname.net' in page.locator('#studioRemoteEndpointView').inner_text()
        page.locator('.studio-close button').click()
        page.locator('#desktopProjects').click()
        page.locator('#studioProjectList li').filter(has_text='Dự án VPN').get_by_role('button',name='Mở',exact=True).click()
        page.locator('#studioRemoteUser').fill('operator')
        page.locator('#studioRemotePassword').fill('never-store-this-test-password')
        page.get_by_role('button',name='Kết nối VPN',exact=True).click()
        page.locator('#studioManagedSummary').wait_for(state='visible')
        assert 'VPN LAB' in page.locator('#studioManagedSummary').inner_text()
        page.get_by_role('button',name='Xem thuê bao PPPoE').click()
        page.get_by_role('button',name='Sửa',exact=True).wait_for(state='visible')
        assert page.evaluate("!JSON.stringify(localStorage).includes('never-store-this-test-password')")
        page.locator('.studio-close button').click()
        page.locator('#updateCheckButton').click()
        page.locator('#studioUpdateInstall').click()
        assert 'Đã chuyển' in page.locator('#studioUpdateStatus').inner_text()
        assert not errors,errors
        print('PASS Chromium desktop UI: alpha version, dark theme, local projects, ephemeral credentials, RouterOS/PPPoE/backup IPC mocks, WireGuard RSC download and update progress')
        browser.close()
