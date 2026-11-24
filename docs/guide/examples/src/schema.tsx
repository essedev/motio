import { AbsoluteFill, Composition } from "@motiojs/motio";
import { zColor } from "@motiojs/zod-types";
import { z } from "zod";

// region: schema
// The shape of the props, written once: the preview checks the props editor against it, a render
// reports props that do not match, and TypeScript gets the props type from it.
export const offerSchema = z.object({
	product: z.string().min(1),
	price: z.number().positive(),
	accent: zColor(),
	features: z.array(z.string()).max(4),
});

type OfferProps = z.infer<typeof offerSchema>;

const Offer = ({ product, price, accent, features }: OfferProps) => (
	<AbsoluteFill style={{ backgroundColor: "#101820", color: "white", padding: 96 }}>
		<h1 style={{ fontSize: 110, color: accent, margin: 0 }}>{product}</h1>
		<p style={{ fontSize: 64 }}>{price.toFixed(2)} EUR</p>
		<ul style={{ fontSize: 48 }}>
			{features.map((feature) => (
				<li key={feature}>{feature}</li>
			))}
		</ul>
	</AbsoluteFill>
);

export const OfferRoot = () => (
	<Composition
		id="Offer"
		component={Offer}
		schema={offerSchema}
		width={1920}
		height={1080}
		fps={30}
		durationInFrames={150}
		defaultProps={{
			product: "Motio Pro",
			price: 19,
			accent: "#ffb000",
			features: ["Frame-exact video", "Fonts", "Captions"],
		}}
	/>
);
// endregion
