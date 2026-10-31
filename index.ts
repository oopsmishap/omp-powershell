import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerPowerShellTool } from "./src/tools/powershell";
import { registerPowerShellCommand } from "./src/commands/powershell-command";
import { registerPowerShellToolCallHooks } from "./src/hooks";
import { resolvePowerShellEngine } from "./src/powershell";
import { loadPowerShellConfig } from "./src/config";

export default function powershellPlugin(pi: ExtensionAPI) {
  pi.setLabel("PowerShell");

  // 1. Register tools (powershell and pwsh)
  registerPowerShellTool(pi);

  // 2. Register slash commands (/powershell and /ps)
  registerPowerShellCommand(pi);

  // 3. Register tool_call and before_agent_start hooks
  registerPowerShellToolCallHooks(pi);

  // 4. Session start notification
  pi.on("session_start", async (_event, ctx) => {
    const config = loadPowerShellConfig(ctx.cwd);
    const engine = resolvePowerShellEngine(config.edition, config.customPath, ctx.cwd);
    ctx.ui.notify(`PowerShell Integration active (${engine.name})`, "info");
  });
}
