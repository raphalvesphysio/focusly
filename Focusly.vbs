Option Explicit
Dim fso, shell, root, nodeModules, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
nodeModules = root & "\node_modules"

If Not fso.FolderExists(nodeModules) Then
  cmd = "cmd /c cd /d """ & root & """ && npm install"
  If shell.Run(cmd, 0, True) <> 0 Then
    MsgBox "Nao foi possivel instalar o Focusly. Verifique se o Node.js esta instalado.", vbCritical, "Focusly"
    WScript.Quit 1
  End If
End If

cmd = "cmd /c cd /d """ & root & """ && node scripts\launch-desktop.js"
shell.Run cmd, 0, False
