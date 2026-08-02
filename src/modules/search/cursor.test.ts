import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

const uuid = "0b8f8a3e-1111-4222-8333-444455556666";

describe("cursor", () => {
  it("round-trips", () => {
    const encoded = encodeCursor({ v: 12.34, id: uuid });
    expect(decodeCursor(encoded)).toEqual({ v: 12.34, id: uuid });
  });

  it("rejects garbage", () => {
    expect(decodeCursor("not-base64!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("rejects non-uuid ids", () => {
    const forged = Buffer.from(
      JSON.stringify({ v: 1, id: "1; drop table" }),
    ).toString("base64url");
    expect(decodeCursor(forged)).toBeNull();
  });

  it("round-trips text sort keys (alphabetical sort)", () => {
    const encoded = encodeCursor({ v: "Kaleidoscope Center", id: uuid });
    expect(decodeCursor(encoded)).toEqual({
      v: "Kaleidoscope Center",
      id: uuid,
    });
  });

  it("rejects oversized text sort keys", () => {
    const forged = Buffer.from(
      JSON.stringify({ v: "x".repeat(300), id: uuid }),
    ).toString("base64url");
    expect(decodeCursor(forged)).toBeNull();
  });

  it("rejects sort values that are neither number nor string", () => {
    for (const v of [null, true, { a: 1 }, [1]]) {
      const forged = Buffer.from(JSON.stringify({ v, id: uuid })).toString(
        "base64url",
      );
      expect(decodeCursor(forged)).toBeNull();
    }
  });

  it("never coerces a text sort key into a number", () => {
    // "Infinity" is a legal clinic-name cursor; it must stay a string so it
    // is sent as the text key, never as the numeric one.
    const forged = Buffer.from(
      JSON.stringify({ v: "Infinity", id: uuid }),
    ).toString("base64url");
    expect(decodeCursor(forged)).toEqual({ v: "Infinity", id: uuid });
  });
});
