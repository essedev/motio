import type { APIRoute } from "astro";
import { llmsIndex } from "../lib/llms.ts";

/** `/llms.txt`: the index of the docs for language models and coding agents. */
export const GET: APIRoute = () =>
	new Response(llmsIndex(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
