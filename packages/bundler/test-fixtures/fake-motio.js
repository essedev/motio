// Stand-in for the `motio` package while @motiojs/core is being written: just enough for
// the bundler tests (registerRoot, staticFile with Remotion's encoding).
let registeredRoot = null;

export const registerRoot = (component) => {
	registeredRoot = component;
};

export const getRegisteredRoot = () => registeredRoot;

export const staticFile = (path) =>
	`${globalThis.__motioBundle.staticBase}/${path
		.split("/")
		.filter(Boolean)
		.map(encodeURIComponent)
		.join("/")}`;
