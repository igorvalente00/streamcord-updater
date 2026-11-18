$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   StreamCord 2K60 v9.0.0 - Instalador Oficial Rapido   " -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

$installDir = Join-Path $env:LOCALAPPDATA "StreamCord"
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

$exePath = Join-Path $installDir "StreamCord-2K60.exe"
$downloadUrl = "https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord-2K60.exe?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# Fecha instancia antiga caso esteja aberta para atualizar sem erro
Get-Process -Name "StreamCord-2K60" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

Write-Host "  [1/3] Baixando StreamCord 2K60 mais recente..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing

Write-Host "  [2/3] Criando atalho 'StreamCord 2K60' na Area de Trabalho..." -ForegroundColor Yellow
try {
    $wsh = New-Object -ComObject WScript.Shell
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcut = $wsh.CreateShortcut((Join-Path $desktopPath "StreamCord 2K60.lnk"))
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = "StreamCord - Compartilhamento de Tela 2K 60FPS com Audio"
    $shortcut.Save()

    $startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    $startShortcut = $wsh.CreateShortcut((Join-Path $startMenuDir "StreamCord 2K60.lnk"))
    $startShortcut.TargetPath = $exePath
    $startShortcut.WorkingDirectory = $installDir
    $startShortcut.Description = "StreamCord - Compartilhamento de Tela 2K 60FPS com Audio"
    $startShortcut.Save()
} catch {}

Write-Host "  [3/3] Iniciando StreamCord 2K60..." -ForegroundColor Green
Start-Process -FilePath $exePath
Write-Host ""
Write-Host "  Pronto! Atalho criado na Area de Trabalho e aplicativo iniciado!" -ForegroundColor Green
Start-Sleep -Seconds 2
