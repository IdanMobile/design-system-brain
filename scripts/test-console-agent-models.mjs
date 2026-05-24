/**
 * Load fix-agent model list from Cursor CLI (`agent --list-models`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_AGENT_MODEL, loadRunSettings } from "./test-console-run-settings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = join(ROOT, ".test-console", "agent-models-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Minimal fallback when CLI is unavailable. */
export const FALLBACK_AGENT_MODEL_OPTIONS = [
  { id: "composer-2.5-fast", label: "Composer 2.5 Fast (default)" },
  { id: "premium-intelligence", label: "Premium Intelligence" },
  { id: "composer-2.5", label: "Composer 2.5" },
  { id: "auto", label: "Auto" }
];

/**
 * Curated presets (Cursor IDE parity). IDs are stored in run-settings; resolved at CLI invoke.
 * Override premium target: TEST_CONSOLE_PREMIUM_MODEL=claude-4.6-sonnet-medium-thinking
 */
export const CURATED_CURSOR_MODEL_PRESETS = [
  { id: "premium-intelligence", label: "Premium Intelligence" }
];

/** @type {string[]} */
const PREMIUM_MODEL_FALLBACK_CHAIN = [
  "claude-4.6-sonnet-medium-thinking",
  "claude-4.6-sonnet-medium",
  "gpt-5.3-codex-high",
  "gpt-5.3-codex",
  "composer-2.5"
];

/**
 * Map console preset ids to Cursor CLI `--model` values.
 * @param {string} modelId
 * @param {{ availableIds?: Set<string> }} [opts]
 */
export function resolveCursorCliModelId(modelId, opts = {}) {
  const id = String(modelId ?? "").trim();
  if (id === "premium-intelligence") {
    const override = process.env.TEST_CONSOLE_PREMIUM_MODEL?.trim();
    if (override) return override;
    const available = opts.availableIds;
    if (available?.size) {
      for (const candidate of PREMIUM_MODEL_FALLBACK_CHAIN) {
        if (available.has(candidate)) return candidate;
      }
    }
    return PREMIUM_MODEL_FALLBACK_CHAIN[0];
  }
  return id;
}

export const GEMINI_AGENT_MODEL_OPTIONS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (default)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" }
];

/**
 * @param {string} text — stdout from `agent --list-models`
 * @returns {{ id: string, label: string, isCurrent?: boolean, isDefault?: boolean }[]}
 */
export function parseAgentListModelsOutput(text) {
  /** @type {{ id: string, label: string, isCurrent?: boolean, isDefault?: boolean }[]} */
  const options = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "Available models") continue;
    if (trimmed.startsWith("Tip:")) break;
    const m = trimmed.match(/^(\S+)\s+-\s+(.+)$/);
    if (!m) continue;
    const id = m[1];
    const rawLabel = m[2].trim();
    const isCurrent = /\(current\)/i.test(rawLabel);
    const isDefault = /\(default\)/i.test(rawLabel);
    let label = rawLabel
      .replace(/\s*\(current[^)]*\)/gi, "")
      .replace(/\s*\(default\)/gi, "")
      .trim();
    if (id === DEFAULT_AGENT_MODEL) label = `${label} (default)`;
    options.push({ id, label, isCurrent, isDefault });
  }
  return options;
}

/** @param {{ id: string, label: string }[]} options */
export function sortAgentModelOptions(options) {
  const preferred = [
    DEFAULT_AGENT_MODEL,
    "auto",
    "premium-intelligence",
    "composer-2.5",
    "composer-2-fast",
    "composer-2"
  ];
  const rank = new Map(preferred.map((id, i) => [id, i]));
  return [...options].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : 1000;
    const rb = rank.has(b.id) ? rank.get(b.id) : 1000;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

/** @param {{ id: string, label: string }[]} options */
export function mergeCuratedCursorPresets(options) {
  const byId = new Map(options.map((o) => [o.id, o]));
  for (const preset of CURATED_CURSOR_MODEL_PRESETS) {
    if (!byId.has(preset.id)) byId.set(preset.id, { ...preset });
  }
  return sortAgentModelOptions([...byId.values()]);
}

/**
 * @param {{ refresh?: boolean, cliName?: string }} [opts]
 * @returns {{ id: string, label: string }[]}
 */
export function loadAgentModelOptions(opts = {}) {
  const settings = loadRunSettings();
  const selectedCli = opts.cliName || settings.agentCli || "cursor";
  if (selectedCli === "gemini") {
    return [...GEMINI_AGENT_MODEL_OPTIONS];
  }

  if (!opts.refresh && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (Array.isArray(cached.options) && cached.options.length && age < CACHE_TTL_MS) {
        return mergeCuratedCursorPresets(cached.options);
      }
    } catch {
      /* refresh */
    }
  }

  const cli = spawnSync("agent", ["--list-models"], { encoding: "utf8", timeout: 20_000 });
  if (cli.status !== 0 || !cli.stdout?.trim()) {
    return mergeCuratedCursorPresets([...FALLBACK_AGENT_MODEL_OPTIONS]);
  }

  const parsed = parseAgentListModelsOutput(cli.stdout);
  if (!parsed.length) return mergeCuratedCursorPresets([...FALLBACK_AGENT_MODEL_OPTIONS]);

  const options = mergeCuratedCursorPresets(parsed);
  mkdirSync(join(ROOT, ".test-console"), { recursive: true });
  writeFileSync(
    CACHE_PATH,
    JSON.stringify({ fetchedAt: new Date().toISOString(), options }, null, 2)
  );
  return options;
}
