import "./styles.css";
export { Button } from "./components/Button/Button";
import storyMetaJson from "./story-meta.json";

export const storyMeta = storyMetaJson;
export const defaultStoryArgs = storyMetaJson.args as Record<string, unknown>;
