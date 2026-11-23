import { describe, expect, it } from "vitest";
import { compositionPageFactory } from "./page-factory.js";
import type { BrowserSession, VideoConfig } from "./session.js";

const composition = { id: "Main" } as VideoConfig;
const size = { width: 64, height: 36, scale: 1, transparent: false };
const session = (captureMethod: "begin-frame" | "screenshot") =>
	({ captureMethod }) as BrowserSession;

describe("compositionPageFactory", () => {
	it("refuses BeginFrame capture above concurrency 1", () => {
		expect(() =>
			compositionPageFactory(session("begin-frame"), composition, { ...size, concurrency: 4 }),
		).toThrow(expect.objectContaining({ code: "E_BEGIN_FRAME_UNSUPPORTED" }));
	});

	it("accepts BeginFrame at concurrency 1 and screenshots at any concurrency", () => {
		expect(
			compositionPageFactory(session("begin-frame"), composition, { ...size, concurrency: 1 }),
		).toBeTypeOf("function");
		expect(
			compositionPageFactory(session("screenshot"), composition, { ...size, concurrency: 8 }),
		).toBeTypeOf("function");
	});
});
