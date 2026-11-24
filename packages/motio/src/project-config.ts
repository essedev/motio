/**
 * `@motiojs/motio/config`: the types of `motio.config.ts` and `defineConfig`, which types the
 * file's default export. No runtime dependency: a config file loads without React.
 *
 * ```ts
 * import { defineConfig } from "@motiojs/motio/config";
 * export default defineConfig({ render: { codec: "h264", crf: 18 } });
 * ```
 */
export {
	type AudioCodec,
	type BrowserConfig,
	type CaptureMethod,
	type ChromiumConfig,
	type Codec,
	type ColorSpace,
	type Concurrency,
	type DevConfig,
	defineConfig,
	type FfmpegConfig,
	type GlRenderer,
	type LogLevel,
	type MotioConfig,
	type PixelFormat,
	type ProResProfile,
	type RenderConfig,
	type StillConfig,
	type StillImageFormat,
	type TimeModel,
	type VideoImageFormat,
	type ViteConfig,
	type X264Preset,
} from "@motiojs/core/config";
