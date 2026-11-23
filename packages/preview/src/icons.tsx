import type { ReactNode } from "react";

const icon = (path: ReactNode) => (
	<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
		{path}
	</svg>
);

/** Small inline icons for the toolbar; no icon font, no dependency. */
export const Icons = {
	play: icon(<path d="M4 2.5v11l9-5.5z" />),
	pause: icon(<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />),
	stepBack: icon(<path d="M4 3h2v10H4zM13 3v10L6.5 8z" />),
	stepForward: icon(<path d="M10 3h2v10h-2zM3 3v10l6.5-5z" />),
	first: icon(<path d="M2.5 3h2v10h-2zM9 3v10L4.5 8zM14 3v10L9.5 8z" />),
	last: icon(<path d="M11.5 3h2v10h-2zM7 3v10l4.5-5zM2 3v10l4.5-5z" />),
};
