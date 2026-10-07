import { afterEach, describe, expect, it } from "vitest";

const BROWSER_GLOBALS = ["window", "document", "self", "navigator", "HTMLElement"] as const;

const saved = new Map<string, unknown>();

function hideBrowserGlobals(): void {
  for (const name of BROWSER_GLOBALS) {
    const scope = globalThis as Record<string, unknown>;
    if (name in scope) {
      saved.set(name, scope[name]);
      delete scope[name];
    }
  }
}

afterEach(() => {
  const scope = globalThis as Record<string, unknown>;
  for (const [name, value] of saved) scope[name] = value;
  saved.clear();
});

describe("server and edge safety", () => {
  it("has no browser globals to begin with under node", () => {
    for (const name of ["window", "document", "self"] as const) {
      expect(name in globalThis).toBe(false);
    }
  });

  it("imports and generates with every browser global removed", async () => {
    hideBrowserGlobals();
    const { generate } = await import("../src/generate.js");

    const qr = await generate({
      data: "https://example.com/edge",
      preset: "modern",
      size: 300,
    });

    expect(qr.verified).toBe(true);
    expect(qr.toSVG()).toContain("<svg");
    expect((await qr.toPNG()).length).toBeGreaterThan(0);
  });

  it("imports the react entry point without touching the dom", async () => {
    hideBrowserGlobals();
    const mod = await import("../src/react.js");
    expect(typeof mod.QRCode).toBe("function");
  });

  it("imports the compat entry point without touching the dom", async () => {
    hideBrowserGlobals();
    const { QRCodeStyling } = await import("../src/compat.js");
    const qr = new QRCodeStyling({ data: "https://example.com/edge", width: 240 });
    expect((await qr.result()).verified).toBe(true);
  });

  it("renders the react component to a string on the server", async () => {
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { QRCode } = await import("../src/react.js");

    const html = renderToString(
      createElement(QRCode, {
        data: "https://example.com/ssr",
        fallback: createElement("span", null, "loading"),
      }),
    );

    expect(html).toContain("loading");
  });

  it("reports a clear error when save is unavailable", async () => {
    const { generate } = await import("../src/generate.js");
    const qr = await generate({ data: "https://example.com", verify: false });
    expect(typeof qr.save).toBe("function");
  });
});
