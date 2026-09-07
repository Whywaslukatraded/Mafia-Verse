export default {
  plugins: {
    // Bug fix: `tailwindcss: {}` here directly as a PostCSS plugin no
    // longer works on Tailwind v4 — that plugin moved to a separate
    // @tailwindcss/postcss package. Rather than adding yet another
    // dependency, Tailwind is now processed via the @tailwindcss/vite
    // plugin (wired into vite.config.ts) instead, which was already an
    // installed dependency going unused. PostCSS now only handles
    // autoprefixer, unchanged from before.
    autoprefixer: {},
  },
}
