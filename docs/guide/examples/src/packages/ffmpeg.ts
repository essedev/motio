import { ensureFfmpeg, findFfmpeg } from "@motiojs/ffmpeg";

// region: api
const { ffmpeg, ffprobe, version, directory, downloaded } = await ensureFfmpeg({
	cacheDir: "/tmp/ffmpeg-cache", // default $MOTIO_FFMPEG_CACHE, else ~/.cache/motio/ffmpeg
	baseUrl: "https://mirror.example/ffmpeg", // default $MOTIO_FFMPEG_BASE_URL, else the release
	onProgress: ({ downloadedBytes, totalBytes }) =>
		console.log(`${downloadedBytes} of ${totalBytes} bytes`),
});
const installed = await findFfmpeg(); // never downloads; null when not installed yet
// endregion

export const all = [ffmpeg, ffprobe, version, directory, downloaded, installed];
