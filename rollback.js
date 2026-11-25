'use strict';

(function (root) {
  const core = root.MTCore || require('./core.js');
  const scheduler = 'studio-config-rollback';
  const marker = 'MikroTik Studio rollback ';
  const q = core.q;

  function arm(seconds, token) {
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 1800 || !/^[0-9a-f]{16}$/.test(token)) {
      throw new Error('Thông tin hẹn khôi phục không hợp lệ.');
    }
    const backup = 'studio-restore-' + token;
    const description = marker + token;
    return [
      '{',
      '  :if ([:len [/system scheduler find where name='+q(scheduler)+']] > 0) do={ :error "Studio rollback already armed" };',
      '  :if ([:len [/file find where name='+q(backup+'.backup')+']] > 0) do={ :error "Studio rollback backup already exists" };',
      '  :local studioPassword [:rndstr length=48 from="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"];',
      '  /system backup save name='+q(backup)+' password=$studioPassword dont-encrypt=no encryption=aes-sha256;',
      '  :if ([:len [/file find where name='+q(backup+'.backup')+']] != 1) do={ :error "Studio rollback backup missing" };',
      '  :global studioRollbackKey; :set studioRollbackKey $studioPassword;',
      '  :global studioRollbackDeadline; :set studioRollbackDeadline ([/system resource get uptime] + '+seconds+'s);',
      '  /system scheduler add name='+q(scheduler)+' comment='+q(description)+' interval=5s on-event={',
      '    :global studioRollbackKey; :global studioRollbackDeadline;',
      '    :if ([:len $studioRollbackKey] = 48 && [/system resource get uptime] < $studioRollbackDeadline) do={ :return };',
      '    /system scheduler disable [find where name='+q(scheduler)+' and comment='+q(description)+'];',
      '    :if ([:len $studioRollbackKey] != 48) do={ :log error "Studio rollback password unavailable"; :error "Studio rollback password unavailable" };',
      '    /system backup load name='+q(backup+'.backup')+' password=$studioRollbackKey;',
      '  };',
      '  :put "Studio rollback armed";',
      '}',
      ''
    ].join('\r\n');
  }

  function confirm() {
    return [
      '{',
      '  :local studioTask [/system scheduler find where name='+q(scheduler)+' and disabled=no and comment~'+q('^'+marker+'[0-9a-f]{16}$')+'];',
      '  :if ([:len $studioTask] != 1) do={ :error "Studio rollback job missing" };',
      '  :local studioComment [/system scheduler get $studioTask comment];',
      '  :local studioBackup ("studio-restore-" . [:pick $studioComment '+marker.length+' [:len $studioComment]] . ".backup");',
      '  /system scheduler remove $studioTask;',
      '  :global studioRollbackKey; :set studioRollbackKey;',
      '  :global studioRollbackDeadline; :set studioRollbackDeadline;',
      '  /file remove [find where name=$studioBackup];',
      '  :put "Studio changes confirmed";',
      '}',
      ''
    ].join('\r\n');
  }

  const api = {arm, confirm};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTRollback = api;
})(globalThis);
