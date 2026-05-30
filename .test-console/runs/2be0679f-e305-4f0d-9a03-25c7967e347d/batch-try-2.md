# Fix-all investigation report

**Suite:** Figma live (`figmaLive`)
**Stories:** 15 fail/warn
**Pass bar:** global ≤ 0.1% AND worst hotspot ≤ 0.1%

## Component families

- `lab-calendarscheduler--*` — 3: lab-calendarscheduler--compact, lab-calendarscheduler--monthly, lab-calendarscheduler--weekdays-only
- `lab-contentlistboard--*` — 2: lab-contentlistboard--compact, lab-contentlistboard--default
- `lab-pricingpanel--*` — 1: lab-pricingpanel--pro
- `lab-button--*` — 4: lab-button--secondary, lab-button--ghost, lab-button--danger, lab-button--compact
- `lab-navigationbars--*` — 1: lab-navigationbars--top-navigation
- `lab-tabspanel--*` — 2: lab-tabspanel--activity-active, lab-tabspanel--settings-active
- `lab-featurecard--*` — 1: lab-featurecard--success
- `mui--*` — 1: mui--showcase

## Fix strategy hints

- 3 stories in family `lab-calendarscheduler--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-contentlistboard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 4 stories in family `lab-button--*` — prefer ONE shared fix (renderer/extract), not 4 separate edits.
- 2 stories in family `lab-tabspanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.

## Stories (read compare + artifact for each before editing)

### 1. `lab-calendarscheduler--compact` — error
- Global diff: **100.00%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Error: Export timed out after 448000ms
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/scene.json
### 2. `lab-calendarscheduler--monthly` — error
- Global diff: **100.00%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Error: Export timed out after 448000ms
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/scene.json
### 3. `lab-contentlistboard--compact` — error
- Global diff: **100.00%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Error: Export timed out after 198000ms
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/scene.json
### 4. `lab-contentlistboard--default` — error
- Global diff: **100.00%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Error: Export timed out after 198000ms
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/scene.json
### 5. `lab-pricingpanel--pro` — fail
- Global diff: **1.34%** (over bar)
- Worst hotspot: **3.36%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/scene.json
### 6. `lab-button--secondary` — fail
- Global diff: **20.98%** (over bar)
- Worst hotspot: **20.98%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/scene.json
### 7. `lab-button--ghost` — fail
- Global diff: **5.49%** (over bar)
- Worst hotspot: **5.49%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/scene.json
### 8. `lab-button--danger` — fail
- Global diff: **4.27%** (over bar)
- Worst hotspot: **4.29%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/scene.json
### 9. `lab-navigationbars--top-navigation` — fail
- Global diff: **3.00%** (over bar)
- Worst hotspot: **4.12%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/scene.json
### 10. `lab-button--compact` — fail
- Global diff: **2.06%** (over bar)
- Worst hotspot: **2.62%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-compact/scene.json
### 11. `lab-tabspanel--activity-active` — fail
- Global diff: **1.74%** (over bar)
- Worst hotspot: **3.37%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/scene.json
### 12. `lab-tabspanel--settings-active` — fail
- Global diff: **1.74%** (over bar)
- Worst hotspot: **3.37%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/scene.json
### 13. `lab-featurecard--success` — fail
- Global diff: **1.07%** (over bar)
- Worst hotspot: **4.33%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/scene.json
### 14. `lab-calendarscheduler--weekdays-only` — fail
- Global diff: **0.74%** (over bar)
- Worst hotspot: **2.55%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/scene.json
### 15. `mui--showcase` — fail
- Global diff: **0.74%** (over bar)
- Worst hotspot: **2.92%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/scene.json
## Agent instructions

1. Read this report, then open compare PNGs + artifact JSON per story above.
2. Find **shared root cause** across families — implement **one batch of edits** for all stories.
3. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.
