Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\TRADERDESK12E\Desktop\TradeSmart"
WshShell.Run "python launcher.py --background", 0, False
