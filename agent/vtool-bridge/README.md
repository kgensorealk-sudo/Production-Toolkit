# Local VTool bridge

This companion connects the website's Reference Structure Repair validation panel to the user's own VTool installation. It uses only Node.js built-ins; no npm install is required for the companion folder. Node.js and a Java runtime compatible with the installed VTool are required. VTool binaries and publisher DTDs are not redistributed.

## Start on Windows

Copy this folder to the production PC and double-click `start-bridge.cmd`. Keep its console running. Copy the displayed pairing code into the website panel and click **Connect**. The code changes each time the bridge starts and is held only in the page's memory.

The default paired website is `http://localhost:3001`. For the deployed site, start from PowerShell with the actual website origin (scheme and hostname, without a page path):

```powershell
$env:TOOLKIT_ORIGIN = 'https://your-toolkit-site.example'
node .\bridge.mjs
```

The bridge listens only on `127.0.0.1:43127`, checks the HTTP host and exact paired origin, and requires its random pairing code. It grants CORS access only to that origin. Allow the browser's local-network permission if prompted; browser/environment support must be verified on each production browser. It is not an automatic Windows service or a packaged installer.

## Find and configure VTool

Discovery checks `VTOOL_DIR` and VTool folders immediately under the user's Desktop, Desktop/FL-Xtools, C:/Vtool, and C:/Tools. It does not scan all drives. If discovery fails, enter the absolute folder containing `vtool.jar` in the web panel and click **Save VTool folder**. The bridge verifies `-version` before saving. Settings live in the user's `.production-toolkit/vtool-bridge.json`, outside the repository.

For Java not on PATH, set `JAVA_BIN` to its absolute executable path before first startup. Saved settings take precedence after configuration.

## Validate

Paste a complete Elsevier article with its standard PUBLIC DOCTYPE into the tool. Select input or repaired output, then **Run VTool**. No repair or XML modification is triggered by validation. Reports retain actual VTool codes, positions, severity, error/warning totals, skipped checks, and version. The reference view is a location/message filter over the full run; it is not proof that all remaining findings are unrelated. Always inspect **All findings** and full totals. Download the full JSON report as needed.

VTool performs DTD and production checks through its own installed version. The bridge does not claim an independent second validator. Document fragments, custom parsed entity declarations, or other publishers' documents are refused rather than presented as fully validated. Local unparsed asset entities are accepted, but asset files are not uploaded: missing graphics, datasets, and other production context can generate findings or prevent full production validation. Run the native production workflow for those checks.

Validation writes an unchanged temporary XML copy and invokes Java with an argument array, no shell. Work runs in an isolated temporary folder with a two-minute execution timeout and an 8 MB XML limit. Temporary input and reports are deleted after the response. One validation job is allowed at a time. Parsed entity declarations are blocked; external DTD/schema access is restricted via Java settings while VTool's bundled catalog resolves standard DTDs. Reports must contain VTool totals to be accepted; startup/timeouts/incomplete reports are shown as failures.

Do not expose the bridge on a LAN interface or allow arbitrary website origins. Do not distribute a pairing code. Changing a PC's VTool version changes its production checks; the report displays that version.
