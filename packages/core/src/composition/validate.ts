/** Characters allowed in composition ids and folder names. */
const NAME_PATTERN = /^[a-zA-Z0-9\-一-鿿]+$/;

/** Throws unless `id` is a valid composition id. */
export function validateCompositionId(id: unknown): asserts id is string {
	if (typeof id !== "string" || id.length === 0) {
		throw new Error(`A composition needs an "id" string, got ${JSON.stringify(id)}.`);
	}
	if (!NAME_PATTERN.test(id)) {
		throw new Error(
			`Composition id "${id}" is invalid: it can only contain a-z, A-Z, 0-9, CJK characters and "-".`,
		);
	}
}

/** Throws unless `name` is a valid folder name. */
export function validateFolderName(name: unknown): asserts name is string {
	if (typeof name !== "string" || name.length === 0) {
		throw new Error(`<Folder> needs a "name" string, got ${JSON.stringify(name)}.`);
	}
	if (!NAME_PATTERN.test(name)) {
		throw new Error(
			`Folder name "${name}" is invalid: it can only contain a-z, A-Z, 0-9, CJK characters and "-".`,
		);
	}
}

/** Throws unless `value` is a positive integer; `where` names the composition and field. */
export function validatePositiveInteger(value: unknown, where: string): asserts value is number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${where} must be a positive integer, got ${String(value)}.`);
	}
}

/** Throws unless `value` is a positive finite number. */
export function validateFps(value: unknown, where: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${where} must be a positive number, got ${String(value)}.`);
	}
}

/** Throws unless `value` is a plain object usable as props. */
export function validatePropsObject(
	value: unknown,
	where: string,
): asserts value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			`${where} must be an object, got ${Array.isArray(value) ? "an array" : String(value)}.`,
		);
	}
}
