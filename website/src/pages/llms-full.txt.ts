import type { APIRoute } from "astro";
import { llmsFull } from "../lib/llms.ts";

/** `/llms-full.txt`: every page of the docs in one Markdown file. */
export const GET: APIRoute = () =>
	new Response(llmsFull(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
