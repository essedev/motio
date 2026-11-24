// Frame numbers are drawn with a 3x5 bitmap font rather than FFmpeg's drawtext filter, which
// needs an FFmpeg built with libfreetype and a font file: the contact sheet must work with any
// FFmpeg that passes `motio doctor`.

/** Rows of each digit, 3 bits wide, top to bottom. */
const DIGITS: Record<string, readonly number[]> = {
	"0": [0b111, 0b101, 0b101, 0b101, 0b111],
	"1": [0b010, 0b110, 0b010, 0b010, 0b111],
	"2": [0b111, 0b001, 0b111, 0b100, 0b111],
	"3": [0b111, 0b001, 0b111, 0b001, 0b111],
	"4": [0b101, 0b101, 0b111, 0b001, 0b001],
	"5": [0b111, 0b100, 0b111, 0b001, 0b111],
	"6": [0b111, 0b100, 0b111, 0b101, 0b111],
	"7": [0b111, 0b001, 0b010, 0b010, 0b010],
	"8": [0b111, 0b101, 0b111, 0b101, 0b111],
	"9": [0b111, 0b101, 0b111, 0b001, 0b111],
};

export interface Label {
	/** Top-left corner of the label, in pixels. */
	x: number;
	y: number;
	/** Digits only. */
	text: string;
}

/**
 * Draws each label as white digits on a dark box into `rgba` (in place). `dot` is the size of
 * one font pixel; a label is `(4 * digits + 1) * dot` wide and `7 * dot` tall. Pixels outside
 * the image are skipped.
 */
export function drawLabels(
	rgba: Uint8Array,
	width: number,
	height: number,
	labels: readonly Label[],
	dot: number,
): void {
	const fill = (x0: number, y0: number, w: number, h: number, value: number) => {
		for (let y = Math.max(0, y0); y < Math.min(height, y0 + h); y++) {
			for (let x = Math.max(0, x0); x < Math.min(width, x0 + w); x++) {
				const i = (y * width + x) * 4;
				rgba[i] = value;
				rgba[i + 1] = value;
				rgba[i + 2] = value;
				rgba[i + 3] = 255;
			}
		}
	};
	for (const label of labels) {
		const digits = [...label.text].filter((c) => DIGITS[c]);
		fill(label.x, label.y, (4 * digits.length + 1) * dot, 7 * dot, 0);
		digits.forEach((digit, index) => {
			const rows = DIGITS[digit] as readonly number[];
			rows.forEach((bits, row) => {
				for (let column = 0; column < 3; column++) {
					if (bits & (0b100 >> column)) {
						fill(
							label.x + (1 + index * 4 + column) * dot,
							label.y + (1 + row) * dot,
							dot,
							dot,
							255,
						);
					}
				}
			});
		});
	}
}
