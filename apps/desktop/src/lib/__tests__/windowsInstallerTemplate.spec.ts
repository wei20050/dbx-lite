import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldAbortWindowsWebView2RuntimeFallback } from "@/lib/app/windowsWebView2RuntimePolicy";

const template = readFileSync(resolve(process.cwd(), "src-tauri/windows/nsis/installer.nsi"), "utf8");
const win7Config = JSON.parse(readFileSync(resolve(process.cwd(), "src-tauri/tauri.webview2-win7-fixed.conf.json"), "utf8"));
const win7RuntimeScript = readFileSync(resolve(process.cwd(), ".github/scripts/prepare-webview2-win7-runtime.ps1"), "utf8");
const win7PeAuditScript = readFileSync(resolve(process.cwd(), ".github/scripts/assert-win7-pe-compat.ps1"), "utf8");
const workspaceCargoToml = readFileSync(resolve(process.cwd(), "Cargo.toml"), "utf8");
const wryWebView2Source = readFileSync(resolve(process.cwd(), "vendor/wry/src/webview2/mod.rs"), "utf8");
const fixedRuntimeConfig = JSON.parse(readFileSync(resolve(process.cwd(), "src-tauri/tauri.webview2-win7-fixed.conf.json"), "utf8"));
const clientConfig = JSON.parse(readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"));

describe("Windows offline installer template", () => {
  it("routes supported legacy Windows users from generic installers to the fixed-runtime package", () => {
    expect(template).toContain("ManifestSupportedOS all");
    expect(template).toContain("!include WinVer.nsh");
    // Tauri 2.11 renders fixedRuntime as an empty NSIS install mode instead of
    // the literal "fixedRuntime" string.
    expect(template).toContain('!if "${INSTALLWEBVIEW2MODE}" != ""');
    expect(template).not.toContain('!if "${INSTALLWEBVIEW2MODE}" != "fixedRuntime"');
    expect(template).toContain("${If} ${IsWin7}");
    expect(template).toContain("${OrIf} ${IsWin2008R2}");
    expect(template).toContain("${OrIf} ${IsWin2012R2}");
    expect(template).toContain('MessageBox MB_ICONSTOP|MB_YESNO|MB_DEFBUTTON1 "$(dbxWin7InstallerRequired)" IDYES dbx_open_win7_installer');
    expect(template).toContain('${GetParent} "$EXEPATH" $0');
    // The fixed-runtime build says which systems it targets in the installer
    // title; productName must stay path-safe ("/" is rejected by Tauri).
    expect(template).toContain('!define DBX_WINDOW_TITLE "${PRODUCTNAME} - Windows 7 / Server 2008 R2+"');
    expect(clientConfig.productName).toBe("DBX");
    expect(fixedRuntimeConfig.productName).toBeUndefined();
    expect(template).toContain("DBX_${VERSION}_x64-win7-server2008r2-offline-setup.exe?from=${VERSION}");
    expect(template).not.toContain("win7-server2012r2-offline-setup.exe");
    expect(template).toContain("SetErrorLevel 1633");
    expect(template).toContain("${OrIf} $PassiveMode = 1");
  });

  it("localizes the Windows 7 package guidance in every installer language", () => {
    expect(template.match(/LangString dbxWin7InstallerRequired/g)).toHaveLength(3);
    expect(template).toContain("For Windows 7 or Windows Server 2008 R2 and later, use the dedicated Windows 7 / Server 2008 R2+ package.");
    expect(template).toContain("Windows 7 与 Windows Server 2008 R2 及以上请使用 Windows 7 / Server 2008 R2+ 专用包。");
    expect(template).toContain("Windows 7 與 Windows Server 2008 R2 及以上請改用 Windows 7 / Server 2008 R2+ 專用套件。");
  });

  it.each([
    {
      name: "continues after installer failure when a compatible Runtime remains",
      input: { installerExitCode: 1, runtimeDetected: true, runtimeMeetsMinimum: true },
      expected: false,
    },
    {
      name: "aborts after installer failure when the Runtime is missing",
      input: { installerExitCode: 1, runtimeDetected: false, runtimeMeetsMinimum: false },
      expected: true,
    },
    {
      name: "aborts after installer failure when the Runtime is below the minimum",
      input: { installerExitCode: 1, runtimeDetected: true, runtimeMeetsMinimum: false },
      expected: true,
    },
    {
      name: "continues after a successful installer even before the registry refresh",
      input: { installerExitCode: 0, runtimeDetected: false, runtimeMeetsMinimum: false },
      expected: false,
    },
  ])("$name", ({ input, expected }) => {
    expect(shouldAbortWindowsWebView2RuntimeFallback(input)).toBe(expected);
  });

  it("binds the tested fallback inputs to the NSIS Runtime recheck contract", () => {
    expect(template).toContain(`!macro ShouldAbortWebView2OfflineInstall INSTALL_RESULT RUNTIME_VERSION MINIMUM_COMPARISON RESULT
  StrCpy \${RESULT} 0
  \${If} \${INSTALL_RESULT} <> 0
    \${If} \${RUNTIME_VERSION} == ""
      StrCpy \${RESULT} 1
    \${ElseIf} \${MINIMUM_COMPARISON} = 1
      StrCpy \${RESULT} 1
    \${EndIf}
  \${EndIf}
!macroend`);
    expect(template).toContain(`!insertmacro ReadWebView2RuntimeVersion $4
      \${If} $4 != ""
        !if "\${MINIMUMWEBVIEW2VERSION}" != ""
          \${VersionCompare} "\${MINIMUMWEBVIEW2VERSION}" "$4" $R0
        !endif
      \${EndIf}
    \${EndIf}
    !insertmacro ShouldAbortWebView2OfflineInstall $1 $4 $R0 $R1
    \${If} $R1 = 1
      Abort "$(webview2AbortError)"
    \${EndIf}`);
  });

  it("uses the same registry detection before and after Runtime installation", () => {
    const runtimeChecks = template.match(/!insertmacro ReadWebView2RuntimeVersion \$4/g) ?? [];

    expect(runtimeChecks).toHaveLength(2);
    expect(template).toContain('ReadRegStr ${RESULT} HKLM "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2APPGUID}" "pv"');
    expect(template).toContain('ReadRegStr ${RESULT} HKCU "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2APPGUID}" "pv"');
  });
});

describe("Windows 7 fixed WebView2 runtime bundle", () => {
  it("bundles a fixed runtime instead of invoking a system Runtime installer", () => {
    expect(win7Config.bundle.windows.webviewInstallMode).toEqual({
      type: "fixedRuntime",
      path: "webview2-fixed-runtime",
    });
    expect(win7RuntimeScript).toContain("Microsoft.WebView2.FixedVersionRuntime.$runtimeVersion.x64");
    expect(win7RuntimeScript).toContain("msedgewebview2.exe");
    expect(win7RuntimeScript).not.toContain("microsoftedgestandaloneinstaller");
    expect(win7RuntimeScript).not.toContain("go.microsoft.com/fwlink");
  });

  it("pins the archived Microsoft runtime before extracting it", () => {
    expect(win7RuntimeScript).toContain('$runtimeVersion = "109.0.1518.78"');
    expect(win7RuntimeScript).toContain('$runtimeSha256 = "7622281cf83de1a35e3a471f432f7a897d65f0a7d3975df08512b7b253dd45c7"');
    expect(win7RuntimeScript).toContain("Get-FileHash -LiteralPath $archivePath -Algorithm SHA256");
    expect(win7RuntimeScript).toContain("Get-AuthenticodeSignature -LiteralPath $archivePath");
    expect(win7RuntimeScript).toContain('$signature.SignerCertificate.Subject -notmatch "Microsoft Corporation"');
    expect(win7RuntimeScript).toContain('& $expand $archivePath "-F:*" $extractDirectory');
  });

  it("rejects executable imports that cannot load on Windows 7", () => {
    expect(win7PeAuditScript).toContain('"combase.dll"');
    expect(win7PeAuditScript).toContain('"api-ms-win-core-winrt-"');
    expect(win7PeAuditScript).toContain('"CoIncrementMTAUsage"');
    expect(win7PeAuditScript).toContain('"GetSystemTimePreciseAsFileTime"');
    expect(win7PeAuditScript).toContain('"VCRUNTIME140.dll"');
    expect(win7PeAuditScript).toContain('"MSVCP140.dll"');
    expect(win7PeAuditScript).toContain('"ucrtbase.dll"');
    expect(win7PeAuditScript).toContain('"api-ms-win-crt-"');
    expect(win7PeAuditScript).toContain("dumpbin.exe");
  });

  
  it("passes the configured fixed-runtime folder to WebView2 discovery and creation", () => {
    expect(workspaceCargoToml).toContain('wry = { path = "vendor/wry" }');
    expect(wryWebView2Source).toContain('std::env::var_os("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER")');
    // The webview2_com crate indents this with 8 spaces; assert on the two
    // adjacent lines loosely so a formatter's re-indent doesn't break the test.
    expect(wryWebView2Source).toContain("CreateCoreWebView2EnvironmentWithOptions(");
    expect(wryWebView2Source).toContain("browser_executable_folder_ptr,");
    expect(wryWebView2Source).toContain("GetAvailableCoreWebView2BrowserVersionString(browser_executable_folder_ptr, &mut versioninfo)");
  });

  });
