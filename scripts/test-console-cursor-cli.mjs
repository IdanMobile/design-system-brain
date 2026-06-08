/** Cursor CLI resolution + agent invocation (no fix-all/cursor.mjs imports). */

import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCursorCliModelId } from "./test-console-agent-models.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ bin: string; prefix: string[] } | null} */
let resolvedAgentCli = null;

export function resolveAgentCli() {
  if (resolvedAgentCli) return resolvedAgentCli;
  const override = process.env.TEST_CONSOLE_CURSOR_BIN?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    resolvedAgentCli = { bin: parts[0], prefix: parts.slice(1) };
    return resolvedAgentCli;
  }
  if (spawnSync("agent", ["--version"], { encoding: "utf8" }).status === 0) {
    resolvedAgentCli = { bin: "agent", prefix: [] };
    return resolvedAgentCli;
  }
  if (spawnSync("cursor", ["agent", "--version"], { encoding: "utf8" }).status === 0) {
    resolvedAgentCli = { bin: "cursor", prefix: ["agent"] };
    return resolvedAgentCli;
  }
  return null;
}

export function hasCursorAgent() {
  return resolveAgentCli() != null;
}

export function buildAgentPrompt(prompt) {
  return [
    `Project root: ${ROOT}`,
    "Work only in this workspace.",
    "If the prompt includes an investigation brief with pre-extracted code snippets:",
    "  · Edit ONLY using those line numbers — do NOT Read code-v2.ts or contract.json.",
    "  · Open compareSideBySide PNG first, then ONE surgical StrReplace in the named symbol.",
    "",
    prompt
  ].join("\n");
}

export function cursorAgentInvocation(prompt, options = {}) {
  const cli = resolveAgentCli();
  if (!cli) {
    throw new Error(
      "Cursor CLI not found. Install: curl https://cursor.com/install -fsS | bash"
    );
  }
  const outputFormat = options.streamProgress ? "stream-json" : "text";
  const args = [
    ...cli.prefix,
    "-p",
    "--force",
    "--trust",
    "--output-format",
    outputFormat
  ];
  const model = options.model?.trim();
  if (model) {
    args.push("--model", resolveCursorCliModelId(model));
  }
  args.push("--workspace", ROOT, buildAgentPrompt(prompt));
  if (process.env.TEST_CONSOLE_CURSOR_NO_TRUST) {
    const trustIdx = args.indexOf("--trust");
    if (trustIdx >= 0) args.splice(trustIdx, 1);
  }
  if (process.env.TEST_CONSOLE_CURSOR_NO_FORCE) {
    const forceIdx = args.indexOf("--force");
    if (forceIdx >= 0) args.splice(forceIdx, 1);
  }
  return { bin: cli.bin, args };
}

export function cursorAgentArgs(prompt) {
  return cursorAgentInvocation(prompt).args;
}

export function formatStreamJsonEvent(raw) {
  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    return null;
  }
  const type = ev.type;
  const subtype = ev.subtype;

  if (type === "system" && subtype === "init") {
    return `Using model ${ev.model ?? "unknown"}`;
  }
  if (type === "tool_call" && subtype === "started") {
    const tc = ev.tool_call ?? {};
    const w =
      tc.writeToolCall?.args?.path ??
      tc.searchReplaceToolCall?.args?.path ??
      tc.applyPatchToolCall?.args?.path;
    const r = tc.readToolCall?.args?.path;
    const s = tc.shellToolCall?.args?.command;
    if (w) return `Editing ${w}`;
    if (r) return `Reading ${r}`;
    if (s) return `Shell: ${String(s).slice(0, 72)}${String(s).length > 72 ? "…" : ""}`;
    // StrReplace / ApplyPatch / other write tools often omit path in stream-json — still an edit.
    const toolName = Object.keys(tc)[0] ?? "";
    if (toolName && !/read|shell|grep|glob|list|search(?!Replace)/i.test(toolName)) {
      return `Editing (${toolName})…`;
    }
    return "Running tool…";
  }
  if (type === "tool_call" && subtype === "completed") {
    const wOk = ev.tool_call?.writeToolCall?.result?.success;
    if (wOk) {
      const lines = wOk.linesCreated ?? 0;
      const path = ev.tool_call?.writeToolCall?.args?.path ?? "file";
      return `Wrote ${path} (${lines} lines)`;
    }
    const rOk = ev.tool_call?.readToolCall?.result?.success;
    if (rOk) {
      const lines = rOk.totalLines ?? 0;
      const path = ev.tool_call?.readToolCall?.args?.path ?? "file";
      return `Read ${path} (${lines} lines)`;
    }
    return "Tool finished";
  }
  if (type === "assistant" && subtype !== "completed") {
    const text = ev.message?.content?.[0]?.text;
    if (text && String(text).trim()) {
      const oneLine = String(text).replace(/\s+/g, " ").trim();
      return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
    }
  }
  if (type === "result") {
    const sec = ((ev.duration_ms ?? 0) / 1000).toFixed(1);
    return `Agent turn complete (${sec}s)`;
  }
  return null;
}

function streamEventIsEdit(ev) {
  if (ev.type !== "tool_call") return false;
  const tc = ev.tool_call ?? {};
  if (tc.readToolCall) return false;
  if (tc.shellToolCall) return false;
  if (
    tc.writeToolCall ||
    tc.searchReplaceToolCall ||
    tc.applyPatchToolCall ||
    tc.editToolCall
  ) {
    return true;
  }
  if (ev.subtype === "started") {
    const name = Object.keys(tc)[0] ?? "";
    if (!name) return false;
    return !/read|shell|grep|glob|list|fetch|web|mcp/i.test(name);
  }
  if (ev.subtype === "completed" && tc.writeToolCall?.result?.success) return true;
  return false;
}

export function parseStreamJsonAgentLine(raw) {
  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    return { label: null, terminal: false, isEdit: false };
  }
  if (ev.type === "result") {
    const sec = ((ev.duration_ms ?? 0) / 1000).toFixed(1);
    const code = typeof ev.exit_code === "number" ? ev.exit_code : 0;
    return {
      label: `Agent turn complete (${sec}s)`,
      terminal: true,
      exitCode: code,
      isEdit: false
    };
  }
  const label = formatStreamJsonEvent(raw);
  const isEdit =
    streamEventIsEdit(ev) ||
    (typeof label === "string" &&
      (label.startsWith("Editing ") || label.startsWith("Wrote ")));
  return { label, terminal: false, isEdit };
}

export function spawnCursorAgent(prompt, spawnOptions = {}) {
  const { bin, args } = cursorAgentInvocation(prompt, { model: spawnOptions.model });
  return spawn(bin, args, {
    cwd: ROOT,
    env: process.env,
    ...spawnOptions
  });
}
