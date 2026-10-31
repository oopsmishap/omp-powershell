# Product and UI Reference

`omp-powershell` provides native PowerShell integration for `oh-my-pi` coding agents. This document covers tool schemas, execution semantics, Tern Surface Protocol (TSP) native card nodes, ANSI terminal renderers, bash interception hooks, and lifecycle error handling.

---

## Tools

The extension registers two LLM-callable tools: `powershell` and `pwsh`.

### `powershell`

The primary tool for executing PowerShell scripts, pipelines, and cmdlets directly on Windows or cross-platform PowerShell Core installations.

#### Parameter Schema

```typescript
interface PowerShellToolParams {
  /**
   * The PowerShell script block, pipeline, or cmdlet command to execute.
   */
  command: string;

  /**
   * Optional working directory. Defaults to the current session workspace directory.
   * PowerShell sets location via Set-Location -LiteralPath.
   */
  cwd?: string;

  /**
   * Target engine edition:
   * - "auto": Defaults to modern PowerShell Core (pwsh 7+) if installed; falls back to Windows PowerShell 5.1.
   * - "core": Explicitly targets pwsh.exe (PowerShell 7+).
   * - "desktop": Explicitly targets powershell.exe (Windows PowerShell 5.1).
   */
  edition?: "auto" | "core" | "desktop";

  /**
   * Key-value map of environment variables injected into the process environment ($env:KEY).
   */
  env?: Record<string, string>;

  /**
   * Execution timeout in seconds. Non-zero values clamp to [1, 3600]. Defaults to 300.
   * Pass 0 to disable the command deadline.
   */
  timeout?: number;

  /**
   * Intent summary: 2–6 word present-participle phrase displayed in the UI header
   * (e.g. "Listing top memory processes", "Inspecting registry entries").
   */
  i?: string;
}
```

#### Return Value

Returns the combined output of stdout and stderr as a string. If the process exits with a non-zero exit code or encounters a timeout/abort, the tool returns a formatted error string containing the exit code and full standard error trace.

---

### `pwsh`

An explicit alias for `powershell` with `edition` fixed to `"core"`. Use when scripts require PowerShell 7+ language features (e.g., null-coalescing `??=`, ternary `?:`, parallel `ForEach-Object -Parallel`, or modern .NET Core APIs).

---

## Execution Engine

### Piped Standard Input Execution

To avoid command-line length limits (Windows imposes an 8,191-character limit on `cmd.exe` and `CreateProcess` command lines) and shell escaping corruption, `omp-powershell` executes scripts via standard input (`stdin`):

```bash
pwsh.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -
```

The script content is written directly to standard input followed by standard stream closure.

### UTF-8 Output Encoding Preamble

By default on Windows, both PowerShell 5.1 and earlier builds of PowerShell 7 inherit legacy console code pages (such as CP437, CP850, or Windows-1252). This corrupts UTF-8 output from CLI tools and cmdlets.

Before executing user scripts, `omp-powershell` automatically prepends an encoding preamble:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$OutputEncoding = [System.Text.Encoding]::UTF8;
```

This guarantees that:
- Non-ASCII text (accented characters, Chinese, Japanese, Korean, Cyrillic) renders without mojibake.
- Unicode box-drawing characters and tables (`┌─┬┐`, `│ ║`, etc.) render cleanly.
- JSON output parsed or serialized via `ConvertFrom-Json` / `ConvertTo-Json` preserves character integrity.

### Working Directory Handling

When `cwd` is supplied, `omp-powershell` validates the target path and prepends:

```powershell
Set-Location -LiteralPath '<sanitized-path>';
```

Using `-LiteralPath` ensures that paths containing square brackets (such as `H:\projects\[work]\src`) are treated literally rather than interpreted as wildcard patterns.

---

## Tern Surface Protocol (TSP) Integration

`omp-powershell` renders execution using Tern Surface Protocol native card nodes when running inside a Tern-capable interface.

### Card Architecture

The renderer configures `mergeCallAndResult: true`, rendering the tool invocation and its resulting output within a single unified card:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ powershell: Listing top memory processes                 [pwsh 7.6.9] │
├────────────────────────────────────────────────────────────────────────┤
│ PS> Get-Process | Sort-Object WorkingSet64 -Descending |               │
│     Select-Object -First 5                                            │
├────────────────────────────────────────────────────────────────────────┤
│   Id ProcessName                     WS(M)                             │
│   ── ───────────                     ─────                             │
│ 4120 chrome                         412.32                             │
│ 8904 pwsh                           128.45                             │
├────────────────────────────────────────────────────────────────────────┤
│ ✔ done · 0.4s · exit 0                                                │
└────────────────────────────────────────────────────────────────────────┘
```

### Node Hierarchy

1. **Card Container (`omp.tool.powershell`)**:
   - `title`: `powershell` or `pwsh`
   - `subtitle`: Extracted from `params.i` intent string or truncated command
   - `badge`: Active engine badge (e.g. `pwsh 7.6.9` or `PS 5.1.26100`)

2. **Command Node (`omp.tool.powershell.command`)**:
   - Semantic code block with language set to `powershell`.
   - Clamped preview: Displays up to 12 lines or 900 characters during call inspection with full script available on expansion.

3. **Output Node (`omp.tool.powershell.output`)**:
   - Follow-scrolled terminal text view.
   - Live updates during execution via `onChunk` and `onUpdate`.
   - Distinct error stream formatting when standard error is captured.

4. **Footer Node (`omp.run.foot` & `omp.run.time`)**:
   - Displays execution tone:
     - `running`: Pulsing / active status indicator while process runs.
     - `done`: Green checkmark on exit code 0.
     - `failed`: Red failure indicator with non-zero exit code.
     - `timed-out`: Yellow warning with timeout duration.
     - `cancelled`: Abort indicator if the user cancelled the turn.
   - Live elapsed timer in seconds (e.g., `1.2s`).

---

## ANSI Terminal TUI Renderer

When running in standard terminal emulators without Tern Surface Protocol support, `omp-powershell` provides a clean ANSI card renderer:

### Call Rendering (`renderCall`)

```text
╭── powershell ──────────────────────────────────────────────────────────╮
│ PS> Get-Service -Name '*wsl*'                                          │
╰────────────────────────────────────────────────────────────────────────╯
```

- Prominently displays the `PS>` prompt styling.
- Highlights intent when provided via `params.i`.
- Wraps cleanly to terminal boundaries.

### Result Rendering (`renderResult`)

```text
╭── powershell · 0.4s ───────────────────────────────────────────────────╮
│ Status   Name               DisplayName                                │
│ ------   ----               -----------                                │
│ Running  WslService         Windows Subsystem for Linux Service        │
│                                                                        │
│ ✔ exit 0                                                               │
╰────────────────────────────────────────────────────────────────────────╯
```

- Truncates long outputs with clean tail preservation (shows the initial output and the final lines with `[… N lines omitted …]` notice).
- Formats elapsed execution time cleanly (`0.2s`, `4.5s`).
- Highlights exit codes in green (`✔ exit 0`) or red (`✘ exit 1`).

---

## Bash Interception Hooks

LLMs frequently attempt to run PowerShell commands by wrapping them in the `bash` tool:

```json
{
  "command": "powershell.exe -NoProfile -Command \"Get-Process\""
}
```

This causes quoting conflicts, breaks argument limits, and strips color/structure.

### Interception Mechanics

The `tool_call` hook inspects incoming tool calls:
1. Detects calls targeting `bash` or `wsl_bash`.
2. Evaluates the command against regex patterns matching:
   - `powershell(\.exe)?`
   - `pwsh(\.exe)?`
3. Extracts flags (`-Command`, `-c`, `-EncodedCommand`) and isolates the inner script block.
4. Rewrites the output or attaches a high-visibility guidance note to the response:
   > *Notice: The native 'powershell' and 'pwsh' tools are available in this session. Instead of wrapping PowerShell commands inside bash (e.g. powershell.exe -Command "..."), call the 'powershell' tool directly with your script in the 'command' argument to avoid quoting issues, preserve exit codes, and enable native streaming.*

### System Context Injection

On Windows workstations, the `before_agent_start` hook automatically injects PowerShell rules into the agent's system prompt:
- Directs agents to use `powershell` for Windows management, registry access, service inspection, and .NET diagnostics.
- Provides syntax patterns for `powershell` tool parameters.

---

## Interactive Slash Commands

`omp-powershell` registers the `/powershell` and `/ps` slash commands for interactive user sessions.

### Engine Inspection Mode

Running `/ps` without arguments inspects the environment and reports all detected engines:

```text
PowerShell Engine Status:
• Core (pwsh.exe): v7.6.9 at C:\Program Files\PowerShell\7\pwsh.exe
• Desktop (powershell.exe): v5.1.26100.2161 at C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
Active Default: Core (v7.6.9)
Execution Policy: Bypass
Piped Stdin: Enabled
UTF-8 Output Encoding: Enabled
```

### Direct Execution Mode

Running `/ps <command>` executes the command immediately and prints the result into the chat session:

```text
/ps Test-Path 'C:\Program Files'
True
```

---

## Process Lifecycle and Error Handling

| Scenario | Behavior | Exit Code | Result |
|---|---|---|---|
| **Clean Exit** | Process exits naturally with code 0. | `0` | Returns stdout string. |
| **Non-Zero Exit** | Process exits with error status (e.g. cmdlet error). | Non-zero (`1`–`255`) | Returns error description with stderr and stdout. |
| **Timeout Exceeded** | Execution exceeds `timeout` seconds. | `SIGTERM` / `SIGKILL` | Process terminated; returns timeout message with elapsed time. |
| **User Abort** | Agent turn cancelled via AbortController signal. | Abort | Child process immediately sent `SIGINT`/`SIGKILL`; returns cancellation status. |
| **Executable Not Found** | Engine missing or invalid `customPath`. | ENOENT | Clean configuration error advising installation of PowerShell Core or verification of path. |
