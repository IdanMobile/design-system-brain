# Storybook to Figma Lab

A TypeScript monorepo to test:

**Storybook → Universal JSON → Figma** and deliver the same design to developers via **`@lab/ui`**.

The goal is pixel-perfect editable Figma output and a publishable React package, not screenshot fallback.

## Packages

| Package | Role |
| --- | --- |
| `packages/contract` | Universal UI JSON types + shared story manifest |
| `packages/ui` | **Developer-facing React components** (`import { Button } from "@lab/ui"`) |
| `packages/storybook-lab` | Storybook fixtures (imports `@lab/ui`) |
| `packages/developer-playground` | Minimal Vite app — real consumer of `@lab/ui` |
| `packages/extractor-playwright` | Playwright DOM/CSS extractor |
| `packages/figma-importer-plugin` | Figma plugin importer |
| `packages/pixel-test` | Pixel diff harnesses |

## Start

```bash
pnpm install
pnpm install:browsers
pnpm storybook:build
pnpm storybook:serve          # http://127.0.0.1:6107
pnpm playground:build
pnpm playground:serve         # http://127.0.0.1:6108/?story=lab-pricingpanel--pro
```

## Tests

| Command | What it checks |
| --- | --- |
| `pnpm test:pixel` | Storybook DOM vs Universal HTML reconstructor (schema lossless) |
| `pnpm test:figma` | Storybook vs Figma renderer **browser mock** (`code-v2.ts` + HTML) |
| `pnpm test:figma:live` | Storybook vs **real Figma Desktop** PNG export (requires open plugin) |
| `pnpm test:delivery` | **Three-way:** Storybook vs `@lab/ui` playground vs Figma |

Golden delivery gate:

```bash
pnpm test:delivery:golden
```

Open `delivery-diffs/report.html` for side-by-side Storybook · Developer · Figma screenshots.

## Test console (dashboard)

Web UI to start services, run test suites, stream logs, and browse reports:

```bash
pnpm test:console:dev    # development (hot reload)
# or
pnpm test:console        # production build + server
```

Open **http://127.0.0.1:6110** — Storybook/relay/plugin status, action buttons, report tabs (emulator + live + pixel + delivery). Clicking a test action opens Terminal and dispatches the Cursor CLI agent when a fix is queued. Manual fallback:

```bash
pnpm test:console:cursor agent
```

## Developer usage

```tsx
import { PricingPanel } from "@lab/ui";
import "@lab/ui/styles.css";

export function Checkout() {
  return <PricingPanel plan="pro" />;
}
```

## Figma plugin

```bash
pnpm --filter @lab/figma-importer-plugin build
```

Import `packages/figma-importer-plugin/manifest.json` in Figma Desktop → Development.

### Live Figma pixel test

Uses the real Figma `exportAsync` engine (catches SVG/font bugs the browser mock misses).

```bash
pnpm storybook:serve                    # terminal 1
pnpm figma:relay                        # terminal 2
# Figma Desktop → Plugins → Development → Universal JSON Importer Lab (keep open)
pnpm --filter @lab/figma-importer-plugin build   # after plugin code changes
pnpm test:figma:live                    # terminal 3 — smoke set
pnpm test:figma:live:golden             # golden set
```

Reports land in `figma-live-diffs/report.html`. The plugin UI should show **Live test bridge: connected**.

Note: the plugin manifest must use `localhost` (not `127.0.0.1`) in `devAllowedDomains` — Figma rejects IP literals there.
