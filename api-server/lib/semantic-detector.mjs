/**
 * semantic-detector.mjs
 *
 * Detects whether a Phase 1 component already uses semantically correct
 * library components, allowing Phase 2 to be skipped.
 *
 * The heuristic: if ≥ 2 distinct semantic component names appear in the source,
 * Phase 1 got it right and Phase 2 is unnecessary. The threshold of 2 prevents
 * false positives from a single stray mention (e.g. a comment or import alias).
 */

const SEMANTIC_KEYWORDS = {
  mui: [
    'MuiDialog', 'MuiButton', 'MuiCard', 'MuiTextField', 'MuiChip',
    'MuiAlert', 'MuiAppBar', 'MuiDrawer', 'MuiTabs', 'MuiStepper',
    'MuiAccordion', 'MuiMenu', 'MuiSnackbar', 'MuiTooltip', 'MuiBreadcrumbs',
    'MuiPagination', 'MuiTable', 'MuiList', 'MuiAvatar', 'MuiBadge',
  ],
  shadcn: [
    'ShadcnButton', 'ShadcnDialog', 'ShadcnCard', 'ShadcnInput',
    'ShadcnSelect', 'ShadcnAlert', 'ShadcnBadge', 'ShadcnTooltip',
  ],
  radix: [
    'RadixDialog', 'RadixAlertDialog', 'RadixDropdown', 'RadixSelect',
    'RadixTooltip', 'RadixPopover', 'RadixTabs', 'RadixAccordion',
  ],
  daisyui: [
    'className="btn', 'className="modal', 'className="card',
    'className="alert', 'className="badge', 'className="drawer',
  ],
};

/**
 * Returns true if the component source already uses ≥ 2 distinct semantic
 * library components, indicating Phase 2 translation is not needed.
 *
 * @param {string} componentSource
 * @param {'mui' | 'shadcn' | 'radix' | 'daisyui'} library
 * @returns {boolean}
 */
export function isAlreadySemantic(componentSource, library) {
  const keywords = SEMANTIC_KEYWORDS[library];
  if (!keywords) return false;

  let hits = 0;
  for (const keyword of keywords) {
    if (componentSource.includes(keyword)) {
      hits++;
      if (hits >= 2) return true;
    }
  }
  return false;
}
