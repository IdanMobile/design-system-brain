# @lab/ui

Delivery package for the Storybook-to-Figma lab — the same React components used in Storybook fixtures, the Delivery showcase (`http://127.0.0.1:6108/?view=showcase`), and Figma validation.

## Install from tarball

After downloading from the showcase (or running `pnpm pack:ui` in the monorepo):

```bash
pnpm add ./lab-ui-0.1.0.tgz
# npm install ./lab-ui-0.1.0.tgz
```

## Usage

```tsx
import "@lab/ui/styles.css";
import { FeatureCard, Button, MUIShowcase } from "@lab/ui";

export function App() {
  return (
    <>
      <FeatureCard title="Hello" description="From the delivery package" />
      <Button variant="primary">Click</Button>
    </>
  );
}
```

## Requirements

- **Peer:** `react`, `react-dom` (^18.3)
- **MUI stories:** `@mui/material`, `@emotion/react`, `@emotion/styled` (listed as dependencies; install in your app if you use `MUIShowcase`, `MUIWorkspaceScreen`, etc.)

This package ships TypeScript source. Use Vite, Next.js (with transpilePackages), or equivalent so `.tsx` in `node_modules/@lab/ui` is compiled.
