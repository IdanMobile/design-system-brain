export const LIBRARY_CONFIG = {
  mui: {
    packageDependencies: {
      '@mui/material': '^5.15.0',
      '@emotion/react': '^11.11.0',
      '@emotion/styled': '^11.11.0',
    },
    promptBlock: `## MUI Styling Rules

Allowed MUI aliases (never import from @mui/material directly):
MuiButton, MuiIconButton, MuiTypography, MuiBox, MuiStack, MuiCircularProgress

- Apply ALL visual styles via the sx prop: <MuiButton sx={{ px: 'var(--gap-md)', height: '40px' }}>
- Pseudo-states in sx: sx={{ '&:hover': { background: 'var(--color-primary-600)' }, '&:disabled': { opacity: 0.5 } }}
- Use variant="contained" | "outlined" | "text" matching the manifest base background.
- Never use makeStyles, styled(), or classes prop. No theme.palette references.`,
  },

  shadcn: {
    packageDependencies: {
      'class-variance-authority': '^0.7.0',
      'tailwindcss': '^3.4.0',
      'clsx': '^2.1.0',
      'tailwind-merge': '^2.2.0',
    },
    promptBlock: `## shadcn / Tailwind Styling Rules

Use cva() from class-variance-authority for variant management.
Use cn() (clsx + tailwind-merge) for conditional class merging.

- cva base + variants: const v = cva("base", { variants: { size: { sm: "h-8 px-3", md: "h-10 px-4" } } })
- CSS var arbitrary values: text-[var(--color-primary-500)] bg-[var(--color-surface)]
- States: hover:bg-[var(--color-primary-600)] disabled:opacity-50 disabled:pointer-events-none`,
  },

  radix: {
    packageDependencies: {
      '@radix-ui/react-primitive': '^2.0.0',
      '@radix-ui/react-slot': '^1.1.0',
    },
    promptBlock: `## Radix Styling Rules

Aliases: RadixPrimitive, RadixSlot

- Apply token values via style prop: style={{ backgroundColor: 'var(--color-primary-500)' }}
- Use data-state / data-disabled for interactive states.
- Use asChild for polymorphic composition.`,
  },

  daisyui: {
    packageDependencies: {
      'daisyui': '^4.0.0',
      'tailwindcss': '^3.4.0',
    },
    promptBlock: `## daisyUI Styling Rules

Base: daisyUI semantic classes (btn, btn-primary, card, input, badge).

- Map manifest background to nearest daisyUI class: btn-primary, btn-secondary, etc.
- Brand overrides: text-[var(--color-primary-500)]
- State classes: btn-disabled, btn-active, loading
- Sizes: btn-xs btn-sm btn-md btn-lg`,
  },
};

export function getLibraryConfig(library) {
  const config = LIBRARY_CONFIG[library];
  if (!config) throw new Error(`Unsupported library: "${library}". Supported: ${Object.keys(LIBRARY_CONFIG).join(', ')}`);
  return config;
}
