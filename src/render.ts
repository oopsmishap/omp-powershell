import type { PowerShellEngineInfo } from "./powershell";

// ═══════════════════════════════════════════════════════════════════════════
// Tern Surface Protocol (TSP) and TUI Renderers for PowerShell
// ═══════════════════════════════════════════════════════════════════════════

export type TspTone = "neutral" | "accent" | "info" | "success" | "warning" | "error" | "pending" | "muted" | "user";

export interface TspSpan {
  t: string;
  s?: string;
}

export type TspText = string | readonly TspSpan[];

export interface NativeNode {
  readonly k: string;
  readonly p?: Record<string, unknown>;
  readonly c?: readonly NativeNode[];
  readonly key?: string;
}

export interface NativeToolHead {
  readonly title?: TspText;
  readonly target?: TspText;
  readonly targetKind?: "command" | "path" | "pattern" | "query" | "text";
  readonly lang?: string;
  readonly command?: string;
  readonly meta?: readonly TspText[];
  readonly badges?: readonly { text: string; tone?: TspTone; title?: string }[];
  readonly note?: TspText;
  readonly exit?: number | null;
}

export interface NativeToolView {
  readonly tool?: NativeToolHead;
  readonly head?: TspText;
  readonly body?: readonly NativeNode[];
  readonly tone?: TspTone;
  readonly preview?: { lines: number } | { tail: number } | "none" | "children";
  readonly open?: boolean;
  readonly inline?: boolean;
}

export interface RenderOptions {
  expanded?: boolean;
  isPartial?: boolean;
  executionStarted?: boolean;
  elapsedMs?: number;
  cancelled?: boolean;
  spinnerFrame?: number;
}

export interface Component {
  render(width: number): readonly string[];
}

export interface Theme {
  fg(color: string, text: string): string;
  bold(text: string): string;
  format?: { bracketLeft: string; bracketRight: string };
  sep?: { dot: string };
}

export class TextComponent implements Component {
  constructor(private text: string) {}
  render(_width: number): readonly string[] {
    return this.text.split("\n");
  }
}

function span(t: string, s?: string): TspSpan {
  return s ? { t, s } : { t };
}

function node(k: string, p?: Record<string, unknown>, c?: readonly NativeNode[], key?: string): NativeNode {
  const n: Record<string, unknown> = { k };
  if (p !== undefined) n.p = p;
  if (c !== undefined) n.c = c;
  if (key !== undefined) n.key = key;
  return n as unknown as NativeNode;
}

function compact<T>(items: readonly (T | undefined | null | false)[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (item !== undefined && item !== null && item !== false) out.push(item);
  }
  return out;
}

const RUN_INPUT_PREVIEW_LINES = 8;
const RUN_OUTPUT_PREVIEW_LINES = 12;

export type RunState = "running" | "done" | "failed" | "cancelled" | "timed-out";

const RUN_STATE_META: Record<RunState, { word: string; tone: TspTone }> = {
  running: { word: "Running", tone: "pending" },
  done: { word: "Done", tone: "success" },
  failed: { word: "Failed", tone: "error" },
  cancelled: { word: "Cancelled", tone: "muted" },
  "timed-out": { word: "Timed out", tone: "warning" },
};

function runInput(source: string, p: { role: string; lang: string; wrap: boolean }): NativeNode {
  return node(
    "code",
    {
      text: source.trimEnd(),
      role: p.role,
      lang: p.lang,
      wrap: p.wrap,
      preview: { lines: RUN_INPUT_PREVIEW_LINES },
    },
    undefined,
    "input",
  );
}

function runOutput(output: string, p: { role: string; previewLines?: number; key?: string }): NativeNode {
  return node(
    "ansi",
    {
      text: output,
      role: p.role,
      follow: true,
      preview: { lines: p.previewLines ?? RUN_OUTPUT_PREVIEW_LINES },
    },
    undefined,
    p.key ?? "output",
  );
}

function runFoot(input: {
  state: RunState;
  exitCode?: number;
  elapsedMs?: number;
  facts?: readonly string[];
}): NativeNode {
  const failedWithCode = input.state === "failed" && input.exitCode !== undefined && input.exitCode !== 0;
  const stateInfo = failedWithCode
    ? { word: `exit ${input.exitCode}`, tone: "error" as TspTone }
    : RUN_STATE_META[input.state];

  const cleanFacts = (input.facts ?? []).map(f => f.trim()).filter(Boolean);
  const ms = input.elapsedMs === undefined ? undefined : Math.max(0, Math.round(input.elapsedMs));

  const timeNode =
    ms === undefined
      ? undefined
      : node(
          "elapsed",
          input.state === "running"
            ? { role: "omp.run.time", age: ms, format: "short" }
            : { role: "omp.run.time", age: ms, stopped: ms, format: "short" },
          undefined,
          "time",
        );

  return node(
    "row",
    { role: "omp.run.foot", gap: "sm", align: "center" },
    compact<NativeNode>([
      node("text", { spans: [span(stateInfo.word)], role: "omp.run.state", tone: stateInfo.tone }, undefined, "state"),
      timeNode,
      cleanFacts.length > 0 &&
        node("text", { spans: [span(cleanFacts.join(" · "), "muted")], role: "omp.run.facts", wrap: "word" }, undefined, "facts"),
    ]),
    "foot",
  );
}

function runBox(children: readonly (NativeNode | undefined | false)[], p: { key: string; tone?: TspTone }): NativeNode {
  return node("col", { role: "omp.run", gap: "none", tone: p.tone }, compact(children), p.key);
}

function extractIntent(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || !("i" in args)) return undefined;
  const val = args.i;
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;
}

export interface PowerShellArgs {
  command?: string;
  cwd?: string;
  edition?: "auto" | "core" | "desktop";
  env?: Record<string, string>;
  timeout?: number;
  i?: string;
}

export interface PowerShellDetails {
  command?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  wallTimeMs?: number;
  timedOut?: boolean;
  cancelled?: boolean;
  error?: string;
  engine?: PowerShellEngineInfo;
}

function formatPowerShellCommand(args: PowerShellArgs | undefined): string {
  if (!args) return "…";
  const parts: string[] = [];
  if (args.cwd) {
    parts.push(`cd '${args.cwd.replace(/'/g, "''")}';`);
  }
  if (args.env && Object.keys(args.env).length > 0) {
    for (const [k, v] of Object.entries(args.env)) {
      parts.push(`$env:${k} = '${String(v).replace(/'/g, "''")}';`);
    }
  }
  parts.push(args.command || "…");
  return parts.join(" ");
}

function resolveRunState(
  details: PowerShellDetails | undefined,
  isError: boolean | undefined,
  isPartial: boolean | undefined,
  cancelled: boolean | undefined,
): RunState {
  if (cancelled || details?.cancelled) return "cancelled";
  if (isPartial) return "running";
  if (details?.timedOut) return "timed-out";
  if (isError || (details?.exitCode !== undefined && details.exitCode !== 0)) return "failed";
  return "done";
}

function buildPowerShellHead(
  args: PowerShellArgs | undefined,
  details: PowerShellDetails | undefined,
  settled: boolean,
): NativeToolHead {
  const intent = extractIntent(args);
  const cmdText = args?.command || formatPowerShellCommand(args);
  const exit = settled && details?.exitCode !== undefined && details.exitCode !== 0 ? details.exitCode : undefined;

  const badges: { text: string; tone?: TspTone; title?: string }[] = [];
  if (details?.engine) {
    const isCore = details.engine.edition === "core";
    badges.push({
      text: isCore ? `pwsh ${details.engine.version}` : `PS ${details.engine.version}`,
      tone: isCore ? "accent" : "info",
      title: details.engine.name,
    });
  } else if (args?.edition && args.edition !== "auto") {
    badges.push({
      text: args.edition === "core" ? "pwsh" : "powershell",
      tone: args.edition === "core" ? "accent" : "info",
    });
  } else {
    badges.push({ text: "PowerShell", tone: "accent" });
  }

  return {
    title: "PowerShell",
    target: intent,
    targetKind: intent ? "text" : undefined,
    command: cmdText,
    lang: "powershell",
    badges,
    exit,
    note: settled && details?.timedOut ? "timed out" : settled && details?.cancelled ? "cancelled" : undefined,
  };
}

export const powershellRenderer = {
  mergeCallAndResult: true,
  inline: true,

  describeCall(args: PowerShellArgs, options: RenderOptions): NativeToolView {
    const command = args?.command || formatPowerShellCommand(args);
    const started = options.executionStarted === true;
    return {
      tool: buildPowerShellHead(args, undefined, false),
      body: [
        runBox(
          [
            runInput(command, { role: "omp.tool.powershell.command", lang: "powershell", wrap: true }),
            started && runFoot({ state: options.cancelled ? "cancelled" : "running", elapsedMs: options.elapsedMs }),
          ],
          { key: "run" },
        ),
      ],
      preview: "children",
    };
  },

  describeResult(
    result: { content: Array<{ type: string; text?: string }>; details?: PowerShellDetails; isError?: boolean },
    options: RenderOptions,
    args?: PowerShellArgs,
  ): NativeToolView {
    const details = result.details;
    const isPartial = options.isPartial === true;
    const state = resolveRunState(details, result.isError, isPartial, options.cancelled);
    const command = args?.command || details?.command || formatPowerShellCommand(args);
    const elapsedMs = isPartial ? options.elapsedMs : (details?.wallTimeMs ?? options.elapsedMs);

    const stdout = details?.stdout?.trimEnd() ?? "";
    const stderr = details?.stderr?.trimEnd() ?? "";
    const fallbackText = !details ? (result.content.find(c => c.type === "text")?.text?.trimEnd() ?? "") : "";
    const combinedOutput = details
      ? [stdout, stderr ? `\x1b[33m${stderr}\x1b[39m` : ""].filter(Boolean).join("\n")
      : fallbackText;

    const boxTone: TspTone | undefined = state === "failed" ? "error" : state === "timed-out" ? "warning" : undefined;

    const facts: string[] = [];
    if (details?.wallTimeMs !== undefined) {
      facts.push(`Wall: ${(details.wallTimeMs / 1000).toFixed(2)}s`);
    }
    if (details?.engine?.version) {
      facts.push(`v${details.engine.version}`);
    }

    return {
      tool: buildPowerShellHead(args, details, !isPartial),
      body: [
        runBox(
          [
            runInput(command, { role: "omp.tool.powershell.command", lang: "powershell", wrap: true }),
            combinedOutput.trim().length > 0 &&
              runOutput(combinedOutput, { role: "omp.tool.powershell.output", previewLines: RUN_OUTPUT_PREVIEW_LINES }),
            runFoot({
              state,
              exitCode: details?.exitCode,
              elapsedMs,
              facts,
            }),
          ],
          { key: "run", tone: boxTone },
        ),
      ],
      tone: state === "timed-out" ? "warning" : state === "failed" ? "error" : undefined,
      preview: "children",
    };
  },

  renderCall(args: PowerShellArgs, options: RenderOptions, theme: Theme): Component {
    const badgeText = args?.edition === "desktop" ? "PowerShell 5.1" : args?.edition === "core" ? "pwsh" : "PowerShell";
    const badge = ` ${theme.fg("accent", `[${badgeText}]`)}`;
    const title = `${theme.fg("toolTitle", theme.bold("PowerShell"))}${badge}`;

    const cmd = args?.command || formatPowerShellCommand(args);
    const lines = cmd.replace(/\t/g, "  ").split("\n");
    const maxLines = options.expanded ? lines.length : RUN_INPUT_PREVIEW_LINES;
    const shown = lines.slice(0, maxLines).map((l, idx) => (idx === 0 ? `${theme.fg("accent", "PS> ")}${l}` : `    ${l}`));
    if (lines.length > maxLines) {
      shown.push(theme.fg("muted", `… (${lines.length - maxLines} more lines)`));
    }
    return new TextComponent(`${title}\n${shown.join("\n")}`);
  },

  renderResult(
    result: { content: Array<{ type: string; text?: string }>; details?: PowerShellDetails; isError?: boolean },
    options: RenderOptions,
    theme: Theme,
    args?: PowerShellArgs,
  ): Component {
    const details = result.details;
    const engineVer = details?.engine?.version;
    const engineName = details?.engine?.edition === "core" ? "pwsh" : "PowerShell";
    const badgeText = engineVer ? `${engineName} ${engineVer}` : engineName;
    const badge = ` ${theme.fg("accent", `[${badgeText}]`)}`;

    const statusSym = result.isError ? theme.fg("error", "✘") : options.isPartial ? theme.fg("accent", "⋯") : theme.fg("success", "✔");
    const duration = details?.wallTimeMs !== undefined ? theme.fg("dim", ` ${(details.wallTimeMs / 1000).toFixed(2)}s`) : "";
    const header = `${statusSym} ${theme.fg("toolTitle", theme.bold("PowerShell"))}${badge}${duration}`;

    const cmd = args?.command || details?.command || formatPowerShellCommand(args);
    const cmdLines = cmd.replace(/\t/g, "  ").split("\n");
    const cmdLimit = options.expanded ? cmdLines.length : 6;
    const cmdShown = cmdLines.slice(0, cmdLimit).map((l, idx) =>
      idx === 0 ? `${theme.fg("accent", "PS> ")}${l}` : `    ${l}`,
    );
    if (cmdLines.length > cmdLimit) {
      cmdShown.push(theme.fg("muted", `… (${cmdLines.length - cmdLimit} more lines)`));
    }

    const outLines: string[] = [header, ...cmdShown];
    const stdout = details?.stdout?.trimEnd() ?? "";
    const stderr = details?.stderr?.trimEnd() ?? "";
    const bodyText = details ? [stdout, stderr].filter(Boolean).join("\n") : (result.content[0]?.text ?? "");

    if (bodyText.trim()) {
      const rawLines = bodyText.replace(/\t/g, "  ").split("\n");
      const limit = options.expanded ? rawLines.length : RUN_OUTPUT_PREVIEW_LINES;
      const tail = rawLines.slice(-limit);
      if (rawLines.length > limit) {
        outLines.push(theme.fg("dim", `… (${rawLines.length - limit} earlier lines)`));
      }
      for (const line of tail) {
        outLines.push(theme.fg("toolOutput", line));
      }
    }

    return new TextComponent(outLines.join("\n"));
  },
};
