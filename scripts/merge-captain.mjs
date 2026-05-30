/**
 * Merge Captain — reviewer gate for sandbox changes.
 *
 * This module is deliberately pure: fix-all / developer flows gather metrics,
 * verification, and changed files; Merge Captain decides whether promotion is
 * allowed, held for more evidence, or rejected.
 */

import {
  classifyWrongFiles,
  isNonProductivePath,
  touchedSharedAdapter
} from "./test-console-worker-supervisor.mjs";

/**
 * @typedef {{ promote?: boolean, discard?: boolean, neutral?: boolean, worse?: object[], improved?: object[] }} PromotionVerdict
 * @typedef {{ tierAOk?: boolean, tierBOk?: boolean, tierCOk?: boolean }} VerificationVerdict
 * @typedef {'approve'|'hold'|'reject'} MergeDecision
 */

/**
 * @param {{
 *   suiteId: string,
 *   mode: string,
 *   filesChanged: string[],
 *   promotion?: PromotionVerdict | null,
 *   verification?: VerificationVerdict | null
 * }} input
 * @returns {{ decision: MergeDecision, requiresHuman: boolean, sharedAdapter: boolean, reasons: string[] }}
 */
export function reviewSandboxPromotion(input) {
  const filesChanged = input.filesChanged ?? [];
  const promotion = input.promotion ?? {};
  const verification = input.verification ?? {};
  const reasons = [];
  const sharedAdapter = touchedSharedAdapter(filesChanged);

  if (!filesChanged.length) {
    reasons.push("No changed files to promote.");
    return { decision: "reject", requiresHuman: false, sharedAdapter, reasons };
  }

  if (promotion.discard || (promotion.worse?.length ?? 0) > 0) {
    reasons.push("Metrics regressed; sandbox must be discarded.");
    return { decision: "reject", requiresHuman: false, sharedAdapter, reasons };
  }

  const wrongFiles = classifyWrongFiles(input.suiteId, input.mode, filesChanged);
  if (wrongFiles) {
    reasons.push(wrongFiles);
    return { decision: "reject", requiresHuman: false, sharedAdapter, reasons };
  }

  const onlyNonProductive = filesChanged.every(isNonProductivePath);
  if (onlyNonProductive) {
    reasons.push("Only non-productive files changed; no runtime fix to promote.");
    return { decision: "reject", requiresHuman: false, sharedAdapter, reasons };
  }

  if (verification.tierAOk === false) {
    reasons.push("Tier A verification has not passed.");
    return { decision: "hold", requiresHuman: false, sharedAdapter, reasons };
  }

  if (verification.tierBOk === false) {
    reasons.push("Tier B verification has not passed.");
    return { decision: "hold", requiresHuman: false, sharedAdapter, reasons };
  }

  // Shared-adapter promotion is gated by Tier A + per-story metrics; full-portfolio
  // Tier C is a background concern — merge-captain does not block the fix pipeline on it.
  if (verification.tierCOk === false) {
    reasons.push("Tier C regression reported failures.");
    return { decision: "hold", requiresHuman: false, sharedAdapter, reasons };
  }

  if (!promotion.promote && !promotion.neutral) {
    reasons.push("No promotion verdict supplied yet.");
    return { decision: "hold", requiresHuman: false, sharedAdapter, reasons };
  }

  if (promotion.neutral && !promotion.promote) {
    reasons.push("Neutral sandbox changes require human review.");
    return { decision: "hold", requiresHuman: true, sharedAdapter, reasons };
  }

  reasons.push("Promotion criteria satisfied.");
  return { decision: "approve", requiresHuman: false, sharedAdapter, reasons };
}
