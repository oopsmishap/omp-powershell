# Development

`omp-powershell` is built with TypeScript and [Bun](https://bun.sh).

---

## Setup and Checks

Clone the repository and install dependencies:

```bash
git clone https://github.com/oopsmishap/omp-powershell.git
cd omp-powershell
bun install
```

Run typechecking and unit test suite:

```bash
bun run typecheck
bun test
```

Link the local build directly into `oh-my-pi` for live development:

```bash
omp plugin link .
```

Verify plugin registration and health:

```bash
omp plugin list
omp plugin doctor omp-powershell
```

---

## Project Structure

```text
omp-powershell/
├── assets/
│   ├── header-dark.svg               # Vector banner for GitHub dark theme
│   └── header-light.svg              # Vector banner for GitHub light theme
├── docs/
│   ├── configuration.md              # Configuration options and file hierarchy
│   ├── development.md                # Development, architecture, and testing guide
│   ├── reference.md                  # Comprehensive tool, TSP, ANSI, and hook reference
│   └── troubleshooting.md            # Diagnosing common errors, encodings, and policies
├── rules/
│   └── powershell-native-tools.md    # Agent system prompt rules for native PowerShell
├── src/
│   ├── commands/
│   │   └── powershell-command.ts     # Slash commands (/powershell and /ps)
│   ├── tools/
│   │   └── powershell.ts             # Tool registrations (powershell and pwsh)
│   ├── config.ts                     # Configuration resolution & env var parsing
│   ├── hooks.ts                      # bash interception and agent context hooks
│   ├── powershell.ts                 # Discovery, probing, and piped stdin engine
│   └── render.ts                     # TSP native card & ANSI terminal renderers
├── test/
│   └── powershell.test.ts            # Unit and integration test suite
├── index.ts                          # Plugin entrypoint
├── package.json
└── tsconfig.json
```

---

## Architecture Overview

### 1. Engine Discovery and Probing (`src/powershell.ts`)

The detection subsystem finds both modern PowerShell 7+ (`pwsh.exe`) and legacy Windows PowerShell 5.1 (`powershell.exe`).
- Searches `PATH` and standard installation directories (`%ProgramFiles%\PowerShell\7`, `%SystemRoot%\System32\WindowsPowerShell\v1.0`).
- Probes detected binaries using `$PSVersionTable.PSVersion.ToString()` with a fast 3-second timeout.
- Caches detection results in memory so repeated tool calls avoid discovery overhead.

### 2. Piped Stdin Execution Pipeline (`src/powershell.ts`)

Spawns the target executable with arguments:
```text
-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -
```
- Injects a UTF-8 preamble (`[Console]::OutputEncoding = $OutputEncoding = UTF8`).
- Prepends `Set-Location -LiteralPath` if `cwd` is specified.
- Writes the script into child process `stdin` and closes the stream.
- Hooks `stdout` and `stderr` streams, emitting chunks in real time via `onChunk` and `onUpdate`.

### 3. Rendering Pipeline (`src/render.ts`)

Implements both UI rendering paths:
- **Tern Surface Protocol (TSP)**: `describeCall` and `describeResult` with `mergeCallAndResult: true`. Emits semantic nodes for code (`omp.tool.powershell.command`), scrollable output (`omp.tool.powershell.output`), status tones, and badges (`[pwsh 7.6.9]`).
- **ANSI Terminal Fallback**: Formats execution with cyan `PS>` prompt, duration timers, exit indicators (`✔ exit 0`, `✘ exit 1`), and tail truncation.

### 4. Hook Interception (`src/hooks.ts`)

Intercepts `tool_call` events targeting `bash`:
- Regex inspects commands starting with `powershell` or `pwsh`.
- Identifies script arguments passed via `-Command` or `-EncodedCommand`.
- Returns actionable guidance advising the agent to use the native `powershell` tool directly.

---

## Testing

The test suite in `test/powershell.test.ts` uses Bun's built-in test runner:

```bash
bun test
```

The 21 tests cover:
- Engine discovery and version table parsing.
- Configuration loading, precedence hierarchy, and environment variable overrides.
- Script execution, working directory changes, and environment variable injection.
- Real-time stdout and stderr chunk streaming.
- Error handling on non-zero exit codes.
- Timeout deadlines and process termination.
- Tern Surface Protocol (TSP) card rendering and ANSI formatting.
- Bash interception hooks and argument extraction.

---

## Release Process

1. Ensure all tests pass and types are clean:
   ```bash
   bun run typecheck
   bun test
   ```
2. Update version in `package.json` if bumping releases.
3. Commit changes and push to GitHub:
   ```bash
   git push origin master
   ```
4. Verify remote installation via `oh-my-pi`:
   ```bash
   omp plugin install github:oopsmishap/omp-powershell
   ```
