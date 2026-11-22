// Stand-in for `@motiojs/core/runtime`: renders the registered root to a string and exposes
// what the page saw, so tests can run the built bundle in Node.
import { createElement } from "react";
import { renderToString } from "react-dom/server.browser";
import { getRegisteredRoot } from "./fake-motio.js";

export async function mountPage() {
	const Root = getRegisteredRoot();
	globalThis.__fakeRuntime = {
		html: renderToString(createElement(Root)),
		env: process.env,
		bundle: globalThis.__motioBundle,
	};
}
