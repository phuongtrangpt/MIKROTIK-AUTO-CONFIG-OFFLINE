# Offline application updater: fetch ONLY official GitHub Release ZIP.
# Invoke from CAP_NHAT_TU_DONG.bat. No admin privilege normally required.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = 'phuongtrangpt/MIKROTIK-AUTO-CONFIG-OFFLINE'
# PSScriptRoot is set by PowerShell from the actual .ps1 file location; no BAT -AppDir argument.
# Avoid Windows trailing-backslash + quoted-argument parsing issues (e.g. New folder (29)).
if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { throw 'Unable to find the updater directory.' }
$Root = (Resolve-Path -LiteralPath $PSScriptRoot).ProviderPath
$Core = Join-Path $Root 'core.js'
if (-not (Test-Path -LiteralPath $Core)) { throw 'core.js not found; run updater from the application folder.' }

function Read-AppVersion([string]$path) {
  $source = [System.IO.File]::ReadAllText($path)
  $m = [regex]::Match($source, "const VERSION = '(\d+\.\d+\.\d+)';")
  if (-not $m.Success) { throw 'Unable to read installed application version.' }
  return $m.Groups[1].Value
}

$Installed = Read-AppVersion $Core
Write-Host "Installed version: v$Installed"
$Release = Invoke-RestMethod -Method Get -Uri ("https://api.github.com/repos/{0}/releases/latest" -f $Repo) -Headers @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'MikroTik-Auto-Config-Studio-Updater' } -TimeoutSec 30
$Tag = [string]$Release.tag_name
if (-not [regex]::IsMatch($Tag, '^v[0-9]+\.[0-9]+\.[0-9]+$') -or $Release.draft -or $Release.prerelease) { throw 'No valid stable GitHub Release found.' }
$Latest = $Tag.Substring(1)
Write-Host "Latest version:    v$Latest"
if ([version]$Latest -le [version]$Installed) { Write-Host 'Already up to date.'; exit 0 }

$AssetName = "MikroTik_Auto_Config_Studio_${Tag}_Windows_Offline.zip"
$ExpectedUrl = "https://github.com/$Repo/releases/download/$Tag/$AssetName"
$Asset = @($Release.assets | Where-Object { $_.name -eq $AssetName -and $_.browser_download_url -eq $ExpectedUrl -and $_.size -gt 5000 }) | Select-Object -First 1
if (-not $Asset) { throw 'Release ZIP asset not found or URL was unexpected.' }

$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ('MTStudioUpdate-' + [guid]::NewGuid().ToString('N'))
$Archive = Join-Path $Temp $AssetName
$Extract = Join-Path $Temp 'unpacked'
New-Item -ItemType Directory -Path $Extract -Force | Out-Null
$Replaced = @()
$Backup = $null
$Files = @('index.html','core.js','app.js','style.css','update.js','README.md','README.txt','CHANGELOG.txt','CHAY_PHAN_MEM.bat','CAP_NHAT_TU_DONG.bat','CAP_NHAT_TU_DONG.ps1','tests/test_core.js','tests/test_ui_smoke.js','tests/test_update.js','tests/test_update_ui.js','tests/test_updater_path.js','tests/test_windows_batch_path.ps1')
try {
  Write-Host 'Downloading release ZIP from official GitHub repository...'
  Invoke-WebRequest -Uri $ExpectedUrl -OutFile $Archive -MaximumRedirection 5 -TimeoutSec 120 -UseBasicParsing
  if ((Get-Item -LiteralPath $Archive).Length -lt 5000) { throw 'Downloaded ZIP appears truncated.' }
  if ($Asset.digest -and ([string]$Asset.digest -match '^sha256:([A-Fa-f0-9]{64})$')) {
    $ExpectedHash = $Matches[1].ToLowerInvariant()
    $GotHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
    if ($ExpectedHash -ne $GotHash) { throw 'SHA256 mismatch; refusing to install downloaded files.' }
  }
  Expand-Archive -LiteralPath $Archive -DestinationPath $Extract -Force
  $Stage = Join-Path $Extract 'MikroTik_Auto_Config_Studio'
  if (-not (Test-Path -LiteralPath $Stage -PathType Container)) { throw 'Release archive has an unexpected directory structure.' }
  foreach ($Name in $Files) {
    if (-not (Test-Path -LiteralPath (Join-Path $Stage $Name) -PathType Leaf)) { throw "Missing file from ZIP: $Name" }
  }
  if ((Read-AppVersion (Join-Path $Stage 'core.js')) -ne $Latest) { throw 'Downloaded source version does not match release tag.' }
  # Back up all files that the update is allowed to replace; never touch customer data.
  $Backup = Join-Path $Root ('backup_v' + $Installed.Replace('.','_') + '_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  if (Test-Path -LiteralPath $Backup) { throw 'Backup folder already exists; retry the update.' }
  New-Item -ItemType Directory -Path $Backup | Out-Null
  foreach ($Name in $Files) {
    $From = Join-Path $Root $Name
    if (Test-Path -LiteralPath $From -PathType Leaf) {
      $Target = Join-Path $Backup $Name
      $TargetDir = Split-Path -Parent $Target
      New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
      Copy-Item -LiteralPath $From -Destination $Target -Force
    }
  }
  Write-Host "Backup created at: $Backup"
  foreach ($Name in $Files) {
    $Dest = Join-Path $Root $Name
    $DestDir = Split-Path -Parent $Dest
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    # Track the file BEFORE copy: if it fails halfway the rollback still restores it.
    $Replaced += $Name
    Copy-Item -LiteralPath (Join-Path $Stage $Name) -Destination $Dest -Force
  }
  Write-Host "Updated successfully to v$Latest."
  Write-Host 'Your JSON/RSC customer files were not changed.'
  Write-Host 'Close or refresh the old browser tab to load new code.'
  try { Start-Process -FilePath (Join-Path $Root 'index.html') } catch { Write-Warning 'Update done. Please open index.html manually.' }
}
catch {
  Write-Warning ('Update failed: ' + $_.Exception.Message)
  if ($Backup -and (Test-Path -LiteralPath $Backup)) {
    Write-Host 'Restoring program files from backup...'
    foreach ($Name in $Replaced) {
      $Old = Join-Path $Backup $Name
      $Dest = Join-Path $Root $Name
      try {
        if (Test-Path -LiteralPath $Old -PathType Leaf) { Copy-Item -LiteralPath $Old -Destination $Dest -Force }
        elseif (Test-Path -LiteralPath $Dest -PathType Leaf) { Remove-Item -LiteralPath $Dest -Force }
      }
      catch { Write-Warning ("Could not restore: $Name. See backup folder: $Backup") }
    }
  }
  throw
}
finally {
  if (Test-Path -LiteralPath $Temp) { Remove-Item -LiteralPath $Temp -Recurse -Force -ErrorAction SilentlyContinue }
}