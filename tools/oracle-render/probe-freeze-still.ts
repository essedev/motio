// What a real render by the published Remotion shows for <Freeze> beyond the duration of the
// composition: renderStill of a <Still> (one frame) and of frame 10 of a 30-frame composition, with
// a probe that posts the text the page shows to a local server. Confirms that the timeline values
// tools/oracle/record-freeze.mjs records inside @remotion/player's <Thumbnail> hold in the renderer
// too. Prints JSON, writes nothing. Run: node probe-freeze-still.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const here = import.meta.dirname;
const reports: Record<string, unknown> = {};
const server = createServer((req, res) => {
	let body = "";
	req.on("data", (chunk) => {
		body += chunk;
	});
	req.on("end", () => {
		const who = new URL(req.url ?? "/", "http://localhost").searchParams.get("who") ?? "?";
		if (req.method === "POST") reports[who] = body;
		res.writeHead(204, { "access-control-allow-origin": "*" }).end();
	});
});
await new Promise<void>((done) => server.listen(0, done));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const entry = `
import { useEffect, useState } from "react";
import {
	AbsoluteFill, Composition, continueRender, delayRender, Freeze, registerRoot, Sequence, Still,
	useCurrentFrame, useVideoConfig,
} from "remotion";
const Probe = ({ name }) => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return <span>{"[" + name + " f=" + frame + " d=" + durationInFrames + "]"}</span>;
};
const Scene = ({ id }) => {
	const [handle] = useState(() => delayRender("probe"));
	useEffect(() => {
		fetch("http://localhost:${port}/?who=" + id, {
			method: "POST",
			body: document.getElementById("probe").textContent,
		}).then(() => continueRender(handle));
	}, [handle]);
	return (
		<AbsoluteFill id="probe">
			<Freeze frame={90}>
				<Probe name="direct" />
				<Sequence><Probe name="sequence" /></Sequence>
				<Sequence from={60}><Probe name="from60" /></Sequence>
				<Sequence from={-90}><Probe name="fromMinus90" /></Sequence>
			</Freeze>
		</AbsoluteFill>
	);
};
registerRoot(() => (
	<>
		<Still id="still" component={Scene} defaultProps={{ id: "still" }} width={16} height={16} />
		<Composition id="short" component={Scene} defaultProps={{ id: "short" }} width={16} height={16} fps={30} durationInFrames={30} />
	</>
));
`;

const work = mkdtempSync(join(tmpdir(), "motio-probe-freeze-"));
try {
	mkdirSync(join(here, ".work-probe-freeze/src"), { recursive: true });
	writeFileSync(join(here, ".work-probe-freeze/src/index.tsx"), entry);
	const serveUrl = await bundle({ entryPoint: join(here, ".work-probe-freeze/src/index.tsx") });
	for (const [id, frame] of [
		["still", 0],
		["short", 10],
	] as const) {
		const composition = await selectComposition({ serveUrl, id });
		await renderStill({ serveUrl, composition, frame, output: join(work, `${id}.png`) });
	}
} finally {
	server.close();
	rmSync(work, { recursive: true, force: true });
	rmSync(join(here, ".work-probe-freeze"), { recursive: true, force: true });
}
console.log(JSON.stringify(reports, null, "\t"));
process.exit(0);
