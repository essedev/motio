import { useVideoConfig } from "@motiojs/motio";

/** The frame's shape: scenes recompose for vertical video instead of being cropped. */
export const useLayout = () => {
	const { width, height } = useVideoConfig();
	return { tall: height > width, width, height };
};
