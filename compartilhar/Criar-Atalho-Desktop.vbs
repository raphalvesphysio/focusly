Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = dir & "\Iniciar-MyFocusly.vbs"
desktop = sh.SpecialFolders("Desktop")
Set lnk = sh.CreateShortcut(desktop & "\MyFocusly.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = """" & launcher & """"
lnk.WorkingDirectory = dir
lnk.Description = "MyFocusly — app online, backup local"
lnk.Save
MsgBox "Atalho MyFocusly criado na Area de Trabalho.", 64, "MyFocusly"
