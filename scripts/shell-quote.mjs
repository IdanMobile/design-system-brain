/**
 * POSIX-safe single-quoted string for shell one-liners (zsh/bash).
 * Prevents history expansion on `!` and breaks on embedded `"`.
 */
export function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
}
