Set sh = CreateObject("WScript.Shell")
bat = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\Iniciar-MyFocusly.bat"
sh.Run """" & bat & """", 0, False
