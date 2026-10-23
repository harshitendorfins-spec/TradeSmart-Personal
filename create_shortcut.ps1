$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "TradeSmart.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Windows\System32\wscript.exe"
$shortcut.Arguments = "`"C:\Users\TRADERDESK12E\Desktop\TradeSmart\TradeSmart.vbs`""
$shortcut.WorkingDirectory = "C:\Users\TRADERDESK12E\Desktop\TradeSmart"
$shortcut.Description = "TradeSmart - Virtual F&O Trading Terminal"

$chromeIcon = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edgeIcon = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $chromeIcon) {
    $shortcut.IconLocation = "$chromeIcon,0"
} elseif (Test-Path $edgeIcon) {
    $shortcut.IconLocation = "$edgeIcon,0"
} else {
    $shortcut.IconLocation = "shell32.dll,14"
}

$shortcut.Save()
Write-Host "Created TradeSmart.lnk on Desktop: $shortcutPath"
