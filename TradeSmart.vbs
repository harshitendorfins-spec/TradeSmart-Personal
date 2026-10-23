Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\TRADERDESK12E\Desktop\TradeSmart"
WshShell.Run "cmd.exe /c python launcher.py --app-mode", 0, False
