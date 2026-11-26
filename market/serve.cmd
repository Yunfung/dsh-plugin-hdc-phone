@echo off
setlocal
rem Start the private plugin market (index + read-only npm registry).
rem Node comes from the DSH desktop runtime; fall back to node on PATH.
set "NODE=node"
if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\node\bin\node.exe" set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\node\bin\node.exe"
if not defined MARKET_PORT set "MARKET_PORT=18792"
echo market:   http://127.0.0.1:%MARKET_PORT%/dsh-index.json
echo registry: http://127.0.0.1:%MARKET_PORT%/registry/
"%NODE%" "%~dp0serve.mjs"
pause
