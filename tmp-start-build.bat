@echo off
cd /d D:\dbx-lite
call tmp-cargo-env.bat build --release -p dbx --features custom-protocol --message-format short > target\release\build-lite.log 2>&1
echo EXIT=%ERRORLEVEL%>> target\release\build-lite.log
