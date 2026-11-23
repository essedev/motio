/**
 * `@motiojs/motion-blur`, the equivalent of `@remotion/motion-blur`: `<HtmlInCanvasMotionBlur>`
 * (through Chrome's HTML-in-canvas API), `<CameraMotionBlur>` and `<Trail>`.
 */
export { CameraMotionBlur, type CameraMotionBlurProps } from "./camera-motion-blur.js";
export {
	HtmlInCanvasMotionBlur,
	type HtmlInCanvasMotionBlurProps,
	motionBlurSampleFrames,
} from "./html-in-canvas-motion-blur.js";
export { Trail, type TrailProps } from "./trail.js";
