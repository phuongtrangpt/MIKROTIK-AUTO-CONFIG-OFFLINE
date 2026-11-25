const assert = require('node:assert/strict');
const test = require('node:test');
const {generateKeyPairSync} = require('node:crypto');
const C = require('../core.js');
const WG = require('../wireguard.js');
const key = () => generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const peer = (ip, networks='') => ({ip, key:key(), networks});
const setup = (role, peers) => ({
  role, peers, name:'wg-office', address:'10.80.0.1/24', listenPort:51820, networks:'192.168.1.0/24'
});

test('remote access opens listener only on the selected primary WAN and only forwards to selected LAN', () => {
  const result = WG.render(setup('remote',[peer('10.80.0.2')]), C.defaultState());
  assert.deepEqual(result.errors, []);
  assert.match(result.script,/listen-port=51820/);
  assert.match(result.script,/allowed-address=10\.80\.0\.2\/32/);
  assert.match(result.script,/in-interface="pppoe-WAN1" protocol=udp dst-port=51820/);
  assert.match(result.script,/out-interface-list=LAN dst-address=192\.168\.1\.0\/24/);
  assert.doesNotMatch(result.script,/private-key|action=masquerade/);
});

test('hub declares site routes and rejects overlap across peers', () => {
  const config = setup('hub',[peer('10.80.0.2','192.168.2.0/24'),peer('10.80.0.3','192.168.3.0/24')]);
  const result = WG.render(config,C.defaultState());
  assert.deepEqual(result.errors,[]);
  assert.match(result.script,/dst-address=192\.168\.3\.0\/24 gateway="wg-office"/);
  assert.match(result.script,/in-interface="wg-office" out-interface="wg-office"/);
  config.peers[1].networks='192.168.2.128/25';
  assert.equal(WG.render(config,C.defaultState()).script,'');
});

test('site-to-site initiator uses an external endpoint and retains LAN routes', () => {
  const remote = {...peer('10.80.0.2','192.168.2.0/24'),endpoint:'vpn.example.org',port:51820};
  const result = WG.render(setup('site',[remote]),C.defaultState());
  assert.deepEqual(result.errors,[]);
  assert.match(result.script,/endpoint-address="vpn.example.org" endpoint-port=51820 persistent-keepalive=25s/);
  assert.doesNotMatch(result.script,/chain=input/);
  remote.networks = '192.168.1.0/24';
  assert.equal(WG.render(setup('site',[remote]),C.defaultState()).script,'');
});
