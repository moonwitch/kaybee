import { escHtml } from '../lib/html.ts'

/**
 * Per-site palettes. "sun" is the default :root palette in styles.css;
 * the others are token-override blocks at the bottom of the same file.
 */
export const THEMES = ['sun', 'sky', 'meadow', 'blossom', 'midnight'] as const
export type Theme = (typeof THEMES)[number]

/** THEME env var → validated theme name. Unknown values fall back to sun. */
export function activeTheme(): Theme {
  const wanted = (process.env.THEME ?? 'sun').trim().toLowerCase()
  return (THEMES as readonly string[]).includes(wanted)
    ? (wanted as Theme)
    : 'sun'
}

/**
 * Page shell — wraps every view.
 * Loads Geist fonts and the shared stylesheet.
 */
export function layout(opts: { title: string; body: string }): string {
  const theme = activeTheme()
  const themeAttr = theme === 'sun' ? '' : ` data-theme="${theme}"`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(opts.title)} · Loop Library</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body${themeAttr}>
<div class="app">
${opts.body}
</div>
</body>
</html>`
}
