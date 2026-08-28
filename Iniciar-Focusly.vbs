Option Explicit
CreateObject("WScript.Shell").Run "wscript.exe //B """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\Focusly.vbs""", 0, False
