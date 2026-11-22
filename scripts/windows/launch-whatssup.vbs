Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strScript = objFSO.BuildPath(strDir, "launch-whatssup.ps1")

strMode = "prod"
If WScript.Arguments.Count > 0 Then
    strArg = LCase(Trim(WScript.Arguments(0)))
    If strArg = "dev" Or strArg = "prod" Then
        strMode = strArg
    End If
End If

strCmd = "powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strScript & """ -Mode " & strMode
objShell.Run strCmd, 0, False
