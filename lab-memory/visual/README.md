# Visual track (Storybook → Figma)

Pixel, Figma mock, Figma live, and delivery tests all compare **rendered output** to Storybook. Knowledge here is about the **shared adapter** (`render-html.ts`, `code-v2.ts`, `extract.ts`), not per-platform ingress.

## Layout

```text
visual/
  patterns/              ← read FIRST — durable compiler rules
  investigations/
    active/              ← current failures / real diagnoses
    archive/             ← stale pending stubs or completed history
    _index.md            ← map of investigation notes
```

## When to create an investigation note

- Test console **fail/warn** (auto-stub), or you are actively debugging a story.
- **Not** for every green portfolio story — the harness already tracks pass/fail in JSON reports.

## Wiki links

- Patterns: `[[visual/patterns/slug]]`
- Logic spec for same story: `[[logic/specs/<storyId>.spec.json]]` (optional cross-link)
