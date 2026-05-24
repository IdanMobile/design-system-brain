import React, { useEffect, useState } from "react";

type PackageMeta = {
  name: string;
  version: string;
  files: { versioned: string; latest: string };
};

const FALLBACK: PackageMeta = {
  name: "@lab/ui",
  version: "0.1.0",
  files: { versioned: "lab-ui-0.1.0.tgz", latest: "lab-ui.tgz" }
};

export function PackageDownload() {
  const [meta, setMeta] = useState<PackageMeta>(FALLBACK);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/downloads/meta.json");
        if (!res.ok) throw new Error("meta missing");
        const data = (await res.json()) as PackageMeta;
        if (!cancelled) setMeta(data);
        const tarball = await fetch(`/downloads/${data.files.latest}`, { method: "HEAD" });
        if (!cancelled) setAvailable(tarball.ok);
      } catch {
        if (!cancelled) {
          setMeta(FALLBACK);
          const tarball = await fetch(`/downloads/${FALLBACK.files.latest}`, { method: "HEAD" });
          if (!cancelled) setAvailable(tarball.ok);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const versionedHref = `/downloads/${meta.files.versioned}`;
  const latestHref = `/downloads/${meta.files.latest}`;
  const installCmd = `pnpm add ./${meta.files.versioned}`;

  return (
    <aside className="showcase-download" aria-labelledby="showcase-download-title">
      <div className="showcase-download-copy">
        <h2 id="showcase-download-title">Use in your project</h2>
        <p>
          This showcase renders <code>{meta.name}</code> — the same delivery package used in
          Storybook and delivery tests. Download the tarball and install it in any React app.
        </p>
      </div>
      <div className="showcase-download-actions">
        {available === false ? (
          <p className="showcase-download-missing">
            Package not built yet. From the repo run{" "}
            <code>pnpm pack:ui</code> or <code>pnpm playground:build</code>, then refresh.
          </p>
        ) : (
          <>
            <a
              className="showcase-download-btn primary"
              href={versionedHref}
              download={meta.files.versioned}
            >
              Download {meta.name} v{meta.version}
            </a>
            <a className="showcase-download-btn secondary" href={latestHref} download="lab-ui.tgz">
              Latest alias
            </a>
          </>
        )}
        <details className="showcase-download-details">
          <summary>Install &amp; import</summary>
          <pre>{`${installCmd}

# In your app entry (once):
import "@lab/ui/styles.css";

# Components:
import { FeatureCard, Button } from "${meta.name}";`}</pre>
          <p className="showcase-download-note">
            Requires React 18+. MUI-based screens need <code>@mui/material</code> and Emotion in
            your app. See <a href="/downloads/INSTALL.txt">INSTALL.txt</a> in the download folder.
          </p>
        </details>
      </div>
    </aside>
  );
}
