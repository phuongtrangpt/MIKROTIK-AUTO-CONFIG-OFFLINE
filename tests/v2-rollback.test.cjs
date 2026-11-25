const assert = require('node:assert/strict');
const test = require('node:test');
const {arm, confirm} = require('../rollback.js');

test('timed rollback saves the encrypted backup before arming and keeps the key volatile', () => {
  const commands = arm(300,'1234567890abcdef');
  assert.ok(commands.indexOf('/system backup save') < commands.indexOf('/system scheduler add'));
  assert.match(commands,/encryption=aes-sha256/);
  assert.match(commands,/\[\/system resource get uptime\] \+ 300s/);
  assert.match(commands,/\/system backup load name="studio-restore-1234567890abcdef.backup" password=\$studioRollbackKey/);
  assert.throws(()=>arm(300,'invalid-token'));
  assert.throws(()=>arm(0,'1234567890abcdef'));
});

test('confirm targets only an active Studio job and clears it before the temporary backup', () => {
  const commands = confirm();
  assert.match(commands,/name="studio-config-rollback" and disabled=no and comment~/);
  assert.ok(commands.indexOf('/system scheduler remove') < commands.indexOf('/file remove'));
  assert.match(commands,/:set studioRollbackKey;/);
});
