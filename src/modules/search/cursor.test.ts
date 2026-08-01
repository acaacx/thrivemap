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
    const forged = Buffer.from(JSON.stringify({ v: 1, id: "1; drop table" })).toString(
      "base64url",
    );
    expect(decodeCursor(forged)).toBeNull();
  });

  it("rejects non-finite sort values", () => {
    const forged = Buffer.from(JSON.stringify({ v: "Infinity", id: uuid })).toString(
      "base64url",
    );
    expect(decodeCursor(forged)).toBeNull();
  });
});
