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

export function LoginPage({
  title = "Welcome back",
  subtitle = "Sign in to continue to your workspace.",
  email = "",
  password = ""
}: LoginPageProps) {
  return (
    <section className="lab-login-page" data-figma-component="LoginPage">
      <div className="lab-login-card">
        {loginIllustration}
        <h2>{title}</h2>
        <p>{subtitle}</p>

        <label htmlFor="lab-login-email">Email</label>
        <input id="lab-login-email" type="email" defaultValue={email} />

        <label htmlFor="lab-login-password">Password</label>
        <input id="lab-login-password" type="password" defaultValue={password} />

        <button className="lab-login-button" type="button">
          Login
        </button>

        <div className="lab-login-socials">
          <button className="lab-login-social-button" type="button">
            Connect with Google
          </button>
          <button className="lab-login-social-button" type="button">
            Connect with Facebook
          </button>
        </div>
      </div>
    </section>
  );
}
