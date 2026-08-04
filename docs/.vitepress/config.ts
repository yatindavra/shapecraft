import { defineConfig } from "vitepress";

export default defineConfig({
  title: "shapecraft",
  description:
    "Structured output generation for LLMs in Node.js - token-level constraints for local models, native JSON modes for cloud APIs",
  base: "/shapecraft/",
  cleanUrls: true,
  lastUpdated: true,
  // Toggle enabled, defaulting first-time visitors to dark; the toggle's choice
  // persists in localStorage afterward.
  appearance: { initialValue: "dark" },

  // Favicon can't follow our own light/dark toggle (that's JS/page-scoped) - only
  // the OS/browser's own prefers-color-scheme, via the `media` attribute here. Two
  // variants, matched to the browser's own tab-bar color regardless of site theme.
  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: light)",
        href: "/shapecraft/favicon-light-32.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "48x48",
        media: "(prefers-color-scheme: light)",
        href: "/shapecraft/favicon-light-48.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: dark)",
        href: "/shapecraft/favicon-dark-32.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "48x48",
        media: "(prefers-color-scheme: dark)",
        href: "/shapecraft/favicon-dark-48.png",
      },
    ],
    ["link", { rel: "apple-touch-icon", href: "/shapecraft/apple-touch-icon.png" }],
  ],

  themeConfig: {
    // Object form follows our own toggle (the .dark class), not the OS preference.
    logo: { light: "/logo-light-64.png", dark: "/logo-dark-64.png" },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/options" },
      { text: "npm", link: "https://www.npmjs.com/package/@aviasole/shapecraft" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Schema Inputs", link: "/guide/schema-inputs" },
            { text: "Backends & Guarantee Levels", link: "/guide/backends" },
            { text: "Streaming", link: "/guide/streaming" },
            { text: "createClient() & Middleware", link: "/guide/client-middleware" },
            { text: "Batch Generation", link: "/guide/batch-generation" },
            { text: "Result Metadata", link: "/guide/result-metadata" },
            { text: "Timeouts & Cancellation", link: "/guide/timeouts-cancellation" },
            { text: "Pluggable JSON Schema Validation", link: "/guide/pluggable-validation" },
            { text: "Staged Validation Pipeline", link: "/guide/staged-validation-pipeline" },
            { text: "FHIR Presets", link: "/guide/fhir-presets" },
            { text: "Turnaround (multi-turn)", link: "/guide/turnaround" },
            { text: "Skill-Based Generation", link: "/guide/skill-based-generation" },
            { text: "Multi-agent Orchestration", link: "/guide/agentic" },
            { text: "Tool Calling", link: "/guide/tool-calling" },
            { text: "CLI", link: "/guide/cli" },
            { text: "Error Handling", link: "/guide/error-handling" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Options", link: "/reference/options" },
            { text: "Guarantees", link: "/reference/guarantees" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/aviasoletechnologies/shapecraft" }],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the Apache-2.0 License.",
      copyright: "Copyright (c) Aviasole Technologies",
    },
  },
});
