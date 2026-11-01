import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { executePowerShell } from "../powershell";
import { powershellRenderer, type PowerShellDetails } from "../render";

interface PowerShellToolParams {
  command: string;
  cwd?: string;
  edition?: "auto" | "core" | "desktop";
  env?: Record<string, string>;
  timeout?: number;
  i?: string;
}

interface UpdateChunk {
  content: Array<{ type: "text"; text: string }>;
  details?: PowerShellDetails;
}

async function runPowerShellTool(
  params: PowerShellToolParams,
  signal: AbortSignal | undefined,
  onUpdate: ((chunk: UpdateChunk) => void) | undefined,
  ctxCwd: string,
) {
  if (signal?.aborted) {
    return {
      content: [{ type: "text", text: "Execution cancelled" }],
      details: { cancelled: true },
      isError: true,
    };
  }

  const targetCwd = params.cwd || ctxCwd;
  const startTime = Date.now();
  let liveStdout = "";
  let liveStderr = "";

  try {
    const result = await executePowerShell({
      command: params.command,
      cwd: targetCwd,
      env: params.env,
      edition: params.edition,
      timeout: params.timeout,
      signal,
      onChunk: (chunk) => {
        if (chunk.stdout) liveStdout += chunk.stdout;
        if (chunk.stderr) liveStderr += chunk.stderr;

        onUpdate?.({
          content: [
            {
              type: "text",
              text: liveStdout + (liveStderr ? `\n[stderr]\n${liveStderr}` : "") || "Running PowerShell command…",
            },
          ],
          details: {
            command: params.command,
            cwd: targetCwd,
            stdout: liveStdout,
            stderr: liveStderr,
            wallTimeMs: Date.now() - startTime,
          },
        });
      },
    });

    const stdout = result.stdout;
    const stderr = result.stderr;
    let modelText = stdout;

    if (stderr) {
      modelText = modelText ? `${modelText}\n[stderr]\n${stderr}` : `[stderr]\n${stderr}`;
    }
    if (result.timedOut) {
      modelText = modelText ? `${modelText}\nCommand timed out` : "Command timed out";
    } else if (result.cancelled) {
      modelText = modelText ? `${modelText}\nCommand cancelled` : "Command cancelled";
    } else if (result.exitCode !== 0) {
      modelText = modelText ? `${modelText}\nCommand exited with code ${result.exitCode}` : `Command exited with code ${result.exitCode}`;
    }

    if (!modelText) {
      modelText = "(no output)";
    }

    const details: PowerShellDetails = {
      command: params.command,
      cwd: targetCwd,
      stdout,
      stderr,
      exitCode: result.exitCode,
      wallTimeMs: result.wallTimeMs,
      timedOut: result.timedOut,
      cancelled: result.cancelled,
      engine: result.engine,
    };

    const isError = result.exitCode !== 0 || result.timedOut || result.cancelled;

    return {
      content: [{ type: "text", text: modelText }],
      details,
      isError,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `PowerShell execution failed: ${errorMsg}` }],
      details: {
        command: params.command,
        cwd: targetCwd,
        error: errorMsg,
      },
      isError: true,
    };
  }
}

export function registerPowerShellTool(pi: ExtensionAPI) {
  const z = pi.zod;

  const powershellToolDef = {
    name: "powershell",
    label: "PowerShell",
    description:
      "Execute PowerShell scripts and commands directly on Windows (supporting both modern PowerShell 7+ pwsh and Windows PowerShell 5.1). Preserves syntax and pipelines without bash nesting, quote escaping, or subshell overhead.",
    parameters: z.object({
      command: z.string().describe("PowerShell script or command line to execute"),
      cwd: z.string().optional().describe("Working directory for execution. Defaults to current workspace directory"),
      edition: z
        .enum(["auto", "core", "desktop"])
        .optional()
        .describe("PowerShell edition to target: 'auto' (prefers pwsh 7+, falls back to powershell 5.1), 'core' (pwsh), or 'desktop' (powershell.exe)"),
      env: z.record(z.string()).optional().describe("Environment variables to define for this execution"),
      timeout: z.number().optional().describe("Execution timeout in seconds (default: 300)"),
      i: z.string().optional().describe("Present-participle intent summary (e.g. 'Querying running processes')"),
    }),
    mergeCallAndResult: true,
    inline: true,
    async execute(
      _toolCallId: string,
      params: PowerShellToolParams,
      signal: AbortSignal | undefined,
      onUpdate: ((chunk: UpdateChunk) => void) | undefined,
      ctx: { cwd: string },
    ) {
      return runPowerShellTool(params, signal, onUpdate, ctx.cwd);
    },
    describeCall: powershellRenderer.describeCall,
    describeResult: powershellRenderer.describeResult,
    renderCall: powershellRenderer.renderCall,
    renderResult: powershellRenderer.renderResult,
  } as unknown as Parameters<ExtensionAPI["registerTool"]>[0];

  pi.registerTool(powershellToolDef);

  // Register pwsh alias tool with edition pinned to core
  const pwshToolDef = {
    name: "pwsh",
    label: "PowerShell Core",
    description:
      "Execute modern PowerShell 7+ (pwsh) scripts and commands directly on Windows. Preserves syntax and pipelines without bash nesting or quote escaping.",
    parameters: z.object({
      command: z.string().describe("PowerShell script or command line to execute"),
      cwd: z.string().optional().describe("Working directory for execution. Defaults to current workspace directory"),
      env: z.record(z.string()).optional().describe("Environment variables to define for this execution"),
      timeout: z.number().optional().describe("Execution timeout in seconds (default: 300)"),
      i: z.string().optional().describe("Present-participle intent summary (e.g. 'Querying running processes')"),
    }),
    mergeCallAndResult: true,
    inline: true,
    async execute(
      _toolCallId: string,
      params: Omit<PowerShellToolParams, "edition">,
      signal: AbortSignal | undefined,
      onUpdate: ((chunk: UpdateChunk) => void) | undefined,
      ctx: { cwd: string },
    ) {
      return runPowerShellTool({ ...params, edition: "core" }, signal, onUpdate, ctx.cwd);
    },
    describeCall: powershellRenderer.describeCall,
    describeResult: powershellRenderer.describeResult,
    renderCall: powershellRenderer.renderCall,
    renderResult: powershellRenderer.renderResult,
  } as unknown as Parameters<ExtensionAPI["registerTool"]>[0];

  pi.registerTool(pwshToolDef);
}
