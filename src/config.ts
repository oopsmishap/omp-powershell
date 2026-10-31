import * as fs from "node:fs";
import * as path from "node:path";

export interface PowerShellConfig {
  /**
   * Preferred PowerShell edition:
   * - "auto": prefer PowerShell Core (pwsh.exe 7+) if available, fallback to Windows PowerShell (powershell.exe)
   * - "core": require PowerShell Core (pwsh.exe)
   * - "desktop": require Windows PowerShell (powershell.exe)
   */
  edition: "auto" | "core" | "desktop";

  /** Custom executable path if specified */
  customPath?: string;

  /** Execution policy parameter (default: "Bypass") */
  executionPolicy: string;

  /** Skip loading profiles (default: true) */
  noProfile: boolean;

  /** Run non-interactively without prompt (default: true) */
  nonInteractive: boolean;

  /** Default timeout in seconds (default: 300) */
  defaultTimeout: number;
}

export const DEFAULT_CONFIG: PowerShellConfig = {
  edition: "auto",
  executionPolicy: "Bypass",
  noProfile: true,
  nonInteractive: true,
  defaultTimeout: 300,
};

export function loadPowerShellConfig(cwd?: string): PowerShellConfig {
  const config: PowerShellConfig = { ...DEFAULT_CONFIG };

  // 1. Load config file from project root or user home
  const userProfile = process.env.USERPROFILE || process.env.HOME || "";
  const candidates: string[] = [];

  if (cwd) {
    candidates.push(path.join(cwd, ".omp", "powershell.json"));
  }
  candidates.push(path.join(process.cwd(), ".omp", "powershell.json"));
  if (userProfile) {
    candidates.push(path.join(userProfile, ".omp", "powershell.json"));
  }

  for (const cfgPath of candidates) {
    if (fs.existsSync(cfgPath)) {
      try {
        const raw = fs.readFileSync(cfgPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.edition === "core" || parsed.edition === "desktop" || parsed.edition === "auto") {
            config.edition = parsed.edition;
          }
          if (typeof parsed.customPath === "string" && parsed.customPath.trim()) {
            config.customPath = parsed.customPath.trim();
          }
          if (typeof parsed.executionPolicy === "string" && parsed.executionPolicy.trim()) {
            config.executionPolicy = parsed.executionPolicy.trim();
          }
          if (typeof parsed.noProfile === "boolean") {
            config.noProfile = parsed.noProfile;
          }
          if (typeof parsed.nonInteractive === "boolean") {
            config.nonInteractive = parsed.nonInteractive;
          }
          if (typeof parsed.defaultTimeout === "number" && parsed.defaultTimeout > 0) {
            config.defaultTimeout = parsed.defaultTimeout;
          }
          break;
        }
      } catch {
        // ignore invalid json
      }
    }
  }

  // 2. Environment variables override config file
  const envEdition = process.env.OMP_POWERSHELL_EDITION?.toLowerCase();
  if (envEdition === "core" || envEdition === "desktop" || envEdition === "auto") {
    config.edition = envEdition;
  }

  const envPath = process.env.OMP_POWERSHELL_PATH;
  if (envPath && envPath.trim()) {
    config.customPath = envPath.trim();
  }

  const envPolicy = process.env.OMP_POWERSHELL_EXECUTION_POLICY;
  if (envPolicy && envPolicy.trim()) {
    config.executionPolicy = envPolicy.trim();
  }

  const envTimeout = process.env.OMP_POWERSHELL_TIMEOUT;
  if (envTimeout) {
    const num = parseInt(envTimeout, 10);
    if (!isNaN(num) && num > 0) {
      config.defaultTimeout = num;
    }
  }

  return config;
}
