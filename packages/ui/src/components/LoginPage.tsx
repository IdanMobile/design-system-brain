import React from "react";

type LoginPageProps = {
  title?: string;
  subtitle?: string;
  email?: string;
  password?: string;
};

const loginIllustration = (
  <svg
    className="lab-login-image"
    width="360"
    height="220"
    viewBox="0 0 360 220"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width="360" height="220" rx="22" fill="#DCEBFF" />
    <circle cx="72" cy="66" r="30" fill="#95BEFF" />
    <rect x="118" y="52" width="176" height="16" rx="8" fill="#89B2F4" />
    <rect x="118" y="82" width="132" height="12" rx="6" fill="#9ABCEC" />
    <rect x="50" y="124" width="260" height="58" rx="14" fill="white" />
    <rect x="70" y="145" width="160" height="12" rx="6" fill="#D6E4F8" />
    <circle cx="278" cy="152" r="16" fill="#0F6DFF" />
    <path
      d="M272 152.5L276 157L285 148"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type SignInPhase = "idle" | "submitting" | "signed-in";
type SocialState = Record<string, "idle" | "connecting" | "connected">;

export function LoginPage({
  title = "Welcome back",
  subtitle = "Sign in to continue to your workspace.",
  email = "",
  password = ""
}: LoginPageProps) {
  const [emailValue, setEmailValue] = React.useState(email);
  const [passwordValue, setPasswordValue] = React.useState(password);
  const [phase, setPhase] = React.useState<SignInPhase>("idle");
  const [socials, setSocials] = React.useState<SocialState>({
    google: "idle",
    facebook: "idle"
  });

  const handleSubmit = (): void => {
    if (phase !== "idle") return;
    setPhase("submitting");
    window.setTimeout(() => setPhase("signed-in"), 400);
  };

  const connectSocial = (provider: keyof SocialState) => () => {
    setSocials((prev) => ({ ...prev, [provider]: "connecting" }));
    window.setTimeout(
      () =>
        setSocials((prev) => ({
          ...prev,
          [provider]: "connected"
        })),
      400
    );
  };

  const heading =
    phase === "signed-in" ? `Signed in as ${emailValue || "you"}` : title;
  const helper =
    phase === "signed-in"
      ? "Loading your workspace…"
      : phase === "submitting"
        ? "Verifying credentials…"
        : subtitle;
  const submitLabel =
    phase === "signed-in"
      ? "Signed in"
      : phase === "submitting"
        ? "Signing in…"
        : "Login";

  const socialLabel = (provider: keyof SocialState, base: string): string => {
    const s = socials[provider];
    if (s === "connecting") return `Connecting to ${base}…`;
    if (s === "connected") return `Connected to ${base}`;
    return `Connect with ${base}`;
  };

  return (
    <section
      className="lab-login-page"
      data-figma-component="LoginPage"
      data-phase={phase}
    >
      <div className="lab-login-card">
        {loginIllustration}
        <h2>{heading}</h2>
        <p>{helper}</p>

        <label htmlFor="lab-login-email">Email</label>
        <input
          id="lab-login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={emailValue}
          onChange={(event) => setEmailValue(event.target.value)}
          disabled={phase !== "idle"}
        />

        <label htmlFor="lab-login-password">Password</label>
        <input
          id="lab-login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={passwordValue}
          onChange={(event) => setPasswordValue(event.target.value)}
          disabled={phase !== "idle"}
        />

        <button
          className="lab-login-button"
          type="button"
          aria-busy={phase === "submitting"}
          data-pressed-managed="true"
          disabled={phase !== "idle"}
          onClick={handleSubmit}
        >
          {submitLabel}
        </button>

        <div className="lab-login-socials">
          <button
            className="lab-login-social-button"
            type="button"
            aria-pressed={socials.google !== "idle"}
            data-pressed-managed="true"
            data-state={socials.google}
            onClick={connectSocial("google")}
          >
            {socialLabel("google", "Google")}
          </button>
          <button
            className="lab-login-social-button"
            type="button"
            aria-pressed={socials.facebook !== "idle"}
            data-pressed-managed="true"
            data-state={socials.facebook}
            onClick={connectSocial("facebook")}
          >
            {socialLabel("facebook", "Facebook")}
          </button>
        </div>
      </div>
    </section>
  );
}
