import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(defineConfig({
  title: 'HIVE',
  description: 'HDI Intelligence & Value Engine — documentation',
  // cleanUrls is intentionally disabled: when embedded in the React frontend at /docs/,
  // Vite's SPA fallback would otherwise intercept extension-less paths.
  cleanUrls: false,
  lastUpdated: true,

  // Served under /docs/ inside the React frontend.
  base: '/docs/',
  // Build output goes into the frontend's public assets so Vite serves it at /docs/.
  outDir: '../hive_frontend/public/docs',
  // No need for full SPA fallback inside an iframe; keep the output minimal.
  emptyOutDir: true,

  markdown: {
    lineNumbers: true,
  },

  themeConfig: {
    siteTitle: 'HIVE Docs',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'API', link: '/api' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Guide',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Business findings', link: '/guide/findings' },
            { text: 'Production considerations', link: '/guide/production' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Architecture', link: '/architecture' },
            { text: 'API reference', link: '/api' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/muhamadrialdy/hive_project' },
    ],

    footer: {
      message: 'Built by Muhamad Rialdy',
      copyright: '© 2026 HIVE — HDI Intelligence & Value Engine',
    },

    search: {
      provider: 'local',
    },
  },

  mermaid: {
    theme: 'dark',
    // Render at natural size so labels stay readable. The .mermaid container
    // (see theme/custom.css) provides horizontal scroll when needed.
    flowchart: { useMaxWidth: false },
    sequence: { useMaxWidth: false },
    classDiagram: { useMaxWidth: false },
    erDiagram: { useMaxWidth: false },
  },
}));
