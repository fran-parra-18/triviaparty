# Crea en el escritorio un acceso directo «Trivia Party» con el logo como ícono.
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'Trivia Party.lnk'))
$lnk.TargetPath = Join-Path $root 'Iniciar Trivia Party.bat'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = (Join-Path $root 'scripts\trivia.ico') + ',0'
$lnk.Description = 'Iniciar Trivia Party'
$lnk.Save()
Write-Host 'Acceso directo creado en el escritorio.'
