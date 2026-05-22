import { resolve } from "node:path";
import { refreshMasterPortfolio } from "./report-portfolio.ts";

const repoRoot = resolve(process.cwd(), "../..");
await refreshMasterPortfolio(repoRoot);
console.log(`Portfolio: ${resolve(repoRoot, "test-portfolio/report.html")}`);
