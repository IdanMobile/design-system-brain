/**
 * Maps Figma screen entry ids to Storybook delivery story ids (for 4-way capture).
 */
export const FIGMA_SCREEN_STORY_MAP = {
  screen_1: "lab-screen1--default",
  screen_notification_avater: "lab-screennotificationavater--default",
};

export function storyIdForScreen(screenId) {
  return FIGMA_SCREEN_STORY_MAP[screenId] ?? null;
}
