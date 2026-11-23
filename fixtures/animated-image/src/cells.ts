// The cells of the AnimatedImages composition, shared with the tests that check which image frame
// each cell shows: every cell is 160x180, four per row, with the image centred in it.
export interface Cell {
	file: string;
	playbackRate?: number;
	loopBehavior?: "loop" | "pause-after-finish" | "clear-after-finish";
	from?: number;
	trimBefore?: number;
	fit?: "fill" | "contain" | "cover";
	width: number;
	height: number;
}

export const CELLS: Cell[] = [
	{ file: "frames.gif", width: 100, height: 100 },
	{ file: "frames.png", width: 100, height: 100 },
	{ file: "frames.webp", width: 100, height: 100 },
	{ file: "frames.avif", width: 100, height: 100 },
	{ file: "frames.gif", playbackRate: 1.7, width: 100, height: 100 },
	{ file: "frames.gif", loopBehavior: "pause-after-finish", width: 100, height: 100 },
	{ file: "frames.gif", loopBehavior: "clear-after-finish", width: 100, height: 100 },
	{ file: "frames.webp", from: 10, trimBefore: 6, fit: "contain", width: 150, height: 100 },
];

export const CELL_WIDTH = 160;
export const CELL_HEIGHT = 180;
export const FPS = 30;
export const DURATION = 90;

/** Centre of cell `i` in the composition. */
export const cellCentre = (i: number) => ({
	x: (i % 4) * CELL_WIDTH + CELL_WIDTH / 2,
	y: Math.floor(i / 4) * CELL_HEIGHT + CELL_HEIGHT / 2,
});
