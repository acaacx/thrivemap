import { describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider, MAX_PAGES } from "./google";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PLACE = {
  id: "live-001",
  displayName: { text: "Live Therapy Center" },
  formattedAddress: "1 Real St, Makati",
  location: { latitude: 14.5547, longitude: 121.0244 },
};

describe("GooglePlacesProvider", () => {
  it("sends the right request: URL, key header, field mask, body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE] }));
    const provider = new GooglePlacesProvider("test-key", fetchMock);
    await provider.searchText("Autism therapy in Quezon City, Philippines");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(init.headers["X-Goog-FieldMask"]).toBe(
      [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "nextPageToken",
      ].join(","),
    );
    expect(JSON.parse(init.body)).toEqual({
      textQuery: "Autism therapy in Quezon City, Philippines",
    });
  });

  it("normalizes places and counts unparseable ones as skipped", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE, { noId: true }] }));
    const provider = new GooglePlacesProvider("k", fetchMock);
    const { places, skipped } = await provider.searchText("q");
    expect(places).toHaveLength(1);
    expect(places[0].externalId).toBe("live-001");
    expect(skipped).toBe(1);
  });

  it("paginates with nextPageToken and stops at MAX_PAGES", async () => {
    // Fresh Response per call: a Response body can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse({ places: [PLACE], nextPageToken: "t" }),
      );
    const provider = new GooglePlacesProvider("k", fetchMock);
    const { places } = await provider.searchText("q");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES);
    expect(places).toHaveLength(MAX_PAGES);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).pageToken).toBe("t");
  });

  it("stops when there is no nextPageToken", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE] }));
    const provider = new GooglePlacesProvider("k", fetchMock);
    await provider.searchText("q");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on non-200 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    const provider = new GooglePlacesProvider("k", fetchMock);
    await expect(provider.searchText("q")).rejects.toThrow(/HTTP 403/);
  });
});
