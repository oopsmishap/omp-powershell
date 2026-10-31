# omp-powershell

Native PowerShell plugin for **oh-my-pi** with first-class TUI and Tern Surface Protocol (TSP) integration.

## Features

- **Native Execution**: Execute PowerShell scripts, pipelines, and cmdlets directly without wrapping inside `bash` (`powershell.exe -NoProfile -Command "..."`).
- **No Escaping Conflicts**: Preserves PowerShell syntax, variables (`$val`), script blocks (`{ ... }`), backticks, quotes, and pipes without bash mangling.
- **Dual Engine Support**: Auto-detects and supports both modern **PowerShell Core (PowerShell 7+ / `pwsh`)** and **Windows PowerShell 5.1 (`powershell.exe`)**.
- **First-Class TUI & Tern Integration**:
  - Renders as semantic native cards on Tern Surface Protocol (`NativeToolView`) with code highlighting, badges (`[pwsh 7.6]` / `[PS 5.1]`), and live elapsed timers.
  - Formatted ANSI TUI card with `PS>` prompt styling, duration, exit codes, and output preview/tail scrolling.
  - Live output streaming via `onChunk` and `onUpdate`.
- **Intelligent Tool Call Interception**: Automatically detects when models attempt to invoke `powershell.exe` or `pwsh` via `bash` and injects guidance to use the native `powershell` tool directly.
- **Slash Commands**: `/powershell` and `/ps` command to inspect installed engines, active defaults, or execute commands interactively.

## Installation

Install using omp plugin manager:

```bash
omp plugin install H:/projects/_mishap_/omp-powershell
# or link locally for development
omp plugin link H:/projects/_mishap_/omp-powershell
```

## Tools Provided

### `powershell`
Executes PowerShell commands directly.

Parameters:
- `command` (string, required): PowerShell script or command line to execute.
- `cwd` (string, optional): Working directory. Defaults to the session directory.
- `edition` (string, optional): `"auto"` (default), `"core"`, or `"desktop"`.
- `env` (record, optional): Key-value pairs for environment variables.
- `timeout` (number, optional): Execution timeout in seconds (default: 300).
- `i` (string, optional): Intent summary for display in card header.

### `pwsh`
Alias for `powershell` with `edition: "core"` pinned.

## Configuration

Optionally configure preferred engine in `.omp/powershell.json` or `~/.omp/powershell.json`:

```json
{
  "edition": "auto",
  "executionPolicy": "Bypass",
  "noProfile": true,
  "nonInteractive": true,
  "defaultTimeout": 300
}
```

Or via environment variables:
- `OMP_POWERSHELL_EDITION`: `"auto"`, `"core"`, or `"desktop"`
- `OMP_POWERSHELL_PATH`: Custom path to `pwsh.exe` or `powershell.exe`
- `OMP_POWERSHELL_TIMEOUT`: Default timeout in seconds

## License

MIT
