import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { detectPowerShellEngines, resolvePowerShellEngine, executePowerShell } from "../powershell";
import { loadPowerShellConfig } from "../config";

export function registerPowerShellCommand(pi: ExtensionAPI) {
  const handler = async (args: string, ctx: ExtensionCommandContext) => {
    const config = loadPowerShellConfig(ctx.cwd);
    const engines = detectPowerShellEngines(true);
    const active = resolvePowerShellEngine(config.edition, config.customPath, ctx.cwd);

    const trimmedArgs = args.trim();

    // If no arguments, show discovery and configuration status
    if (!trimmedArgs) {
      const lines = [
        `PowerShell Integration Status`,
        `Active engine: ${active.name} (${active.executable})`,
        `Configured edition: ${config.edition}`,
        `Installed engines (${engines.length}):`,
      ];

      for (const e of engines) {
        const star = e.executable === active.executable ? " * " : "   ";
        lines.push(`${star}${e.name} [${e.edition}]: ${e.executable}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }

    // Execute command passed to slash command
    ctx.ui.notify(`Running: ${trimmedArgs} (${active.name})…`, "info");

    try {
      const res = await executePowerShell({
        command: trimmedArgs,
        cwd: ctx.cwd,
      });

      const output = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
      const status = res.exitCode === 0 ? "success" : "error";
      const timeStr = `${(res.wallTimeMs / 1000).toFixed(2)}s`;

      if (output) {
        ctx.ui.notify(`[${timeStr}] ${output}`, status);
      } else {
        ctx.ui.notify(`[${timeStr}] (no output - exit code ${res.exitCode})`, status);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`PowerShell error: ${msg}`, "error");
    }
  };

  pi.registerCommand("powershell", {
    description: "Inspect PowerShell engines or execute a PowerShell command (/powershell [command])",
    handler,
  });

  pi.registerCommand("ps", {
    description: "Alias for /powershell",
    handler,
  });
}
