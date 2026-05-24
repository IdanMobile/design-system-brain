# Fix-all investigation report

**Suite:** Figma live (`figmaLive`)
**Stories:** 14 fail/warn
**Pass bar:** global ≤ 0.1% AND worst hotspot ≤ 0.1%

## Component families

- `mui--*` — 1: mui--showcase
- `lab-productcard--*` — 2: lab-productcard--default, lab-productcard--dark
- `lab-button--*` — 1: lab-button--secondary
- `lab-tabspanel--*` — 2: lab-tabspanel--activity-active, lab-tabspanel--settings-active
- `lab-pricingpanel--*` — 1: lab-pricingpanel--pro
- `lab-navigationbars--*` — 1: lab-navigationbars--top-navigation
- `lab-calendarscheduler--*` — 3: lab-calendarscheduler--compact, lab-calendarscheduler--monthly, lab-calendarscheduler--weekdays-only
- `lab-featurecard--*` — 2: lab-featurecard--success, lab-featurecard--default
- `lab-contentlistboard--*` — 1: lab-contentlistboard--highlighted

## Fix strategy hints

- 2 stories in family `lab-productcard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 2 stories in family `lab-tabspanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 3 stories in family `lab-calendarscheduler--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-featurecard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.

## Stories (read compare + artifact for each before editing)

### 1. `mui--showcase` — error
- Global diff: **100.00%** (over bar)
- Worst hotspot: —
- Fail reason: `global_over`
- Error: Export timed out after 600000ms
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/scene.json
### 2. `lab-productcard--default` — fail
- Global diff: **18.78%** (over bar)
- Worst hotspot: **49.33%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-default/scene.json
### 3. `lab-productcard--dark` — fail
- Global diff: **10.61%** (over bar)
- Worst hotspot: **25.03%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/scene.json
### 4. `lab-button--secondary` — fail
- Global diff: **3.01%** (over bar)
- Worst hotspot: **3.47%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/scene.json
### 5. `lab-tabspanel--activity-active` — fail
- Global diff: **1.83%** (over bar)
- Worst hotspot: **3.40%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/scene.json
### 6. `lab-tabspanel--settings-active` — fail
- Global diff: **1.79%** (over bar)
- Worst hotspot: **3.37%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/scene.json
### 7. `lab-pricingpanel--pro` — fail
- Global diff: **1.29%** (over bar)
- Worst hotspot: **3.21%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/scene.json
### 8. `lab-navigationbars--top-navigation` — fail
- Global diff: **1.16%** (over bar)
- Worst hotspot: **3.61%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/scene.json
### 9. `lab-calendarscheduler--compact` — fail
- Global diff: **1.02%** (over bar)
- Worst hotspot: **4.01%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/scene.json
### 10. `lab-featurecard--success` — fail
- Global diff: **0.93%** (over bar)
- Worst hotspot: **3.41%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/scene.json
### 11. `lab-calendarscheduler--monthly` — fail
- Global diff: **0.87%** (over bar)
- Worst hotspot: **3.12%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/scene.json
### 12. `lab-calendarscheduler--weekdays-only` — fail
- Global diff: **0.80%** (over bar)
- Worst hotspot: **3.12%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/scene.json
### 13. `lab-featurecard--default` — fail
- Global diff: **0.79%** (over bar)
- Worst hotspot: **3.71%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/scene.json
### 14. `lab-contentlistboard--highlighted` — fail
- Global diff: **0.60%** (over bar)
- Worst hotspot: **2.72%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/scene.json
## Agent instructions

1. Read this report, then open compare PNGs + artifact JSON per story above.
2. Find **shared root cause** across families — implement **one batch of edits** for all stories.
3. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.
