---
description: Prefer native PowerShell tool over bash wrapping on Windows
alwaysApply: true
---

# Native PowerShell Tool Usage

When working on Windows and executing PowerShell scripts, cmdlets, or system queries, always prefer omp's built-in native `powershell` (or `pwsh`) tool over running `powershell.exe -NoProfile -Command "..."` or `pwsh -Command "..."` inside the `bash` tool.

### Why

- **No Escaping Nightmares**: PowerShell scripts frequently use `$`, `&`, `|`, quotes, and backticks. Passing them through `bash -c` requires double escaping or breaks syntax completely.
- **Direct Execution**: Spawning PowerShell directly eliminates unnecessary subshell overhead and processes pipelines cleanly.
- **Native TUI / Tern Cards**: Tool calls render as first-class PowerShell cards in the TUI and Tern Surface Protocol (TSP) with syntax highlighting, live elapsed timer, exit codes, and engine badges (`[pwsh 7.6]` vs `[PS 5.1]`).
- **Live Output Streaming**: Real-time stdout and stderr output are streamed directly to the UI.

### Comparison

| Task | Do this (`powershell` tool) | Don't do this (`bash` tool) |
|---|---|---|
| Query processes | `powershell(command: "Get-Process -Name bun \| Select-Object Id, ProcessName, CPU, WorkingSet64")` | `bash(command: "powershell.exe -NoProfile -Command \"Get-Process -Name bun ...\"")` |
| Query CIM / WMI | `powershell(command: "Get-CimInstance Win32_Process -Filter 'Name like \"%bun%\"' \| Select-Object ProcessId, CommandLine")` | `bash(command: "powershell.exe -Command \"Get-CimInstance Win32_Process -Filter \\\"Name like '%bun%'\\\" ...\"")` |
| Check environment | `powershell(command: "$PSVersionTable.PSVersion.ToString()")` | `bash(command: "powershell.exe -Command \"$PSVersionTable...\"")` (bash expands `$PSVersionTable` to empty!) |
| Multi-line script | `powershell(command: "$p = Get-Process\n$p \| Where-Object CPU -gt 10")` | Complex bash heredocs with escaping |

### Tool Parameters

- `command` (required): PowerShell script or pipeline to execute.
- `cwd` (optional): Working directory. Defaults to the session directory.
- `edition` (optional): `"auto"` (prefers pwsh 7+, falls back to powershell.exe 5.1), `"core"` (pwsh), or `"desktop"` (powershell.exe).
- `env` (optional): Key-value pairs for environment variables (`$env:NAME`).
- `timeout` (optional): Execution timeout in seconds (default: 300).
- `i` (optional): Present-participle intent summary for the card header (e.g. `'Checking process CPU usage'`).
