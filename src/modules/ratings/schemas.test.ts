import { describe, expect, it } from "vitest";
import { ratingInputSchema } from "./schemas";

const valid = {
  communication: 4,
  sensoryFriendliness: 5,
  affirmingApproach: 3,
  scheduling: 1,
};

describe("ratingInputSchema", () => {
  it("accepts all four dimensions in range", () => {
    expect(ratingInputSchema.parse(valid)).toEqual(valid);
  });
  it.each([0, 6, 2.5])("rejects out-of-range or non-int %s", (bad) => {
    expect(
      ratingInputSchema.safeParse({ ...valid, communication: bad }).success,
    ).toBe(false);
  });
  it("rejects a missing dimension", () => {
    const { scheduling: _drop, ...partial } = valid;
    expect(ratingInputSchema.safeParse(partial).success).toBe(false);
  });
});
