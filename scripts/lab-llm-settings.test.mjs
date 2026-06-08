#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import {
  resolveLabLlmConfig,
  loadLlmSettingsPublic,
  setLlmSettings,
  llmSettingsPath
} from "./lab-llm-settings.mjs";

describe("lab-llm-settings", () => {
  /** @type {string} */
  let repoRoot;
  /** @type {Record<string, string | undefined>} */
  let envBackup;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "lab-llm-"));
    mkdirSync(join(repoRoot, ".test-console"), { recursive: true });
    envBackup = {
      LAB_LLM_API_KEY: process.env.LAB_LLM_API_KEY,
      LAB_LLM_PROVIDER: process.env.LAB_LLM_PROVIDER,
      LAB_LLM_MODEL: process.env.LAB_LLM_MODEL
    };
    delete process.env.LAB_LLM_API_KEY;
    delete process.env.LAB_LLM_PROVIDER;
    delete process.env.LAB_LLM_MODEL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults to openai with no key", () => {
    const cfg = resolveLabLlmConfig(repoRoot);
    assert.equal(cfg.provider, "openai");
    assert.equal(cfg.apiKey, "");
    assert.equal(cfg.source, "none");
  });

  it("reads env when no settings file", () => {
    process.env.LAB_LLM_PROVIDER = "anthropic";
    process.env.LAB_LLM_API_KEY = "sk-ant-test";
    const cfg = resolveLabLlmConfig(repoRoot);
    assert.equal(cfg.provider, "anthropic");
    assert.equal(cfg.apiKey, "sk-ant-test");
    assert.equal(cfg.source, "env");
  });

  it("test-console file overrides env", () => {
    process.env.LAB_LLM_API_KEY = "env-key";
    setLlmSettings({ provider: "gemini", model: "gemini-2.0-flash", apiKey: "console-key" }, repoRoot);
    const cfg = resolveLabLlmConfig(repoRoot);
    assert.equal(cfg.provider, "gemini");
    assert.equal(cfg.apiKey, "console-key");
    assert.equal(cfg.source, "test-console");
  });

  it("public view masks api key", () => {
    setLlmSettings({ apiKey: "sk-test-secret1234" }, repoRoot);
    const pub = loadLlmSettingsPublic(repoRoot);
    assert.equal(pub.apiKeySet, true);
    assert.equal(pub.apiKeyPreview, "…1234");
    assert.ok(!("apiKey" in pub));
  });

  it("preserves api key when partial omits it", () => {
    setLlmSettings({ apiKey: "keep-me", provider: "openai" }, repoRoot);
    setLlmSettings({ provider: "anthropic" }, repoRoot);
    const cfg = resolveLabLlmConfig(repoRoot);
    assert.equal(cfg.provider, "anthropic");
    assert.equal(cfg.apiKey, "keep-me");
    assert.ok(existsSync(llmSettingsPath(repoRoot)));
  });
});
