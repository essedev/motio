import { defineConfig } from "@motiojs/motio/config";

// region: full
export default defineConfig({
	entryPoint: "src/index.ts",
	publicDir: "public",
	outDir: "out",
	render: { codec: "h264", crf: 18, concurrency: "50%", imageFormat: "jpeg", muted: false },
	still: { imageFormat: "png", scale: 1 },
	browser: { timeoutMs: 30_000, chromiumOptions: { gl: "swiftshader" } },
	dev: { port: 3000, open: true },
	// Extend Vite: change the configuration and return it.
	vite: (config) => ({ ...config, define: { ...config.define, __BUILD_ID__: '"local"' } }),
});
// endregion
