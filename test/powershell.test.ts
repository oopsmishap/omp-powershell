import { describe, it, expect } from "bun:test";
import { loadPowerShellConfig, DEFAULT_CONFIG } from "../src/config";
import {
  detectPowerShellEngines,
  resolvePowerShellEngine,
  executePowerShell,
  escapePowerShellString,
} from "../src/powershell";
import { powershellRenderer, type Theme } from "../src/render";
import { extractPowerShellInnerCommand, registerPowerShellToolCallHooks } from "../src/hooks";
import { registerPowerShellTool } from "../src/tools/powershell";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// Mock Theme for ANSI renderer testing
const mockTheme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `[bold]${text}[/bold]`,
  format: { bracketLeft: "[", bracketRight: "]" },
  sep: { dot: " · " },
};

describe("PowerShell Configuration", () => {
  it("loads default configuration", () => {
    const config = loadPowerShellConfig();
    expect(config.edition).toBe("auto");
    expect(config.executionPolicy).toBe("Bypass");
    expect(config.noProfile).toBe(true);
    expect(config.nonInteractive).toBe(true);
    expect(config.defaultTimeout).toBe(300);
  });

  it("escapes single quotes correctly in escapePowerShellString", () => {
    expect(escapePowerShellString("simple")).toBe("'simple'");
    expect(escapePowerShellString("C:\\path with spaces")).toBe("'C:\\path with spaces'");
    expect(escapePowerShellString("it's a test")).toBe("'it''s a test'");
    expect(escapePowerShellString("nested 'quotes' here")).toBe("'nested ''quotes'' here'");
  });
});

describe("PowerShell Engine Detection", () => {
  it("detects available PowerShell engines", () => {
    const engines = detectPowerShellEngines();
    expect(engines.length).toBeGreaterThan(0);

    const hasCore = engines.some(e => e.edition === "core");
    const hasDesktop = engines.some(e => e.edition === "desktop");
    expect(hasCore || hasDesktop).toBe(true);
  });

  it("resolves default engine based on edition preference", () => {
    const defaultEngine = resolvePowerShellEngine("auto");
    expect(defaultEngine).toBeDefined();
    expect(defaultEngine.executable).toBeTruthy();
    expect(defaultEngine.version).toBeTruthy();

    const desktopEngine = resolvePowerShellEngine("desktop");
    expect(desktopEngine.edition).toBe("desktop");

    const coreEngine = resolvePowerShellEngine("core");
    expect(coreEngine.edition).toBe("core");
  });

  it("resolves custom executable path", () => {
    const custom = resolvePowerShellEngine("auto", "C:\\Custom\\pwsh.exe");
    expect(custom.executable).toBe("C:\\Custom\\pwsh.exe");
    expect(custom.edition).toBe("core");
  });
});

describe("PowerShell Execution", () => {
  it("executes basic PowerShell expression", async () => {
    const res = await executePowerShell({
      command: "$a = 21; $b = 2; $a * $b",
    });

    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(res.cancelled).toBe(false);
    expect(res.stdout).toBe("42");
    expect(res.wallTimeMs).toBeGreaterThan(0);
  });

  it("executes multi-line pipeline without escaping errors", async () => {
    const script = `
$items = 1..5
$items | ForEach-Object { $_ * 10 }
`;
    const res = await executePowerShell({ command: script });
    expect(res.exitCode).toBe(0);
    const lines = res.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    expect(lines).toEqual(["10", "20", "30", "40", "50"]);
  });

  it("executes process query matching user example", async () => {
    const command = "Get-Process -Name bun -ErrorAction SilentlyContinue | Select-Object Id, ProcessName";
    const res = await executePowerShell({ command });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("ProcessName");
  });

  it("passes environment variables to PowerShell session", async () => {
    const res = await executePowerShell({
      command: "Write-Output $env:OMP_PS_TEST_KEY",
      env: { OMP_PS_TEST_KEY: "PowerShellNativeWorks!" },
    });

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("PowerShellNativeWorks!");
  });

  it("respects working directory", async () => {
    const res = await executePowerShell({
      command: "(Get-Location).Path",
      cwd: "C:\\Windows",
    });

    expect(res.exitCode).toBe(0);
    expect(res.stdout.toLowerCase()).toBe("c:\\windows");
  });

  it("handles live streaming via onChunk", async () => {
    let streamed = "";
    const res = await executePowerShell({
      command: "Write-Output 'stream-chunk-1'; Write-Output 'stream-chunk-2'",
      onChunk: (chunk) => {
        if (chunk.stdout) streamed += chunk.stdout;
      },
    });

    expect(res.exitCode).toBe(0);
    expect(streamed).toContain("stream-chunk-1");
    expect(streamed).toContain("stream-chunk-2");
  });

  it("captures non-zero exit codes and errors", async () => {
    const res = await executePowerShell({
      command: "exit 42",
    });

    expect(res.exitCode).toBe(42);
  });

  it("captures stderr output", async () => {
    const res = await executePowerShell({
      command: "[Console]::Error.WriteLine('error text here')",
    });

    expect(res.stderr).toContain("error text here");
  });
});

describe("Native TUI and Tern Surface Protocol (TSP) Renderers", () => {
  const sampleEngine = {
    edition: "core" as const,
    name: "PowerShell Core (7.6.9)",
    executable: "pwsh.exe",
    version: "7.6.9",
    isDefault: true,
    isAvailable: true,
  };

  it("describeCall creates valid TSP NativeToolView with code input and elapsed time", () => {
    const view = powershellRenderer.describeCall(
      { command: "Get-Process bun", i: "Checking bun process" },
      { executionStarted: true, elapsedMs: 150 },
    );

    expect(view.tool?.title).toBe("PowerShell");
    expect(view.tool?.target).toBe("Checking bun process");
    expect(view.tool?.command).toBe("Get-Process bun");
    expect(view.body?.length).toBe(1);

    const runNode = view.body![0];
    expect(runNode.k).toBe("col");
    expect(runNode.c?.length).toBe(2); // input + foot
  });

  it("describeResult creates valid TSP NativeToolView with output and state", () => {
    const view = powershellRenderer.describeResult(
      {
        content: [{ type: "text", text: "Id ProcessName\n-- -----------" }],
        details: {
          command: "Get-Process bun",
          stdout: "Id ProcessName\n-- -----------",
          exitCode: 0,
          wallTimeMs: 170,
          engine: sampleEngine,
        },
      },
      { isPartial: false },
      { command: "Get-Process bun" },
    );

    expect(view.tool?.title).toBe("PowerShell");
    expect(view.tool?.badges?.[0]?.text).toContain("pwsh 7.6.9");
    expect(view.body?.length).toBe(1);

    const runNode = view.body![0];
    expect(runNode.k).toBe("col");
    // input + output + foot
    expect(runNode.c?.length).toBe(3);
  });

  it("renderCall returns ANSI component with PS> prefix and title", () => {
    const comp = powershellRenderer.renderCall(
      { command: "Get-Process bun", edition: "core" },
      { expanded: false },
      mockTheme,
    );

    const rows = comp.render(80);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toContain("PowerShell");
    expect(rows[0]).toContain("pwsh");
    expect(rows[1]).toContain("PS>");
    expect(rows[1]).toContain("Get-Process bun");
  });

  it("renderResult returns ANSI component with success symbol and output", () => {
    const comp = powershellRenderer.renderResult(
      {
        content: [{ type: "text", text: "30736 bun" }],
        details: {
          command: "Get-Process bun",
          stdout: "30736 bun",
          exitCode: 0,
          wallTimeMs: 170,
          engine: sampleEngine,
        },
      },
      { expanded: false },
      mockTheme,
      { command: "Get-Process bun" },
    );

    const rows = comp.render(80);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]).toContain("✔");
    expect(rows[0]).toContain("PowerShell");
    expect(rows[0]).toContain("0.17s");
    expect(rows.some(r => r.includes("30736 bun"))).toBe(true);
  });

  it("renderResult returns error symbol on non-zero exit code", () => {
    const comp = powershellRenderer.renderResult(
      {
        content: [{ type: "text", text: "Command failed" }],
        details: {
          command: "invalid-cmd",
          stderr: "Command failed",
          exitCode: 1,
          wallTimeMs: 100,
          engine: sampleEngine,
        },
        isError: true,
      },
      { expanded: false },
      mockTheme,
      { command: "invalid-cmd" },
    );

    const rows = comp.render(80);
    expect(rows[0]).toContain("✘");
  });
});

describe("Hooks and Bash Interception", () => {
  it("extracts inner PowerShell command from bash command string", () => {
    const bash1 = 'powershell.exe -NoProfile -Command "Get-Process -Name bun | Select-Object Id"';
    expect(extractPowerShellInnerCommand(bash1)).toBe("Get-Process -Name bun | Select-Object Id");

    const bash2 = "pwsh -Command 'Get-Service sshd'";
    expect(extractPowerShellInnerCommand(bash2)).toBe("Get-Service sshd");

    const bash3 = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Write-Output \\"Hello\\""';
    expect(extractPowerShellInnerCommand(bash3)).toBe('Write-Output "Hello"');
  });

  type ToolCallHandler = (event: { toolName: string; input: Record<string, unknown> }) => Promise<{ additionalContext?: string } | undefined>;

  it("intercepts bash tool call and returns additionalContext notice", async () => {
    let toolCallHandler: ToolCallHandler | undefined;

    const mockPi = {
      on: (event: string, handler: ToolCallHandler) => {
        if (event === "tool_call") {
          toolCallHandler = handler;
        }
      },
    } as unknown as ExtensionAPI;

    registerPowerShellToolCallHooks(mockPi);
    expect(toolCallHandler).toBeDefined();

    const bashEvent = {
      toolName: "bash",
      input: {
        command: 'powershell.exe -NoProfile -Command "Get-Process -Name bun"',
      },
    };

    const res = await toolCallHandler!(bashEvent);
    expect(res).toBeDefined();
    expect(res?.additionalContext).toContain("The native 'powershell' and 'pwsh' tools are available");
    expect(res?.additionalContext).toContain("Get-Process -Name bun");
  });

  it("does not intercept non-powershell bash commands", async () => {
    let toolCallHandler: ToolCallHandler | undefined;

    const mockPi = {
      on: (event: string, handler: ToolCallHandler) => {
        if (event === "tool_call") {
          toolCallHandler = handler;
        }
      },
    } as unknown as ExtensionAPI;

    registerPowerShellToolCallHooks(mockPi);

    const bashEvent = {
      toolName: "bash",
      input: {
        command: "ls -la",
      },
    };

    const res = await toolCallHandler!(bashEvent);
    expect(res).toBeUndefined();
  });
});

describe("Tool Registration & Card Deduplication", () => {
  it("registers powershell and pwsh tools with mergeCallAndResult: true and inline: true", () => {
    const registeredTools: any[] = [];
    const chain = () => {
      const obj: any = {};
      obj.describe = () => obj;
      obj.optional = () => obj;
      return obj;
    };
    const mockZod: any = {
      object: chain,
      string: chain,
      number: chain,
      enum: chain,
      record: chain,
    };
    const mockPi = {
      zod: mockZod,
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as unknown as ExtensionAPI;
    registerPowerShellTool(mockPi);

    expect(registeredTools.length).toBe(2);

    const psTool = registeredTools.find((t) => t.name === "powershell");
    expect(psTool).toBeDefined();
    expect(psTool.mergeCallAndResult).toBe(true);
    expect(psTool.inline).toBe(true);
    expect(typeof psTool.describeCall).toBe("function");
    expect(typeof psTool.describeResult).toBe("function");

    const pwshTool = registeredTools.find((t) => t.name === "pwsh");
    expect(pwshTool).toBeDefined();
    expect(pwshTool.mergeCallAndResult).toBe(true);
    expect(pwshTool.inline).toBe(true);
    expect(typeof pwshTool.describeCall).toBe("function");
    expect(typeof pwshTool.describeResult).toBe("function");
  });
});
