@echo off
set "PATH=C:\Users\wyx\.local\strawberry\perl\bin;C:\Users\wyx\.local\strawberry\c\bin;C:\Users\wyx\.cargo\bin;%PATH%"
call "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" >nul
%*
