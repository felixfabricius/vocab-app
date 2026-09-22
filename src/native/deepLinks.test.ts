import { describe, expect, it } from "vitest";
import { routeForDeepLink } from "./deepLinks";

describe("deep links", () => {
  it("routes translate links with a direction", () => {
    expect(routeForDeepLink("alaluna://translate?dir=en-es")).toBe("/translate?focus=1&dir=en-es");
    expect(routeForDeepLink("alaluna://translate?dir=es-en")).toBe("/translate?focus=1&dir=es-en");
  });
  it("drops unknown directions and ignores other links", () => {
    expect(routeForDeepLink("alaluna://translate?dir=xx")).toBe("/translate?focus=1");
    expect(routeForDeepLink("alaluna://settings")).toBeUndefined();
    expect(routeForDeepLink("https://example.com/translate")).toBeUndefined();
    expect(routeForDeepLink("not a url")).toBeUndefined();
  });
});
