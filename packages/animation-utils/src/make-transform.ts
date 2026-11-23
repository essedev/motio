/**
 * Joins transform functions built with `translate()`, `rotate()`, ... into one CSS `transform`
 * value, separated by spaces: `makeTransform([rotate(45), translate(50, 50)])` is
 * `"rotate(45deg) translate(50px, 50px)"`.
 */
export function makeTransform(transforms: readonly string[]): string {
	return transforms.join(" ");
}
