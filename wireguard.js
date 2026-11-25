'use strict';

(function (root) {
  const core = root.MTCore || require('./core.js');
  const errorsResult = errors => ({errors, script: ''});
  const publicKey = text => /^(?!A{43}=)[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(text);
  const csv = text => text.split(',').map(value => value.trim()).filter(Boolean);

  function prefix(text) {
    const match = /^(\d+\.\d+\.\d+\.\d+)\/([1-9]|[12][0-9]|3[0-2])$/.exec(text);
    if (!match) return null;
    const ip = core.ipToInt(match[1]);
    if (ip === null) return null;
    const bits = Number(match[2]);
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    const start = (ip & mask) >>> 0;
    return {ip, start, end: (start | ~mask) >>> 0, cidr: core.intToIp(start) + '/' + bits};
  }
  const overlap = (a,b) => a.start <= b.end && b.start <= a.end;
  const validPort = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535;

  function render(config, wizard) {
    const errors = [];
    const {role, name, address, listenPort, networks, peers} = config;
    if (!['remote','hub','site'].includes(role)) errors.push('Chọn mô hình WireGuard.');
    if (!/^wg-[a-zA-Z0-9_-]{1,20}$/.test(name)) errors.push('Tên interface phải bắt đầu bằng wg- và chứa chữ, số, dấu gạch.');
    const locals = [wizard.lan.gateway, ...wizard.vlans.filter(vlan => vlan.mode !== 'pppoe').map(vlan => vlan.gateway)]
      .map(prefix).filter(Boolean);
    const assigned = [...locals, ...(wizard.ppp.enabled ? [prefix(wizard.ppp.network)] : []),
      ...wizard.wan.filter(wan => wan.type === 'static').map(wan => prefix(wan.ip))].filter(Boolean);
    if (core.ports(wizard).concat(wizard.vlans.map(vlan => vlan.name)).some(port => port.toLowerCase() === name.toLowerCase())) {
      errors.push('Tên WireGuard trùng interface đang dùng.');
    }
    const tunnel = prefix(address);
    if (!tunnel || tunnel.ip === tunnel.start || tunnel.ip === tunnel.end || assigned.some(network => overlap(network, tunnel))) {
      errors.push('IP đường hầm phải là địa chỉ host hợp lệ, dùng dải riêng của VPN.');
    }
    if (!validPort(listenPort)) errors.push('Cổng UDP WireGuard phải trong khoảng 1–65535.');
    const allowed = csv(networks).map(prefix);
    if (!allowed.length || allowed.some(network => !network || !locals.some(local => network.cidr === local.cidr))) {
      errors.push('Nhập CIDR của từng mạng LAN/VLAN nội bộ mà VPN được truy cập.');
    }
    if (!Array.isArray(peers) || peers.length < 1 || peers.length > 32 || (role === 'site' && peers.length !== 1)) {
      return errorsResult([...errors, 'Khai báo 1–32 peer. Site-to-Site trực tiếp cần đúng một peer.']);
    }
    const destinations = [];
    const keys = new Set();
    const tunnelHosts = new Set();
    const entries = [];
    for (const [index, peer] of peers.entries()) {
      if (!peer || typeof peer !== 'object' || Array.isArray(peer)) {
        errors.push('Peer ' + (index+1) + ': dữ liệu không hợp lệ.');
        continue;
      }
      const issue = text => errors.push('Peer ' + (index+1) + ': ' + text);
      if (!publicKey(peer.key) || keys.has(peer.key)) issue('public key sai hoặc bị trùng.');
      keys.add(peer.key);
      const host = core.ipToInt(peer.ip);
      if (!tunnel || host === null || host <= tunnel.start || host >= tunnel.end || host === tunnel.ip || tunnelHosts.has(host)) {
        issue('IP peer phải là host duy nhất trong subnet đường hầm.');
      }
      tunnelHosts.add(host);
      const endpoint = peer.endpoint || '';
      if (endpoint && (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(endpoint)
          || !validPort(peer.port) || (tunnel && core.ipToInt(endpoint) >= tunnel.start && core.ipToInt(endpoint) <= tunnel.end))) {
        issue('endpoint phải là IPv4 hoặc DNS và có cổng hợp lệ, bên ngoài dải đường hầm.');
      }
      if (role !== 'site' && endpoint) issue('máy khách và chi nhánh chủ động kết nối đến router này.');
      if (typeof (peer.networks ?? '') !== 'string') {
        issue('mạng từ xa phải là chuỗi CIDR, phân cách bằng dấu phẩy.');
        continue;
      }
      const remote = csv(peer.networks || '').map(prefix);
      if (role === 'remote' && remote.length) issue('Remote Access dùng IP riêng từng máy khách, không có subnet chi nhánh.');
      if (role === 'site' && !remote.length) issue('nhập ít nhất một mạng LAN ở đầu bên kia.');
      for (const network of remote) {
        if (!network || (tunnel && overlap(tunnel,network)) ||
            [...assigned,...destinations].some(other => overlap(other,network))) {
          issue('subnet từ xa không hợp lệ hoặc chồng với mạng đã khai báo.');
          continue;
        }
        destinations.push(network);
      }
      entries.push({peer, remote, endpoint});
    }
    if (errors.length) return errorsResult(errors);
    const q = core.q;
    const output = [
      '# Chạy sau khi đã hoàn thành cấu hình cơ sở của MikroTik Studio.',
      ':if ([:len [/ip firewall filter find where comment="Bootstrap block WAN management"]] != 1 || [:len [/ip firewall filter find where comment="Default deny forward"]] != 1) do={ :error "Studio base firewall missing" }',
      ':if ([:len [/interface find where name='+q(name)+']] > 0) do={ :error "WireGuard interface already exists" }',
      '/interface wireguard add name='+q(name)+' listen-port='+Number(listenPort),
      '/ip address add address='+address+' interface='+q(name),
      '/ip firewall address-list add list=AUTO-LOCAL address='+tunnel.cidr,
    ];
    for (const {peer, remote, endpoint} of entries) {
      const addresses = [peer.ip+'/32', ...remote.map(network => network.cidr)];
      output.push('/interface wireguard peers add interface='+q(name)+' public-key='+q(peer.key)+
        ' allowed-address='+addresses.join(',')+
        (endpoint ? ' endpoint-address='+q(endpoint)+' endpoint-port='+Number(peer.port)+' persistent-keepalive=25s' : ''));
      for (const network of remote) {
        output.push('/ip route add dst-address='+network.cidr+' gateway='+q(name),
          '/ip firewall address-list add list=AUTO-LOCAL address='+network.cidr);
      }
    }
    if (!entries.some(entry => entry.endpoint)) {
      const wan = wizard.wan[0];
      const wanInterface = wan.type === 'pppoe' ? 'pppoe-WAN1' : wan.port;
      output.push('/ip firewall filter add chain=input action=accept in-interface='+q(wanInterface)+
        ' protocol=udp dst-port='+Number(listenPort)+' place-before=[find where comment="Bootstrap block WAN management"]');
    }
    if (config.winbox === true) {
      const peers = entries.map(entry => entry.peer.ip+'/32');
      const sources = name+'-mgmt';
      output.push(':if ([:len [/ip firewall filter find where comment="Drop all other input"]] != 1) do={ :error "Studio input firewall missing" }');
      for (const address of peers) output.push('/ip firewall address-list add list='+q(sources)+' address='+address);
      output.push('/ip firewall filter add chain=input action=accept in-interface='+q(name)+
        ' src-address-list='+q(sources)+' protocol=tcp dst-port=8291 place-before=[find where comment="Drop all other input"]');
      output.push(':local studioWinbox [/ip service get winbox address]; :if ([:len $studioWinbox] > 0) do={ '+
        '/ip service set winbox address=($studioWinbox,[:toarray '+q(peers.join(','))+']) }');
    }
    for (const network of allowed) {
      output.push('/ip firewall filter add chain=forward action=accept in-interface='+q(name)+
        ' out-interface-list=LAN dst-address='+network.cidr+' place-before=[find where comment="Default deny forward"]');
      if (role !== 'remote') output.push('/ip firewall filter add chain=forward action=accept in-interface-list=LAN out-interface='+
        q(name)+' src-address='+network.cidr+' place-before=[find where comment="Default deny forward"]');
    }
    if (role === 'hub') output.push('/ip firewall filter add chain=forward action=accept in-interface='+q(name)+
      ' out-interface='+q(name)+' place-before=[find where comment="Default deny forward"]');
    return {errors:[],script:output.join('\r\n')+'\r\n'};
  }

  const api = {render};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTWireGuard = api;
})(globalThis);
