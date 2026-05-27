# Investigations index

Per-story **visual** debug notes. Prefer linking **[[../patterns/README|patterns]]** before editing adapter code.

## Active (current work)

```dataview
TABLE file.mtime AS "Updated"
FROM "visual/investigations/active"
WHERE file.name != "_index"
SORT file.mtime DESC
```

If Dataview is off, browse `visual/investigations/active/`.

## Archive (stale stubs)

Notes moved here when they only contain auto-generated **pending** stubs (no filled root cause). Safe to delete after review.

- [[archive/lab-button--secondary]]
- [[archive/lab-productcard--default]]
- [[archive/lab-tabspanel--activity-active]]
- [[archive/mui--showcase]]
