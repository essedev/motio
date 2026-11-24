/**
 * Code colours of the brand, as a TextMate theme: Plum ground in both site themes, Pulse for
 * keywords and tags, Spark for strings, a light Drift for numbers. Used by Expressive Code in the
 * docs and by Shiki on the landing page.
 */
export const codeTheme = {
	name: "motio-plum",
	type: "dark" as const,
	colors: {
		"editor.background": "#2A0E2E",
		"editor.foreground": "#F6EFF4",
		"editor.selectionBackground": "#5A2A60",
		"editorLineNumber.foreground": "#8D7590",
		"terminal.background": "#2A0E2E",
		"titleBar.activeBackground": "#1C0B1F",
		"titleBar.activeForeground": "#F6EFF4",
		"titleBar.border": "#00000000",
		"tab.activeBackground": "#2A0E2E",
		"tab.activeForeground": "#F6EFF4",
		"tab.inactiveBackground": "#1C0B1F",
		"editorGroupHeader.tabsBackground": "#1C0B1F",
		"tab.border": "#00000000",
		"tab.activeBorderTop": "#FF3D8B",
	},
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: { foreground: "#BEA9C1", fontStyle: "italic" },
		},
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"storage.modifier",
				"keyword.operator.new",
				"keyword.control",
				"variable.language",
			],
			settings: { foreground: "#FF86B6" },
		},
		{
			scope: ["entity.name.tag", "support.class.component", "entity.name.tag.tsx"],
			settings: { foreground: "#FF86B6" },
		},
		{
			scope: ["string", "string.quoted", "string.template", "punctuation.definition.string"],
			settings: { foreground: "#FFDD3C" },
		},
		{
			scope: ["constant.numeric", "constant.language", "constant.character"],
			settings: { foreground: "#5FE0D1" },
		},
		{
			scope: [
				"entity.name.function",
				"support.function",
				"meta.function-call entity.name.function",
			],
			settings: { foreground: "#FFFFFF", fontStyle: "bold" },
		},
		{
			scope: ["entity.other.attribute-name", "variable.parameter", "meta.object-literal.key"],
			settings: { foreground: "#E9D9E7" },
		},
		{
			scope: ["entity.name.type", "support.type", "entity.name.class"],
			settings: { foreground: "#5FE0D1" },
		},
		{
			scope: ["punctuation", "meta.brace", "keyword.operator"],
			settings: { foreground: "#D8C8D6" },
		},
		{
			scope: ["variable.parameter.function.shell", "support.function.builtin.shell"],
			settings: { foreground: "#FFFFFF", fontStyle: "bold" },
		},
	],
};
