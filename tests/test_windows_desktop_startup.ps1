$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$installers = @(Get-ChildItem (Join-Path $repo 'src-tauri/target/release/bundle/nsis/*-setup.exe'))
if ($installers.Count -ne 1) { throw "Expected one Windows installer, found $($installers.Count)." }

$dir = Join-Path ([System.IO.Path]::GetTempPath()) "studio-smoke-$([guid]::NewGuid())"
$app = $null
try {
    # NSIS requires /D to be the last argument and to remain unquoted.
    $setup = Start-Process -FilePath $installers[0].FullName -ArgumentList "/S /D=$dir" -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Setup failed with exit code $($setup.ExitCode)." }
    $exe = Join-Path $dir 'mikrotik-studio.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Setup did not install $exe." }

    $app = Start-Process -FilePath $exe -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $app.Refresh()
        if ($app.HasExited) { throw "The installed app exited during startup ($($app.ExitCode))." }
        if ($app.MainWindowHandle -ne [IntPtr]::Zero -and $app.MainWindowTitle -eq 'MikroTik Auto Config Studio') {
            Start-Sleep -Seconds 2
            $app.Refresh()
            if ($app.HasExited -or $app.MainWindowTitle -ne 'MikroTik Auto Config Studio') {
                throw "The desktop window closed during initialization."
            }
            Write-Host "PASS installed Windows executable opened the MikroTik Auto Config Studio window."
            return
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The installed app did not open its main window. Last title: '$($app.MainWindowTitle)'."
}
finally {
    if ($app -and -not $app.HasExited) {
        Stop-Process -Id $app.Id -Force
        $app.WaitForExit()
    }
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
}
