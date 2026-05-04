import { describe, it, expect } from "vitest";
import { extractJsonObject } from "./json-extract";

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("extracts from markdown ```json fence", () => {
    const text = "Sure, here it is:\n```json\n{\"status\":\"ok\",\"n\":5}\n```\nDone.";
    expect(extractJsonObject(text)).toEqual({ status: "ok", n: 5 });
  });

  it("extracts from unlabeled ``` fence", () => {
    const text = "```\n{\"k\":true}\n```";
    expect(extractJsonObject(text)).toEqual({ k: true });
  });

  it("extracts from surrounding prose", () => {
    const text = 'The answer is {"score":0.8,"reason":"good"} as you can see.';
    expect(extractJsonObject(text)).toEqual({ score: 0.8, reason: "good" });
  });

  it("handles braces inside string values without confusing the counter", () => {
    const text = 'Result: {"note":"use {x} as a placeholder","ok":true}';
    expect(extractJsonObject(text)).toEqual({ note: "use {x} as a placeholder", ok: true });
  });

  it("handles escaped quotes inside strings", () => {
    const text = 'Out: {"msg":"he said \\"hi\\"","n":1}';
    expect(extractJsonObject(text)).toEqual({ msg: 'he said "hi"', n: 1 });
  });

  it("prefers the first balanced object that parses", () => {
    // Example object in prose, then the real one
    const text = 'For example {"x": 1} but the real answer is {"x":999,"ok":true}';
    // extractor returns the first parseable object — that's {"x": 1}
    const result = extractJsonObject(text) as { x: number };
    expect(result.x).toBe(1);
  });

  it("returns null for malformed input", () => {
    expect(extractJsonObject("no json here at all")).toBeNull();
    expect(extractJsonObject("{ not : valid")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });

  it("handles nested objects", () => {
    const text = 'reply: {"outer":{"inner":{"deep":42}},"flag":false}';
    expect(extractJsonObject(text)).toEqual({ outer: { inner: { deep: 42 } }, flag: false });
  });
});
