import { expect, test } from "bun:test";
import { isPlainText } from "./plainText";

test("plain text has no Markdown syntax", () => {
	expect(isPlainText("The army moved east at dawn.")).toBe(true);
	expect(isPlainText("20-30 years")).toBe(true);
	expect(isPlainText("Word — word")).toBe(true);
	expect(isPlainText("")).toBe(true);
});

test("links and emphasis are not plain text", () => {
	expect(isPlainText("See [[Demo Notes]].")).toBe(false);
	expect(isPlainText("*important*")).toBe(false);
	expect(isPlainText("_under_")).toBe(false);
	expect(isPlainText("**bold**")).toBe(false);
});

test("block and inline syntax is not plain text", () => {
	expect(isPlainText("# Heading")).toBe(false);
	expect(isPlainText("#tag")).toBe(false);
	expect(isPlainText("- item")).toBe(false);
	expect(isPlainText("1. item")).toBe(false);
	expect(isPlainText("line one\nline two")).toBe(false);
	expect(isPlainText("a > b")).toBe(false);
	expect(isPlainText("a | b")).toBe(false);
	expect(isPlainText("plain & simple")).toBe(false);
	expect(isPlainText("$x^2$")).toBe(false);
	expect(isPlainText("`code`")).toBe(false);
	expect(isPlainText("==highlight==")).toBe(false);
	expect(isPlainText("---")).toBe(false);
});

test("a list marker after a space is not plain text", () => {
	expect(isPlainText("  - item")).toBe(false);
	expect(isPlainText("12) item")).toBe(false);
});
