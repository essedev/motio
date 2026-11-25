import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";

// What the page's Date and Intl see: Motio pins the time zone of every render (UTC unless the
// timeZone option names another), so local-time code gives the same pixels on every machine.

type Props = { zone: string; hour: number; workerZone: string };

/** The zone the page and a dedicated worker report, and the local hour of 12:00 UTC. */
export const timeZoneMetadata: CalculateMetadataFunction<Props> = async () => {
	const source = "postMessage(Intl.DateTimeFormat().resolvedOptions().timeZone)";
	const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
	const workerZone = await new Promise<string>((resolve) => {
		worker.onmessage = (event: MessageEvent<string>) => resolve(event.data);
	});
	worker.terminate();
	return {
		props: {
			zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			hour: new Date(Date.UTC(2026, 0, 1, 12)).getHours(),
			workerZone,
		},
	};
};

/** A bar as long as the local hour of a fixed instant, computed while the frame renders. */
export function TimeZone() {
	const hour = new Date(Date.UTC(2026, 0, 1, 12)).getHours();
	return (
		<AbsoluteFill style={{ background: "black" }}>
			<div style={{ width: hour * 10, height: 20, background: "white" }} />
		</AbsoluteFill>
	);
}
