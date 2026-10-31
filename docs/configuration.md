# Configuration

`omp-powershell` requires no configuration out of the box. By default, it automatically probes the environment for modern **PowerShell Core (`pwsh.exe` 7+)**, falls back to **Windows PowerShell (`powershell.exe` 5.1)** if Core is not installed, executes scripts with `-ExecutionPolicy Bypass`, and enables UTF-8 output encoding.

To customize runtime behavior, define settings in project-specific or global configuration files, or via environment variables.

---

## Configuration File Hierarchy

Configuration files are resolved in the following order of precedence (highest priority first):

1. **Project-level Configuration**: `<project>/.omp/powershell.json`
2. **User Global Configuration**: `~/.omp/powershell.json`
3. **Agent Global Configuration**: `~/.omp/agent/powershell.json`
4. **Environment Variables**: `OMP_POWERSHELL_*`
5. **Built-in Defaults**

Project-level configurations take precedence over global settings, allowing repositories to specify required PowerShell editions or custom execution policies without affecting other workspaces.

---

## Configuration Options

| Key | Type | Default | Description |
|---|---|---|---|
| `edition` | `"auto" \| "core" \| "desktop"` | `"auto"` | Preferred PowerShell engine. `"core"` forces `pwsh.exe` (PowerShell 7+), `"desktop"` forces `powershell.exe` (Windows PowerShell 5.1), and `"auto"` selects Core if available, falling back to Desktop. |
| `customPath` | `string \| null` | `null` | Absolute path to an explicit PowerShell executable. When set, bypasses automatic discovery. |
| `executionPolicy` | `string` | `"Bypass"` | Process-level execution policy passed via `-ExecutionPolicy`. |
| `noProfile` | `boolean` | `true` | When `true`, passes `-NoProfile` to skip loading user profile scripts (`Microsoft.PowerShell_profile.ps1`). |
| `nonInteractive` | `boolean` | `true` | When `true`, passes `-NonInteractive` to prevent scripts from hanging on interactive prompts (e.g. `Read-Host`). |
| `defaultTimeout` | `number` | `300` | Default process timeout deadline in seconds. Clamped to [1, 3600]. Can be overridden per tool call. Pass `0` to disable timeouts. |
| `utf8Encoding` | `boolean` | `true` | Automatically configures `[Console]::OutputEncoding` and `$OutputEncoding` to UTF-8 before script execution. |

---

## Environment Variables

Every core configuration option can be overridden using environment variables:

| Variable | Config Key | Valid Values | Description |
|---|---|---|---|
| `OMP_POWERSHELL_EDITION` | `edition` | `"auto"`, `"core"`, `"desktop"` | Selects the active PowerShell edition. |
| `OMP_POWERSHELL_PATH` | `customPath` | File path string | Sets an explicit path to `pwsh.exe` or `powershell.exe`. |
| `OMP_POWERSHELL_TIMEOUT` | `defaultTimeout` | Integer (seconds) | Overrides the default execution timeout. |
| `OMP_POWERSHELL_EXECUTION_POLICY` | `executionPolicy` | `"Bypass"`, `"RemoteSigned"`, etc. | Sets process execution policy. |

Environment variable overrides take precedence over global configuration files, but are overridden by local `.omp/powershell.json` project files.

---

## In-Depth Option Guide

### `edition`

- **`"auto"` (Recommended)**: Probes for `pwsh.exe` in `PATH` and common installation directories (`Program Files\PowerShell\7`). If found and functional, selects Core. If Core is unavailable, probes for `powershell.exe` in `System32\WindowsPowerShell\v1.0`.
- **`"core"`**: Enforces PowerShell 7+ (`pwsh.exe`). If Core is not found, tool calls fail with an informative error instructing the user to install PowerShell 7.
- **`"desktop"`**: Enforces legacy Windows PowerShell 5.1 (`powershell.exe`). Useful when maintaining legacy scripts that rely on modules incompatible with .NET Core.

### `noProfile`

By default, `noProfile` is enabled (`true`). Loading user profiles (`$PROFILE`) introduces non-deterministic delays, custom prompt hooks, and third-party modules (e.g. `posh-git`, `oh-my-posh`) that pollute JSON or object stream output. Leaving this enabled ensures predictable, fast agent execution.

### `executionPolicy`

PowerShell restricts script execution on Windows by default. `omp-powershell` passes `-ExecutionPolicy Bypass` at the process level. This applies only to the ephemeral agent process without altering system-wide or user-scoped execution policies.

---

## Example Configurations

### Example 1: Enforce PowerShell 7 Core Across the Project

`<project>/.omp/powershell.json`:
```json
{
  "edition": "core",
  "executionPolicy": "Bypass",
  "defaultTimeout": 180
}
```

### Example 2: Portable / Custom PowerShell Installation

`~/.omp/powershell.json`:
```json
{
  "edition": "core",
  "customPath": "C:\\Tools\\PowerShell\\pwsh.exe",
  "defaultTimeout": 600,
  "utf8Encoding": true
}
```

### Example 3: Legacy Automation Environment

`<project>/.omp/powershell.json`:
```json
{
  "edition": "desktop",
  "executionPolicy": "RemoteSigned",
  "defaultTimeout": 120
}
```
