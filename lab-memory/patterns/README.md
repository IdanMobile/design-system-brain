# Patterns

Reusable fix patterns discovered across stories.

## How to add

1. Create `patterns/<short-name>.md`
2. Describe symptom, root cause, fix location, and example story IDs
3. Link from story notes: `[[patterns/<short-name>]]`

## Example skeleton

```markdown
# Border radius on nested frames

## Symptom
Mock pass, live fail — corner clipping on compact buttons.

## Fix area
code-v2.ts — `applyCornerRadius` for nested auto-layout children

## Stories
- lab-button--compact
```
