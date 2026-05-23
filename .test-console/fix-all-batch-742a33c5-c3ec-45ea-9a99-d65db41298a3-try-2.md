# Fix-all investigation report

**Suite:** Figma live (`figmaLive`)
**Stories:** 25 fail/warn
**Pass bar:** global ≤ 0.1% AND worst hotspot ≤ 0.1%

## Component families

- `lab-pricingpanel--*` — 2: lab-pricingpanel--pro, lab-pricingpanel--starter
- `lab-button--*` — 3: lab-button--danger, lab-button--ghost, lab-button--secondary
- `lab-tabspanel--*` — 2: lab-tabspanel--activity-active, lab-tabspanel--settings-active
- `lab-contentlistboard--*` — 2: lab-contentlistboard--highlighted, lab-contentlistboard--compact
- `lab-filtersidepanel--*` — 3: lab-filtersidepanel--collapsed, lab-filtersidepanel--left-panel, lab-filtersidepanel--right-panel
- `lab-navigationbars--*` — 1: lab-navigationbars--top-navigation
- `lab-snackbarstack--*` — 1: lab-snackbarstack--default
- `lab-calendarscheduler--*` — 3: lab-calendarscheduler--compact, lab-calendarscheduler--monthly, lab-calendarscheduler--weekdays-only
- `lab-featurecard--*` — 1: lab-featurecard--success
- `lab-analyticscharts--*` — 2: lab-analyticscharts--revenue, lab-analyticscharts--usage
- `mui--*` — 1: mui--showcase
- `lab-complexdashboardcard--*` — 1: lab-complexdashboardcard--default
- `lab-productcard--*` — 2: lab-productcard--dark, lab-productcard--default
- `lab-overlaystates--*` — 1: lab-overlaystates--drawer

## Fix strategy hints

- 2 stories in family `lab-pricingpanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 3 stories in family `lab-button--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-tabspanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 2 stories in family `lab-contentlistboard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 3 stories in family `lab-filtersidepanel--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 3 stories in family `lab-calendarscheduler--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-analyticscharts--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 2 stories in family `lab-productcard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.

## Stories (read compare + artifact for each before editing)

### 1. `lab-pricingpanel--pro` — fail
- Global diff: **2.61%** (over bar)
- Worst hotspot: **4.98%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/scene.json
### 2. `lab-button--danger` — fail
- Global diff: **4.38%** (over bar)
- Worst hotspot: **5.07%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/scene.json
### 3. `lab-button--ghost` — fail
- Global diff: **3.82%** (over bar)
- Worst hotspot: **3.82%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/scene.json
### 4. `lab-pricingpanel--starter` — fail
- Global diff: **1.87%** (over bar)
- Worst hotspot: **3.94%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/scene.json
### 5. `lab-button--secondary` — fail
- Global diff: **3.31%** (over bar)
- Worst hotspot: **3.82%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/scene.json
### 6. `lab-tabspanel--activity-active` — fail
- Global diff: **2.65%** (over bar)
- Worst hotspot: **4.99%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/scene.json
### 7. `lab-contentlistboard--highlighted` — fail
- Global diff: **1.42%** (over bar)
- Worst hotspot: **2.53%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/scene.json
### 8. `lab-tabspanel--settings-active` — fail
- Global diff: **2.28%** (over bar)
- Worst hotspot: **4.02%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/scene.json
### 9. `lab-filtersidepanel--collapsed` — fail
- Global diff: **1.94%** (over bar)
- Worst hotspot: **2.29%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/scene.json
### 10. `lab-filtersidepanel--left-panel` — fail
- Global diff: **1.80%** (over bar)
- Worst hotspot: **2.71%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/scene.json
### 11. `lab-filtersidepanel--right-panel` — fail
- Global diff: **1.80%** (over bar)
- Worst hotspot: **2.71%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/scene.json
### 12. `lab-navigationbars--top-navigation` — fail
- Global diff: **1.74%** (over bar)
- Worst hotspot: **2.51%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/scene.json
### 13. `lab-snackbarstack--default` — fail
- Global diff: **1.50%** (over bar)
- Worst hotspot: **3.01%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-snackbarstack-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-snackbarstack-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-snackbarstack-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-snackbarstack-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-snackbarstack-default/scene.json
### 14. `lab-calendarscheduler--compact` — fail
- Global diff: **1.46%** (over bar)
- Worst hotspot: **4.14%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/scene.json
### 15. `lab-featurecard--success` — fail
- Global diff: **1.45%** (over bar)
- Worst hotspot: **4.58%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/scene.json
### 16. `lab-contentlistboard--compact` — fail
- Global diff: **1.38%** (over bar)
- Worst hotspot: **2.57%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/scene.json
### 17. `lab-calendarscheduler--monthly` — fail
- Global diff: **1.20%** (over bar)
- Worst hotspot: **3.00%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/scene.json
### 18. `lab-analyticscharts--revenue` — fail
- Global diff: **0.46%** (over bar)
- Worst hotspot: **2.50%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-revenue/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-revenue/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-revenue/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-revenue/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-revenue/scene.json
### 19. `lab-analyticscharts--usage` — fail
- Global diff: **0.41%** (over bar)
- Worst hotspot: **2.56%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-usage/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-usage/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-usage/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-usage/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-analyticscharts-usage/scene.json
### 20. `lab-calendarscheduler--weekdays-only` — fail
- Global diff: **1.05%** (over bar)
- Worst hotspot: **3.00%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/scene.json
### 21. `mui--showcase` — fail
- Global diff: **0.74%** (over bar)
- Worst hotspot: **2.84%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/scene.json
### 22. `lab-complexdashboardcard--default` — fail
- Global diff: **0.71%** (over bar)
- Worst hotspot: **4.26%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/scene.json
### 23. `lab-productcard--dark` — fail
- Global diff: **0.68%** (over bar)
- Worst hotspot: **3.42%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/scene.json
### 24. `lab-productcard--default` — fail
- Global diff: **0.67%** (over bar)
- Worst hotspot: **3.42%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/scene.json
### 25. `lab-overlaystates--drawer` — warn
- Global diff: **0.29%** (over bar)
- Worst hotspot: **2.20%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/scene.json
## Agent instructions

1. Read this report, then open compare PNGs + artifact JSON per story above.
2. Find **shared root cause** across families — implement **one batch of edits** for all stories.
3. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.
