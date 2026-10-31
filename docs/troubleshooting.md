# Troubleshooting

This guide addresses common issues, diagnostic steps, and resolutions when running `omp-powershell`.

---

## 1. Engine Detection and Availability

### Issue: `pwsh` not detected; falling back to `powershell.exe`

`omp-powershell` automatically looks for PowerShell 7+ (`pwsh.exe`) in your system `PATH` and standard installation paths (`%ProgramFiles%\PowerShell\7`). If it is not found, it falls back to Windows PowerShell 5.1.

#### Verification

Run `/ps` in chat:
```text
/ps
```

If `Core (pwsh.exe)` is reported as `Not detected`:

#### Resolution

1. Install modern PowerShell 7:
   ```powershell
   winget install --id Microsoft.PowerShell --source winget
   ```
2. Restart `oh-my-pi` or ensure `C:\Program Files\PowerShell\7` is present in your user/system `PATH`.
3. If installed in a non-standard location (such as portable zip or Scoop), specify `customPath` in `.omp/powershell.json`:
   ```json
   {
     "edition": "core",
     "customPath": "C:\\Users\\mishap\\scoop\\apps\\pwsh\\current\\pwsh.exe"
   }
   ```

---

## 2. Interactive Prompts & Stdin Freezes

### Issue: Tool call hangs until timeout

PowerShell commands that expect user interaction (e.g. `Read-Host`, `Get-Credential`, or prompts like `Remove-Item` without `-Force`) will block waiting for interactive stdin input.

#### Resolution

- Always pass non-interactive flags in script commands:
  - Use `-Force` and `-Confirm:$false` on destructive cmdlets (`Remove-Item -Path $target -Recurse -Force -Confirm:$false`).
  - Avoid `Read-Host` inside automated scripts.
- `omp-powershell` passes `-NonInteractive` by default. Under `-NonInteractive`, cmdlets requiring interaction will raise a terminating error rather than hanging indefinitely.

---

## 3. Execution Policy Restrictions

### Issue: `File ... cannot be loaded because running scripts is disabled on this system`

While `omp-powershell` launches with `-ExecutionPolicy Bypass`, domain Group Policy (GPO) may enforce machine-level execution policy restrictions (`AllSigned` or `Restricted`).

#### Verification

Check current execution policy hierarchy:
```powershell
Get-ExecutionPolicy -List
```

#### Resolution

If `MachinePolicy` or `UserPolicy` is set by GPO, configure `CurrentUser` execution policy:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

Alternatively, set `executionPolicy` explicitly in `.omp/powershell.json`:
```json
{
  "executionPolicy": "Unrestricted"
}
```

---

## 4. Character Encoding & Mojibake

### Issue: Accented characters, Chinese/Japanese glyphs, or table lines render corrupted

Older Windows PowerShell 5.1 defaults to OEM code pages (e.g. CP437 on US systems) rather than UTF-8.

#### Resolution

`omp-powershell` enables UTF-8 encoding by default by injecting:
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$OutputEncoding = [System.Text.Encoding]::UTF8;
```

If running external CLI executables (e.g. `cmd.exe` utilities or legacy binaries) that don't respect .NET console encodings, add `chcp 65001` before the command:
```powershell
chcp 65001 >$null; & my-legacy-tool.exe
```

For optimal UTF-8 handling, upgrade to **PowerShell 7+ (`pwsh`)**, which defaults to UTF-8 across all streams.

---

## 5. Working Directory & Path Escaping

### Issue: Paths with brackets (`[` and `]`) fail or expand incorrectly

PowerShell treats square brackets as wildcard characters by default in `-Path`.

#### Resolution

`omp-powershell` internally passes working directories using `-LiteralPath`:
```powershell
Set-Location -LiteralPath 'H:\projects\[special]\src'
```

When authoring custom scripts that reference paths containing brackets or wildcards, always use `-LiteralPath` rather than `-Path`:
```powershell
Get-ChildItem -LiteralPath 'C:\temp\[archive]'
```

---

## 6. Long-Running Jobs & Timeouts

### Issue: Process terminates with `Execution timed out after 300 seconds`

Tool calls default to a 300-second deadline to prevent runaway processes from consuming CPU.

#### Resolution

For long-running tasks (e.g. large builds, downloads, or deep file searches):
- Supply a custom `timeout` in the tool call:
  ```json
  {
    "command": "Invoke-BuildLargeTarget",
    "timeout": 1200
  }
  ```
- Or update your project configuration in `.omp/powershell.json`:
  ```json
  {
    "defaultTimeout": 600
  }
  ```
- Pass `0` to disable the timeout deadline entirely.
