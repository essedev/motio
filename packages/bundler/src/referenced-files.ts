import { existsSync } from "node:fs";
import { isFileServingAllowed, type Plugin, type ResolvedConfig } from "vite";

/** A `/@fs/` URL in transformed code: how the dev server refers to a file outside its root. */
const FS_URL = /\/@fs(\/[^"'`()\s?#\\]+)/g;

/** The file path of the path part of a `/@fs/` URL, or null when it does not decode. */
function filePathOf(urlPath: string): string | null {
	let path: string;
	try {
		path = decodeURIComponent(urlPath);
	} catch {
		return null;
	}
	if (path.includes("\0")) return null;
	// `/@fs/C:/x` names `C:/x` on Windows.
	return process.platform === "win32" && /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
}

/**
 * Lets the dev server serve every file the project's code references, wherever it is, as the
 * bundle of a render includes it. Vite serves the modules a project imports, but an asset outside
 * the allowed directories (the project, or its workspace) that only a CSS `url()` or a
 * `new URL(..., import.meta.url)` references is refused: the preview would miss a font or an
 * image that renders fine. Each such file is added to `server.fs.allow` as its referencing module
 * is transformed; `server.fs.deny` still wins. A refused request for a file that exists is
 * reported through `onRefused`.
 */
export function allowReferencedFiles(onRefused: (file: string) => void): Plugin {
	let config: ResolvedConfig | undefined;
	return {
		name: "motio:allow-referenced-files",
		apply: "serve",
		// After Vite rewrote CSS `url()` and `new URL()` references to `/@fs/` URLs.
		enforce: "post",
		configResolved(resolved) {
			config = resolved;
		},
		transform(code) {
			if (!config || !code.includes("/@fs/")) return null;
			const allow = config.server.fs.allow;
			for (const match of code.matchAll(FS_URL)) {
				const file = filePathOf(match[1] as string);
				if (file && !allow.includes(file)) allow.push(file);
			}
			return null;
		},
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				const url = req.url ?? "";
				if (url.startsWith("/@fs/") && !isFileServingAllowed(url, server)) {
					const file = filePathOf(url.slice(4).split("?")[0] as string);
					if (file && existsSync(file)) onRefused(file);
				}
				next();
			});
		},
	};
}
