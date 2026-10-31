import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/**
 * Regex to detect PowerShell invocations wrapped inside bash commands.
 * Examples:
 * - powershell.exe -NoProfile -Command "Get-Process"
 * - pwsh -Command 'Get-Service'
 * - powershell -c "..."
 */
const POWERSHELL_BASH_PATTERN = /(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+.*?(?:-Command|-c)\s+("[\s\S]*"|'[\s\S]*'|.+)$/i;

const POWERSHELL_DIRECT_PATTERN = /(?:^|[;&|\n]\s*)(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i;

export function extractPowerShellInnerCommand(bashCommand: string): string | undefined {
  const match = bashCommand.match(POWERSHELL_BASH_PATTERN);
  if (!match || !match[1]) return undefined;

  let inner = match[1].trim();
  // Strip surrounding quotes if present
  if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
    inner = inner.slice(1, -1);
    // Unescape inner escaped quotes if any
    inner = inner.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return inner;
}

export function registerPowerShellToolCallHooks(pi: ExtensionAPI) {
  // 1. Intercept bash tool calls that run PowerShell
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;

    const rawInput = event.input;
    if (!rawInput || typeof rawInput !== "object" || !("command" in rawInput)) return;

    const cmd = rawInput.command;
    if (typeof cmd !== "string") return;

    if (POWERSHELL_DIRECT_PATTERN.test(cmd)) {
      const extracted = extractPowerShellInnerCommand(cmd);
      const innerNotice = extracted
        ? ` You can run this directly with powershell(command: ${JSON.stringify(extracted)}).`
        : "";

      return {
        additionalContext:
          `Notice: The native 'powershell' and 'pwsh' tools are available in this session. Instead of wrapping PowerShell commands inside bash (which introduces subshell overhead and fragile quote escaping), call the 'powershell' tool directly.${innerNotice}`,
      };
    }
  });

  // 2. Guide model on agent start if running on Windows
  if (process.platform === "win32") {
    pi.on("before_agent_start", async (_event) => {
      return {
        additionalContext:
          "PowerShell Available: When executing PowerShell cmdlets or Windows administration commands, use the native 'powershell' (or 'pwsh') tool instead of running `powershell.exe -Command ...` via bash.",
      };
    });
  }
}
