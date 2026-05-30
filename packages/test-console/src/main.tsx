import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./App.css";
import "./orchestrator-launch.css";
import "./fleet-console.css";

createRoot(document.getElementById("root")!).render(<App />);
