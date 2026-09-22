// @vitest-environment jsdom
/**
 * Boots the real app in jsdom with the real seed file: catches React runtime
 * errors, broken routes, and seed-import problems without a browser.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const seed = readFileSync(resolve(process.cwd(), "public/seed/essential.json"), "utf8");

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/seed/essential.json")) return new Response(seed, { headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }),
  );
  // jsdom lacks matchMedia and the PWA virtual module; stub both.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});

afterEach(cleanup);
beforeEach(() => window.history.pushState({}, "", "/"));

describe("app smoke", () => {
  it("boots, seeds, and shows Today with a review button", async () => {
    const { App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy(), { timeout: 10000 });
    await waitFor(() => expect(screen.getByText(/Review \d+ cards/)).toBeTruthy(), { timeout: 10000 });
    expect(screen.getByText(/entries in your collection/)).toBeTruthy();
  }, 30000);

  it("navigates to Words, Import, Translate, Settings and Grammar without crashing", async () => {
    const { App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy(), { timeout: 10000 });

    fireEvent.click(screen.getByText("Words"));
    await waitFor(() => expect(screen.getByPlaceholderText("Search")).toBeTruthy());

    fireEvent.click(screen.getByText("Import"));
    await waitFor(() => expect(screen.getByText("Copy prompt")).toBeTruthy());

    fireEvent.click(screen.getByText("Translate"));
    await waitFor(() => expect(screen.getByText("English → Spanish")).toBeTruthy());

    fireEvent.click(screen.getByText("Settings"));
    await waitFor(() => expect(screen.getByText("Export backup")).toBeTruthy());

    fireEvent.click(screen.getByText("Today"));
    await waitFor(() => expect(screen.getByText("Grammar")).toBeTruthy());
    fireEvent.click(screen.getByText("Open"));
    await waitFor(() => expect(screen.getByText("Tenses")).toBeTruthy());
  }, 30000);

  it("starts a review session and can flip and grade a card", async () => {
    const { App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Review \d+ cards/)).toBeTruthy(), { timeout: 10000 });
    fireEvent.click(screen.getByText(/Review \d+ cards/));
    await waitFor(() => expect(screen.getByText("Show answer")).toBeTruthy(), { timeout: 10000 });
    fireEvent.click(screen.getByText("Show answer"));
    await waitFor(() => expect(screen.getByText("Good")).toBeTruthy());
    fireEvent.click(screen.getByText("Good"));
    await waitFor(() => expect(screen.getByText("Show answer")).toBeTruthy());
    fireEvent.click(screen.getByText("↶ Undo"));
    await waitFor(() => expect(screen.getByText("Show answer")).toBeTruthy());
  }, 30000);
});
