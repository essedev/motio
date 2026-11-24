import { defineConfig } from "@motiojs/motio/config";

// Settings of the motio commands. Flags win over them, and so do MOTIO_* environment variables
// such as MOTIO_CONCURRENCY. Every key is optional and typed: hover one in the editor, or see
// the Configuration page of the Motio guide for the full list.
export default defineConfig({
	entryPoint: "src/index.ts",
	render: {
		// codec: "h264", // by default from the output extension: .mp4, .webm, .mov, .gif
		// crf: 18, // quality: lower is better and bigger
	},
	// still: { imageFormat: "png" },
	// dev: { port: 3000 },
});
