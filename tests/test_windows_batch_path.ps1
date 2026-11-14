$ErrorActionPreference = 'Stop'
# Emulate a normal Windows folder containing spaces and parentheses.
$folder = Join-Path ([System.IO.Path]::GetTempPath()) ('MikroTik test ' + [guid]::NewGuid().ToString('N'))
$folder = Join-Path $folder 'New folder (29)'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
try {
  $source = Split-Path -Parent $PSScriptRoot
  Copy-Item -LiteralPath (Join-Path $source 'CAP_NHAT_TU_DONG.bat') -Destination (Join-Path $folder 'CAP_NHAT_TU_DONG.bat')
  # Replace only the .ps1 in this disposable test folder with an offline probe.
  # This tests how the real BAT launches PowerShell, with no internet or updates.
  $probe = @'
if ($PSScriptRoot -notmatch 'New folder \(29\)') { throw "Incorrect PSScriptRoot: $PSScriptRoot" }
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'path-probe-ok.txt'), 'ok')
'@
  [System.IO.File]::WriteAllText((Join-Path $folder 'CAP_NHAT_TU_DONG.ps1'), $probe)
  $env:CI = 'true'
  $bat = Join-Path $folder 'CAP_NHAT_TU_DONG.bat'
  & $bat
  if ($LASTEXITCODE -ne 0) { throw "BAT exited with code $LASTEXITCODE" }
  $marker = Join-Path $folder 'path-probe-ok.txt'
  if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw 'BAT did not invoke PowerShell with the correct script path.' }
  Write-Host 'PASS real Windows BAT invocation with spaces and parentheses'
}
finally { Remove-Item -LiteralPath (Split-Path -Parent $folder) -Recurse -Force -ErrorAction SilentlyContinue }