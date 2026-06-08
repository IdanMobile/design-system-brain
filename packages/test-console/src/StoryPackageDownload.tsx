import { useEffect, useState } from "react";
import { safeStorySegment } from "./story-segment";

type PackageVariant = {
  available: boolean;
  building: boolean;
  variant: "semantic";
  label: string;
  storyId: string;
  component: string;
  name: string | null;
  version: string | null;
  file: string;
  href: string | null;
  args?: Record<string, unknown>;
  ingress?: string | null;
  usedComponents?: string[];
};

type StoryPackageState = {
  unsupported: boolean;
  storyId: string;
  component: string | null;
  package: PackageVariant | null;
};

function PackageCard({ pkg }: { pkg: PackageVariant }) {
  const installName = pkg.name ?? `@lab/story-${safeStorySegment(pkg.storyId)}`;
  const installCmd = `pnpm add ./${pkg.file}`;
  const versionLabel = pkg.version ? ` v${pkg.version}` : "";
  const argsKeys = Object.keys(pkg.args ?? {});
  const propsSpread = argsKeys.length > 0 ? " {...defaultStoryArgs}" : "";
  const used =
    pkg.usedComponents && pkg.usedComponents.length > 0
      ? pkg.usedComponents.join(", ")
      : pkg.component;

  return (
    <div className="item-detail-package-card">
      <h3 className="item-detail-package-card-title">{pkg.label}</h3>
      <p className="item-detail-package-card-desc">
        Semantic React delivery — real <code>@lab/ui</code> components ({used}
        {pkg.ingress ? `, ingress: ${pkg.ingress}` : ""}).
      </p>
      {pkg.building ? (
        <p className="item-detail-package-status" aria-live="polite">
          Building…
        </p>
      ) : pkg.available && pkg.href ? (
        <a className="item-detail-package-btn" href={pkg.href} download={pkg.file}>
          Download {pkg.file}
          {versionLabel}
        </a>
      ) : (
        <p className="item-detail-package-status">Not ready — run delivery or wait for fix loop.</p>
      )}
      <details className="item-detail-package-details">
        <summary>Install in your app</summary>
        <pre>{`pnpm add @lab/ui
${installCmd}

import "@lab/ui/styles.css";
import { ${pkg.component}, defaultStoryArgs } from "${installName}";

export function Example() {
  return <${pkg.component}${propsSpread} />;
}`}</pre>
      </details>
    </div>
  );
}

export function StoryPackageDownload({ storyId }: { storyId: string }) {
  const [state, setState] = useState<StoryPackageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}/package-download`);
        if (!res.ok) throw new Error("package-download unavailable");
        const data = (await res.json()) as StoryPackageState;
        if (!cancelled) setState(data);
        const building = Boolean(data.package?.building);
        if (!cancelled && building) {
          if (!timer) timer = setInterval(refresh, 2000);
        } else if (timer) {
          clearInterval(timer);
          timer = undefined;
        }
      } catch {
        if (!cancelled) {
          setState({
            unsupported: true,
            storyId,
            component: null,
            package: null
          });
        }
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [storyId]);

  if (!state || state.unsupported || !state.package) return null;

  return (
    <section className="item-detail-package" aria-labelledby={`story-package-${safeStorySegment(storyId)}`}>
      <h2 id={`story-package-${safeStorySegment(storyId)}`}>Download package</h2>
      <p className="item-detail-package-intro">
        One semantic React tarball for <code>{state.component}</code> — rebuilt when delivery tests or
        fixers update this story.
      </p>
      <div className="item-detail-package-grid">
        <PackageCard pkg={state.package} />
      </div>
    </section>
  );
}
