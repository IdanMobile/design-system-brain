import "./styles.css";
export { Screen1 } from "./components/Screen1/Screen1";
import storyMetaJson from "./story-meta.json";

export const storyMeta = storyMetaJson;
export const defaultStoryArgs = storyMetaJson.args as Record<string, unknown>;
