import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPowerShellConfig, type PowerShellConfig } from "./config";

export interface PowerShellEngineInfo {
  edition: "core" | "desktop";
  name: string;
  executable: string;
  version: string;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface PowerShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  wallTimeMs: number;
  timedOut: boolean;
  cancelled: boolean;
  engine: PowerShellEngineInfo;
}

export interface PowerShellExecutionOptions {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  edition?: "auto" | "core" | "desktop";
  customPath?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: { stdout?: string; stderr?: string }) => void;
}

let cachedEngines: PowerShellEngineInfo[] | null = null;

function probeVersion(executable: string): string | null {
  try {
    const res = spawnSync(
      executable,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "$PSVersionTable.PSVersion.ToString()"],
      {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 5000,
      },
    );
    if (res.stdout && typeof res.stdout === "string") {
      const ver = res.stdout.trim().split(/\r?\n/)[0]?.trim();
      if (ver && /^\d+(\.\d+)*/.test(ver)) {
        return ver;
      }
    }
  } catch {
    // probe failed
  }
  return null;
}

function findExecutable(candidateNames: string[]): string | null {
  for (const name of candidateNames) {
    if (path.isAbsolute(name)) {
      if (fs.existsSync(name)) return name;
      continue;
    }
    try {
      const res = spawnSync("where.exe", [name], { encoding: "utf-8", windowsHide: true, timeout: 3000 });
      if (res.stdout) {
        const lines = res.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 0 && fs.existsSync(lines[0]!)) {
          return lines[0]!;
        }
      }
    } catch {
      // where.exe failed or not found
    }
  }
  return null;
}

export function detectPowerShellEngines(forceRefresh = false): PowerShellEngineInfo[] {
  if (cachedEngines && !forceRefresh) {
    return cachedEngines;
  }

  const engines: PowerShellEngineInfo[] = [];

  // 1. Detect PowerShell Core (pwsh)
  const pwshCandidates = [
    "pwsh.exe",
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\PowerShell\\pwsh.exe"),
  ];
  const pwshPath = findExecutable(pwshCandidates);
  if (pwshPath) {
    const version = probeVersion(pwshPath) || "7.x";
    engines.push({
      edition: "core",
      name: `PowerShell Core (${version})`,
      executable: pwshPath,
      version,
      isDefault: true,
      isAvailable: true,
    });
  }

  // 2. Detect Windows PowerShell (powershell.exe)
  const psCandidates = [
    "powershell.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe",
  ];
  const psPath = findExecutable(psCandidates);
  if (psPath) {
    const version = probeVersion(psPath) || "5.1";
    engines.push({
      edition: "desktop",
      name: `Windows PowerShell (${version})`,
      executable: psPath,
      version,
      isDefault: engines.length === 0,
      isAvailable: true,
    });
  }

  cachedEngines = engines;
  return engines;
}

export function resolvePowerShellEngine(
  preferredEdition?: "auto" | "core" | "desktop",
  customPath?: string,
  cwd?: string,
): PowerShellEngineInfo {
  const config = loadPowerShellConfig(cwd);
  const edition = preferredEdition || config.edition || "auto";
  const explicitPath = customPath || config.customPath;

  // Custom path specified
  if (explicitPath) {
    const version = probeVersion(explicitPath) || "unknown";
    const isCore = explicitPath.toLowerCase().includes("pwsh") || version.startsWith("7") || version.startsWith("6");
    return {
      edition: isCore ? "core" : "desktop",
      name: `Custom PowerShell (${version})`,
      executable: explicitPath,
      version,
      isDefault: true,
      isAvailable: true,
    };
  }

  const engines = detectPowerShellEngines();

  if (edition === "core") {
    const core = engines.find(e => e.edition === "core");
    if (core) return core;
  } else if (edition === "desktop") {
    const desktop = engines.find(e => e.edition === "desktop");
    if (desktop) return desktop;
  }

  // Default: prefer core if available, then desktop
  const core = engines.find(e => e.edition === "core");
  if (core) return core;

  const desktop = engines.find(e => e.edition === "desktop");
  if (desktop) return desktop;

  // Fallback to powershell.exe if detection somehow returned empty
  return {
    edition: "desktop",
    name: "Windows PowerShell",
    executable: "powershell.exe",
    version: "5.1",
    isDefault: true,
    isAvailable: true,
  };
}

/** Escapes a string for inclusion in PowerShell single-quoted string literal '...' */
export function escapePowerShellString(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

export async function executePowerShell(
  options: PowerShellExecutionOptions,
): Promise<PowerShellExecutionResult> {
  const { promise, resolve, reject } = Promise.withResolvers<PowerShellExecutionResult>();
  const config = loadPowerShellConfig(options.cwd);
  const engine = resolvePowerShellEngine(options.edition, options.customPath, options.cwd);

  const timeoutMs = (options.timeout ?? config.defaultTimeout) * 1000;
  const startTime = Date.now();

  let script = "";

  // UTF-8 output encoding setup so unicode and tables print accurately
  script += "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n";
  script += "$OutputEncoding = [System.Text.Encoding]::UTF8\n";

  // If cwd is specified, set location
  if (options.cwd) {
    script += `Set-Location -LiteralPath ${escapePowerShellString(options.cwd)} 2>$null\n`;
  }

  // If environment variables are specified, set them
  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      script += `$env:${k} = ${escapePowerShellString(v)}\n`;
    }
  }

  script += options.command + "\n";

  const args: string[] = [];
  if (config.noProfile) args.push("-NoProfile");
  if (config.nonInteractive) args.push("-NonInteractive");
  if (config.executionPolicy) args.push("-ExecutionPolicy", config.executionPolicy);
  args.push("-Command", "-");

  const child = spawn(engine.executable, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd && fs.existsSync(options.cwd) ? options.cwd : undefined,
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let cancelled = false;

  let timeoutTimer: NodeJS.Timeout | undefined;
  if (timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, timeoutMs);
  }

  const abortHandler = () => {
    cancelled = true;
    try {
      child.kill();
    } catch {}
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortHandler();
    } else {
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  child.stdout.on("data", (chunk: Buffer | string) => {
    const str = chunk.toString();
    stdout += str;
    options.onChunk?.({ stdout: str });
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    const str = chunk.toString();
    stderr += str;
    options.onChunk?.({ stderr: str });
  });

  child.on("close", (code) => {
    clearTimeout(timeoutTimer);
    if (options.signal) {
      options.signal.removeEventListener("abort", abortHandler);
    }
    const wallTimeMs = Date.now() - startTime;
    resolve({
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode: code ?? (timedOut ? 124 : cancelled ? 130 : 0),
      wallTimeMs,
      timedOut,
      cancelled,
      engine,
    });
  });

  child.on("error", (err) => {
    clearTimeout(timeoutTimer);
    if (options.signal) {
      options.signal.removeEventListener("abort", abortHandler);
    }
    reject(err);
  });

  try {
    child.stdin.write(script, "utf-8");
    child.stdin.end();
  } catch (err) {
    clearTimeout(timeoutTimer);
    reject(err);
  }

  return promise;
}
