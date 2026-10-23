$ws = New-Object -ComObject WScript.Shell
$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "TradeSmart_Service.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Windows\System32\wscript.exe"
$shortcut.Arguments = "`"C:\Users\TRADERDESK12E\Desktop\TradeSmart\TradeSmart_Service.vbs`""
$shortcut.WorkingDirectory = "C:\Users\TRADERDESK12E\Desktop\TradeSmart"
$shortcut.Description = "TradeSmart Background Service"
$shortcut.Save()
Write-Host "TradeSmart background service registered in Startup: $shortcutPath"
