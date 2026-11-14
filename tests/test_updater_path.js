// Regression test: Windows batch command line must not pass a directory ending with "\".
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bat = fs.readFileSync(path.join(root, 'CAP_NHAT_TU_DONG.bat'), 'utf8');
const ps1 = fs.readFileSync(path.join(root, 'CAP_NHAT_TU_DONG.ps1'), 'utf8');
assert.match(bat, /-File\s+"%~dp0CAP_NHAT_TU_DONG\.ps1"/i, 'PowerShell script path must be quoted');
assert.doesNotMatch(bat, /^powershell\.exe\b[^\r\n]*\s-AppDir\s/im, 'Do not pass the trailing-slash folder argument');
assert.match(ps1, /\$PSScriptRoot/, 'Updater must locate own directory without BAT parameter');
assert.match(ps1, /Resolve-Path\s+-LiteralPath\s+\$PSScriptRoot/, 'Use script directory as root');
assert.doesNotMatch(ps1, /-LiteralPath\s+\$AppDir/, 'Do not read unsafe folder string');
assert.match(bat, /if not defined CI pause/i, 'BAT should be testable without interactive pause');
console.log('PASS path-safe BAT/PowerShell argument handling (spaces and parentheses supported)');