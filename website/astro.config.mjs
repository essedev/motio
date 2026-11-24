// @ts-check
import { satteri } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { codeTheme } from "./src/brand/code-theme.ts";
import { cliSidebar } from "./src/lib/cli-reference.ts";
import { guideSidebar, packagePages } from "./src/lib/pages.ts";
import { REPO_URL, SITE_URL } from "./src/lib/repo.ts";
import { repoLinksPlugin } from "./src/lib/repo-links.ts";

const OG_IMAGE = `${SITE_URL}/og/motio-card.png`;

// https://astro.build/config
export default defineConfig({
	site: SITE_URL,
	trailingSlash: "always",
	// Astro 7 compression drops the space between text and an inline element on the next line.
	compressHTML: false,
	markdown: {
		processor: satteri({ mdastPlugins: [repoLinksPlugin] }),
	},
	integrations: [
		starlight({
			title: "Motio",
			description: "Make videos with React. Open source, Apache-2.0.",
			favicon: "/favicon.svg",
			disable404Route: true,
			head: [
				{ tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "32x32" } },
				{ tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
				{ tag: "link", attrs: { rel: "manifest", href: "/site.webmanifest" } },
				{ tag: "meta", attrs: { name: "theme-color", content: "#2A0E2E" } },
				{ tag: "meta", attrs: { property: "og:image", content: OG_IMAGE } },
				{ tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
				{ tag: "meta", attrs: { property: "og:image:height", content: "630" } },
				{
					tag: "meta",
					attrs: {
						property: "og:image:alt",
						content: "Motio: make videos with React. Open source.",
					},
				},
				{ tag: "meta", attrs: { name: "twitter:image", content: OG_IMAGE } },
			],
			social: [{ icon: "github", label: "GitHub", href: REPO_URL }],
			customCss: ["./src/styles/fonts.css", "./src/styles/tokens.css", "./src/styles/docs.css"],
			components: {
				SiteTitle: "./src/components/docs/SiteTitle.astro",
			},
			markdown: {
				// The pages are read from the repository, outside src/content: let Starlight's
				// heading anchors and asides run on them too.
				processedDirs: ["../docs/guide", "../packages"],
			},
			expressiveCode: {
				themes: [codeTheme],
				useStarlightDarkModeSwitch: false,
				useStarlightUiThemeColors: false,
				styleOverrides: {
					borderRadius: "10px",
					borderColor: "transparent",
					codeFontFamily: "var(--font-mono)",
					uiFontFamily: "var(--font-sans)",
					codeFontSize: "0.86rem",
					frames: {
						frameBoxShadowCssValue: "none",
						terminalTitlebarBackground: "#1C0B1F",
						terminalBackground: "#2A0E2E",
						editorTabBarBackground: "#1C0B1F",
						editorActiveTabBackground: "#2A0E2E",
						inlineButtonBorder: "#BEA9C1",
						inlineButtonForeground: "#F6EFF4",
					},
				},
			},
			sidebar: [
				{ label: "Guide", items: guideSidebar() },
				{ label: "CLI reference", collapsed: true, items: cliSidebar() },
				{
					label: "Packages",
					collapsed: true,
					items: packagePages().map((p) => ({ label: p.name, slug: p.slug })),
				},
			],
		}),
	],
});
