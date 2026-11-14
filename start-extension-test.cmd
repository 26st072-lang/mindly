@echo off
setlocal
cd /d "%~dp0"
if exist "..\.deploy-tools\node-v26.13.0-win-x64\node.exe" (
  "..\.deploy-tools\node-v26.13.0-win-x64\node.exe" "scripts\dev-extension.mjs"
) else (
  node "scripts\dev-extension.mjs"
)
if errorlevel 1 pause
