import riveModule, { type RiveCanvas } from "@rive-app/canvas-advanced";

// The runtime is an ES module whose default export is the factory, but its package declares no
// module type, so TypeScript reads the declarations as CommonJS and types the default import as
// the whole module.
const createRiveCanvas = riveModule as unknown as (options: {
	locateFile(file: string): string;
}) => Promise<RiveCanvas>;

/**
 * Version of `@rive-app/canvas-advanced` this package depends on: the published `@remotion/rive`
 * 4.0.545 pins the same one. Its WebAssembly module is loaded from the URL below, where the
 * published package loads it (observed in its network requests, D-061).
 */
export const RIVE_RUNTIME_VERSION = "2.31.5";

/** Where the runtime's WebAssembly module is downloaded from. */
export const RIVE_WASM_URL = `https://unpkg.com/@rive-app/canvas-advanced@${RIVE_RUNTIME_VERSION}/rive.wasm`;

let runtime: Promise<RiveCanvas> | null = null;

/** The Rive runtime, initialised once per page. A failed initialisation is retried next time. */
export function loadRiveRuntime(): Promise<RiveCanvas> {
	if (!runtime) {
		runtime = createRiveCanvas({ locateFile: () => RIVE_WASM_URL }).catch((error: unknown) => {
			runtime = null;
			throw new Error(
				`The Rive runtime could not be initialised from ${RIVE_WASM_URL}: ${error instanceof Error ? error.message : String(error)}. Check that the page can reach that URL.`,
				{ cause: error },
			);
		});
	}
	return runtime;
}
