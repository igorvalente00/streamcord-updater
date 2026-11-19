$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   StreamCord 2K60 - Instalador Oficial Rapido          " -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$installDir = Join-Path $env:LOCALAPPDATA "StreamCord"
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

$exePath = Join-Path $installDir "StreamCord-2K60.exe"
$downloadUrl = "https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord-2K60.exe?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "  [1/3] Baixando StreamCord 2K60 mais recente..." -ForegroundColor Yellow
$pendingPath = Join-Path $installDir ("StreamCord-" + [Guid]::NewGuid().ToString("N") + ".pending.exe")
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $pendingPath -UseBasicParsing
    $downloaded = [Diagnostics.FileVersionInfo]::GetVersionInfo($pendingPath)
    if ($downloaded.FileMajorPart -lt 1 -or (Get-Item -LiteralPath $pendingPath).Length -lt 50000) {
        throw 'O arquivo baixado nao e um executavel StreamCord valido.'
    }

    Get-Process -Name "StreamCord-2K60" -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exePath } | ForEach-Object {
            Stop-Process -InputObject $_ -Force
            if (-not $_.WaitForExit(5000)) { throw 'O StreamCord ainda esta em execucao.' }
        }
    if (Test-Path -LiteralPath $exePath) {
        $backupPath = $pendingPath + '.bak'
        [IO.File]::Replace($pendingPath, $exePath, $backupPath)
        Remove-Item -LiteralPath $backupPath -ErrorAction SilentlyContinue
    } else {
        [IO.File]::Move($pendingPath, $exePath)
    }
} finally {
    Remove-Item -LiteralPath $pendingPath -ErrorAction SilentlyContinue
}

Write-Host "  [2/3] Criando atalho 'StreamCord 2K60' na Area de Trabalho e Menu Iniciar..." -ForegroundColor Yellow
try {
    $icoPath = Join-Path $installDir "StreamCord.ico"
    $icoUrl = "https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord.ico?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    try { Invoke-WebRequest -Uri $icoUrl -OutFile $icoPath -UseBasicParsing -TimeoutSec 5 } catch {}

    $wsh = New-Object -ComObject WScript.Shell
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcut = $wsh.CreateShortcut((Join-Path $desktopPath "StreamCord 2K60.lnk"))
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installDir
    if (Test-Path $icoPath) { $shortcut.IconLocation = "$icoPath,0" } else { $shortcut.IconLocation = "$exePath,0" }
    $shortcut.Description = "StreamCord - Compartilhamento de Tela 2K 60FPS com Audio"
    $shortcut.Save()

    try {
        $oneDriveDesktop = Join-Path $env:USERPROFILE "OneDrive\Área de Trabalho\StreamCord 2K60.lnk"
        if (Test-Path (Split-Path $oneDriveDesktop)) {
            $odSc = $wsh.CreateShortcut($oneDriveDesktop)
            $odSc.TargetPath = $exePath
            $odSc.WorkingDirectory = $installDir
            if (Test-Path $icoPath) { $odSc.IconLocation = "$icoPath,0" } else { $odSc.IconLocation = "$exePath,0" }
            $odSc.Description = "StreamCord - Compartilhamento de Tela 2K 60FPS com Audio"
            $odSc.Save()
        }
    } catch {}

    $startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    $startShortcut = $wsh.CreateShortcut((Join-Path $startMenuDir "StreamCord 2K60.lnk"))
    $startShortcut.TargetPath = $exePath
    $startShortcut.WorkingDirectory = $installDir
    if (Test-Path $icoPath) { $startShortcut.IconLocation = "$icoPath,0" } else { $startShortcut.IconLocation = "$exePath,0" }
    $startShortcut.Description = "StreamCord - Compartilhamento de Tela 2K 60FPS com Audio"
    $startShortcut.Save()

    try {
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class ShellNotifier {
            [DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
        }
"@ -ErrorAction SilentlyContinue
        [ShellNotifier]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
    } catch {}
} catch {}

Write-Host "  [3/3] Iniciando StreamCord 2K60..." -ForegroundColor Green
Start-Process -FilePath $exePath
Write-Host ""
Write-Host "  Pronto! Atalho criado na Area de Trabalho e aplicativo iniciado!" -ForegroundColor Green
Start-Sleep -Seconds 2
