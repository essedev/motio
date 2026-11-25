import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";

// What the page reads of its language: Motio pins it for every render (en-US unless the locale
// option names another), so text formatted for the reader's language is the same on every
// machine. `echoUrl`, when given, answers with the request's Accept-Language header.

type Props = {
	echoUrl: string;
	language: string;
	languages: string[];
	intl: string;
	number: string;
	workerLanguage: string;
	workerIntl: string;
	acceptLanguage: string;
};

/** The language the page and a dedicated worker report, and the header a request carries. */
export const localeMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
	const source =
		"postMessage([navigator.language, Intl.DateTimeFormat().resolvedOptions().locale])";
	const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
	const [workerLanguage, workerIntl] = await new Promise<string[]>((resolve) => {
		worker.onmessage = (event: MessageEvent<string[]>) => resolve(event.data);
	});
	worker.terminate();
	const acceptLanguage = props.echoUrl ? await (await fetch(props.echoUrl)).text() : "";
	return {
		props: {
			...props,
			language: navigator.language,
			languages: [...navigator.languages],
			intl: Intl.DateTimeFormat().resolvedOptions().locale,
			number: (1234.5).toLocaleString(),
			workerLanguage: workerLanguage ?? "",
			workerIntl: workerIntl ?? "",
			acceptLanguage,
		},
	};
};

/** A number formatted in the page's locale, as text. */
export function Locale() {
	return (
		<AbsoluteFill style={{ background: "black", color: "white", fontSize: 20 }}>
			{(1234.5).toLocaleString()}
		</AbsoluteFill>
	);
}
