import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The workspace sources are aliased so the fixture builds without building the packages first.
export default defineConfig({
	base: "./",
	plugins: [react()],
	resolve: {
		alias: {
			"@motiojs/core/protocol": src("../../packages/core/src/protocol.ts"),
			"@motiojs/testing/frame-stamp": src("../../packages/testing/src/frame-stamp.ts"),
		},
		dedupe: ["react", "react-dom"],
	},
	build: { outDir: "dist", emptyOutDir: true, minify: false },
});
