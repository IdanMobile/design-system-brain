#!/usr/bin/env node
/** Stream a test-console job's logs to stdout (for Terminal.app while the server runs the job). */
import { fileURLToPath } from "node:url";

const UI = process.env.TEST_CONSOLE_UI ?? "http://127.0.0.1:6110";

async function streamJob(jobId) {
  for (const base of ["http://127.0.0.1:6111", UI]) {
    try {
      const res = await fetch(`${base}/api/jobs/${jobId}/stream`);
      if (!res.ok || !res.body) continue;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const msg = JSON.parse(dataLine.slice(6));
          if (msg.type === "log") process.stdout.write(msg.text);
          if (msg.type === "done") process.exit(msg.exitCode ?? 0);
        }
      }
      return;
    } catch {
      /* try next base */
    }
  }
  console.error(`[watch-job] Could not stream job ${jobId}`);
  process.exit(1);
}

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: test-console-watch-job.mjs <jobId>");
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await streamJob(jobId);
}
