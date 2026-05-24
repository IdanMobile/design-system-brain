import React from "react";

type NavigationBarsProps = {
  mobile?: boolean;
};

type BottomTab = "home" | "search" | "create" | "profile";

const BOTTOM_TABS: { id: BottomTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "create", label: "Create" },
  { id: "profile", label: "Profile" }
];

type TopLink = "components" | "tokens" | "templates";

const TOP_LINKS: { id: TopLink; label: string; href: string }[] = [
  { id: "components", label: "Components", href: "#components" },
  { id: "tokens", label: "Tokens", href: "#tokens" },
  { id: "templates", label: "Templates", href: "#templates" }
];

export function NavigationBars({ mobile = false }: NavigationBarsProps) {
  const [activeTab, setActiveTab] = React.useState<BottomTab>("home");
  const [currentLink, setCurrentLink] = React.useState<TopLink | null>(null);
  const [ctaState, setCtaState] = React.useState<"idle" | "starting" | "started">(
    "idle"
  );

  if (mobile) {
    return (
      <div
        className="lab-bottom-nav"
        data-figma-component="NavigationBars"
        role="tablist"
      >
        {BOTTOM_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-pressed-managed="true"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  const handleCta = (): void => {
    if (ctaState !== "idle") return;
    setCtaState("starting");
    window.setTimeout(() => setCtaState("started"), 400);
  };

  const ctaLabel =
    ctaState === "starting" ? "Starting…" : ctaState === "started" ? "Started!" : "Get Started";

  return (
    <div className="lab-top-nav" data-figma-component="NavigationBars">
      <div className="brand">Orbital UI</div>
      <div className="links">
        {TOP_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            aria-current={currentLink === link.id ? "page" : undefined}
            data-active={currentLink === link.id ? "true" : "false"}
            onClick={(event) => {
              event.preventDefault();
              setCurrentLink((prev) => (prev === link.id ? null : link.id));
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
      <button
        className="cta"
        type="button"
        aria-pressed={ctaState !== "idle"}
        data-pressed-managed="true"
        data-state={ctaState}
        onClick={handleCta}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
