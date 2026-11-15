Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\auto_sync_vigilante.bat"
WshShell.CurrentDirectory = scriptDir
WshShell.Run chr(34) & batPath & chr(34), 0, False
Set WshShell = Nothing
Set fso = Nothing
