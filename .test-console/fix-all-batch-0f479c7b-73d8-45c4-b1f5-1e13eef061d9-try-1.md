# Fix-all investigation report

**Suite:** Figma live (`figmaLive`)
**Stories:** 27 fail/warn
**Pass bar:** global ≤ 0.1% AND worst hotspot ≤ 0.1%

## Component families

- `lab-button--*` — 4: lab-button--ghost, lab-button--danger, lab-button--secondary, lab-button--primary
- `lab-tabspanel--*` — 2: lab-tabspanel--activity-active, lab-tabspanel--settings-active
- `lab-pricingpanel--*` — 2: lab-pricingpanel--pro, lab-pricingpanel--starter
- `lab-filtersidepanel--*` — 3: lab-filtersidepanel--collapsed, lab-filtersidepanel--left-panel, lab-filtersidepanel--right-panel
- `lab-contentlistboard--*` — 3: lab-contentlistboard--compact, lab-contentlistboard--default, lab-contentlistboard--highlighted
- `lab-navigationbars--*` — 2: lab-navigationbars--top-navigation, lab-navigationbars--bottom-navigation
- `lab-calendarscheduler--*` — 3: lab-calendarscheduler--compact, lab-calendarscheduler--monthly, lab-calendarscheduler--weekdays-only
- `lab-featurecard--*` — 2: lab-featurecard--success, lab-featurecard--default
- `mui--*` — 1: mui--showcase
- `lab-complexdashboardcard--*` — 1: lab-complexdashboardcard--default
- `lab-overlaystates--*` — 2: lab-overlaystates--drawer, lab-overlaystates--bottom-sheet
- `lab-loginpage--*` — 1: lab-loginpage--default
- `lab-productcard--*` — 1: lab-productcard--dark

## Fix strategy hints

- 4 stories in family `lab-button--*` — prefer ONE shared fix (renderer/extract), not 4 separate edits.
- 2 stories in family `lab-tabspanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 2 stories in family `lab-pricingpanel--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 3 stories in family `lab-filtersidepanel--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 3 stories in family `lab-contentlistboard--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-navigationbars--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 3 stories in family `lab-calendarscheduler--*` — prefer ONE shared fix (renderer/extract), not 3 separate edits.
- 2 stories in family `lab-featurecard--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.
- 2 stories in family `lab-overlaystates--*` — prefer ONE shared fix (renderer/extract), not 2 separate edits.

## Stories (read compare + artifact for each before editing)

### 1. `lab-button--ghost` — fail
- Global diff: **9.13%** (over bar)
- Worst hotspot: **9.13%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-ghost/scene.json
### 2. `lab-button--danger` — fail
- Global diff: **5.96%** (over bar)
- Worst hotspot: **5.99%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-danger/scene.json
### 3. `lab-button--secondary` — fail
- Global diff: **5.86%** (over bar)
- Worst hotspot: **5.86%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-secondary/scene.json
### 4. `lab-button--primary` — fail
- Global diff: **5.32%** (over bar)
- Worst hotspot: **5.45%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-primary/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-primary/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-primary/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-primary/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-button-primary/scene.json
### 5. `lab-tabspanel--activity-active` — fail
- Global diff: **2.88%** (over bar)
- Worst hotspot: **5.07%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-activity-active/scene.json
### 6. `lab-tabspanel--settings-active` — fail
- Global diff: **2.87%** (over bar)
- Worst hotspot: **5.06%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-tabspanel-settings-active/scene.json
### 7. `lab-pricingpanel--pro` — fail
- Global diff: **2.20%** (over bar)
- Worst hotspot: **4.25%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-pro/scene.json
### 8. `lab-filtersidepanel--collapsed` — fail
- Global diff: **1.95%** (over bar)
- Worst hotspot: **2.30%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-collapsed/scene.json
### 9. `lab-filtersidepanel--left-panel` — fail
- Global diff: **1.81%** (over bar)
- Worst hotspot: **2.72%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-left-panel/scene.json
### 10. `lab-filtersidepanel--right-panel` — fail
- Global diff: **1.81%** (over bar)
- Worst hotspot: **2.72%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-filtersidepanel-right-panel/scene.json
### 11. `lab-contentlistboard--compact` — fail
- Global diff: **1.74%** (over bar)
- Worst hotspot: **2.57%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-compact/scene.json
### 12. `lab-navigationbars--top-navigation` — fail
- Global diff: **1.74%** (over bar)
- Worst hotspot: **2.51%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-top-navigation/scene.json
### 13. `lab-pricingpanel--starter` — fail
- Global diff: **1.64%** (over bar)
- Worst hotspot: **3.41%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-pricingpanel-starter/scene.json
### 14. `lab-calendarscheduler--compact` — fail
- Global diff: **1.58%** (over bar)
- Worst hotspot: **4.14%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-compact/scene.json
### 15. `lab-contentlistboard--default` — fail
- Global diff: **1.49%** (over bar)
- Worst hotspot: **2.24%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-default/scene.json
### 16. `lab-contentlistboard--highlighted` — fail
- Global diff: **1.49%** (over bar)
- Worst hotspot: **2.24%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-contentlistboard-highlighted/scene.json
### 17. `lab-featurecard--success` — fail
- Global diff: **1.48%** (over bar)
- Worst hotspot: **4.58%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-success/scene.json
### 18. `lab-navigationbars--bottom-navigation` — fail
- Global diff: **1.31%** (over bar)
- Worst hotspot: **1.80%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-bottom-navigation/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-bottom-navigation/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-bottom-navigation/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-bottom-navigation/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-navigationbars-bottom-navigation/scene.json
### 19. `lab-calendarscheduler--monthly` — fail
- Global diff: **1.30%** (over bar)
- Worst hotspot: **3.00%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-monthly/scene.json
### 20. `lab-calendarscheduler--weekdays-only` — fail
- Global diff: **1.15%** (over bar)
- Worst hotspot: **3.00%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-calendarscheduler-weekdays-only/scene.json
### 21. `lab-featurecard--default` — fail
- Global diff: **1.00%** (over bar)
- Worst hotspot: **5.39%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-featurecard-default/scene.json
### 22. `mui--showcase` — fail
- Global diff: **0.93%** (over bar)
- Worst hotspot: **3.00%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/mui-showcase/scene.json
### 23. `lab-complexdashboardcard--default` — fail
- Global diff: **0.71%** (over bar)
- Worst hotspot: **4.26%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-complexdashboardcard-default/scene.json
### 24. `lab-overlaystates--drawer` — warn
- Global diff: **0.39%** (over bar)
- Worst hotspot: **2.52%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-drawer/scene.json
### 25. `lab-overlaystates--bottom-sheet` — warn
- Global diff: **0.34%** (over bar)
- Worst hotspot: **2.09%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-bottom-sheet/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-bottom-sheet/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-bottom-sheet/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-bottom-sheet/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-overlaystates-bottom-sheet/scene.json
### 26. `lab-loginpage--default` — warn
- Global diff: **0.18%** (over bar)
- Worst hotspot: **1.99%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-loginpage-default/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-loginpage-default/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-loginpage-default/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-loginpage-default/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-loginpage-default/scene.json
### 27. `lab-productcard--dark` — warn
- Global diff: **0.15%** (over bar)
- Worst hotspot: **2.27%** (over bar)
- Fail reason: `global_and_hotspot`
- Compare: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/regions/region-01-compare.png
- Storybook: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/storybook.png
- Rendered: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/figma.png
- Artifact: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/artifact.v2.json
- Scene JSON: /Users/user/Downloads/storybook-to-figma-lab/figma-live-diffs/lab-productcard-dark/scene.json
## Agent instructions

1. Read this report, then open compare PNGs + artifact JSON per story above.
2. Find **shared root cause** across families — implement **one batch of edits** for all stories.
3. Do **not** run golden tests yourself; the harness re-tests every listed story after your session.
