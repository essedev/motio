import { defineConfig, type RenderConfig } from "@motiojs/core/config";

// TypeScript syntax on purpose: the loader compiles the file as the bundler does.
const render: RenderConfig = { codec: "h264", crf: 18, concurrency: "50%" };

export default defineConfig({
	entryPoint: "src/index.ts",
	outDir: "renders",
	render,
	still: { imageFormat: "png", scale: 2 },
	vite: (config) => ({ ...config, define: { ...config.define, FIXTURE: "1" } }),
});
