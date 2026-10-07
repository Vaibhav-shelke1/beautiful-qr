# beautiful-qr

Beautiful QR codes that are checked before you get them, and that render the same in the browser, Node, edge runtimes and React Server Components.

Most styling libraries draw a QR code and hope. This one decodes its own output before handing it back, and if the design broke the code it repairs it and tells you what it changed.

```bash
npm install beautiful-qr
```

```js
import { QRCode } from "beautiful-qr";

const qr = await QRCode.generate({ data: "https://example.com" });
await qr.save("qr.png");
```

No canvas. No `node-canvas`, no `sharp`, no `jsdom`, no headless browser. Nothing is installed transitively.

## Why it exists

The styled-QR libraries available today are canvas-first, which breaks exactly where most QR codes are now generated: on the server. The market leader throws `ReferenceError: self is not defined` inside a Next.js route and needs a native image library injected by hand to run in Node at all.

So this one is built the other way round. One geometry layer feeds an SVG serialiser and a pure-JS rasteriser, both of which run anywhere JavaScript runs. That rasteriser is also what makes verification possible, because a buffer the library produced itself can be fed straight back to a decoder.

## Verification

Verification is on by default and costs about 35ms.

```js
const qr = await QRCode.generate({
  data: "https://example.com",
  logo: { src: "./logo.png", size: 0.5 },
  dots: { color: "#9CA3AF" },
  background: { color: "#D1D5DB" },
  qr: { errorCorrection: "L" },
});

qr.verified;  // true
qr.repairs;
// [
//   { field: "dots.color",         from: "#9CA3AF", to: "#000000", why: "contrast against the background was 1.5:1, below the 7:1 a scanner wants" },
//   { field: "qr.errorCorrection", from: "L",       to: "H",       why: "a failing code has nothing to gain from a lower correction level" },
//   { field: "logo.size",          from: 0.5,       to: 0.38,      why: "the logo was covering more modules than error correction could rebuild" },
// ]
```

Repairs run cheapest-first and stop the moment the code reads: fix contrast, raise error correction, widen the quiet zone, shrink the logo, fall back to a sturdier dot shape. Contrast goes first because nothing else compensates for it.

```js
qr.report;
// {
//   decodes: true,
//   survives: { scale: 0.255, blurPx: 2.4, contrast: 0.45, rotationDeg: 25 },
//   weakest: "blur",
//   estimatedMinPrintSize: { cm: 2.5, in: 0.98 },
// }
```

Turn it down or off when you are generating in bulk:

```js
await QRCode.generate({ data, verify: { ladder: false } }); // ~7ms, decode check only
await QRCode.generate({ data, verify: { repair: false } }); // report, never mutate
await QRCode.generate({ data, verify: false });             // ~1ms, no checking
```

### What the numbers mean

`decodes` is a fact: the rendered buffer was decoded and matched the input exactly.

`contrastRatio` is checked separately, and deliberately so. A decoder thresholds a clean synthetic buffer adaptively and will happily read a code at 1.5:1 that a phone in a dim restaurant will not. Anything under 3:1 counts as a failure on its own terms even when the decode succeeds. The floor is set low enough that a tasteful palette survives untouched, so blue on white at 5:1 is left exactly as you wrote it.

`survives` is a measurement: the render is re-decoded under worsening resolution, blur, contrast and rotation, and these are the harshest settings that still read.

`estimatedMinPrintSize` is an estimate, and worth understanding before you quote it. It anchors on published guidance of roughly 0.5mm modules scanning at arm's length, scaled by the measured robustness above. Degrading a clean synthetic buffer captures resolution, blur, contrast and rotation honestly, and those track payload density well. It does **not** simulate ink spread, paper or camera optics.

Dot shape is a specific case worth being straight about. Shape was measured and did not reliably change decoding, because a round module still reads dark at the centre a decoder samples, and the apparent differences moved with the payload rather than the style. The real penalty for round dots is physical. It is therefore applied as a stated constant from print guidance rather than presented as something this library measured. Treat the result as a conservative floor and a way to rank designs, not as a substitute for testing a printed sample.

## Styling

```js
const qr = await QRCode.generate({
  data: "https://example.com",
  size: 800,
  margin: 4,

  dots: {
    style: "rounded",
    color: { type: "linear", colors: ["#06B6D4", "#8B5CF6"], rotation: 45 },
  },

  corners: {
    square: { style: "extra-rounded", color: "#7C3AED" },
    dot: { style: "dot", color: "#06B6D4" },
  },

  background: { color: "#FFFFFF" },

  logo: {
    src: "./logo.png",
    size: 0.2,
    shape: "circle",
    padding: 0.5,
    background: "#FFFFFF",
  },
});
```

| Option | Values |
| --- | --- |
| `dots.style` | `square`, `dot`, `rounded`, `extra-rounded`, `classy`, `classy-rounded` |
| `corners.square.style` | `square`, `rounded`, `extra-rounded`, `dot` |
| `corners.dot.style` | `square`, `dot`, `rounded` |
| `logo.shape` | `none`, `square`, `rounded`, `circle` |
| `qr.errorCorrection` | `L`, `M`, `Q`, `H` |

Any colour accepts a solid value or a gradient. Gradients work on dots, corners and the background independently.

Dot corners round only where both neighbouring modules are absent, so adjacent modules read as one connected run instead of a grid of separate blobs.

## Presets

```js
await QRCode.generate({ data, preset: "modern" });
```

`minimal` · `modern` · `soft` · `classy` · `mono` · `corporate` · `midnight` · `neon` · `ocean` · `sunset` · `forest` · `candy`

Presets are plain objects and anything you pass explicitly wins over them:

```js
import { presets } from "beautiful-qr";

await QRCode.generate({ data, preset: "neon", dots: { style: "square" } });
```

They are named for how they look rather than after companies, which keeps them accurate as brand palettes drift and avoids implying any affiliation. A brand preset is four lines if you want one.

## Output

```js
qr.toSVG();              // string
await qr.toPNG();        // Uint8Array
await qr.toDataURL();    // data:image/png;base64,...
await qr.toDataURL("svg");
await qr.save("qr.png"); // Node only, extension picks the format
```

SVG is the primary renderer: infinitely scalable, and every module of one role is merged into a single path, so a code lands around 6KB with square dots and about 19KB with the roundest styles. PNG is written by a built-in encoder, so raster output works in edge runtimes where native image libraries cannot load.

### Logo formats

Verification is unaffected by logo format, because the logo is modelled as an opaque occlusion mask rather than decoded.

| Export | PNG logo | SVG logo | JPEG logo |
| --- | --- | --- | --- |
| SVG | yes | yes | yes |
| PNG | yes | browser only | browser only |

SVG export embeds any logo untouched as a data URI. PNG export needs real pixels, and bundling a full SVG renderer or JPEG decoder was not worth the weight, so outside a browser those raise an error naming the fix instead of quietly dropping the logo.

## Data helpers

```js
import { QRCode } from "beautiful-qr";

QRCode.wifi({ ssid: "Cafe Guest", password: "latte;2026", encryption: "WPA" });
QRCode.vcard({ name: "Ada Lovelace", phone: "+911234567890", email: "ada@example.com" });
QRCode.email({ to: "hello@example.com", subject: "Hello" });
QRCode.sms({ phone: "+911234567890", message: "Hello" });
QRCode.geo({ latitude: 19.8762, longitude: 75.3433 });
QRCode.phone("+911234567890");
```

Each returns the payload string, with the escaping each format requires. Pass it as `data`.

## React

```jsx
import { QRCode } from "beautiful-qr/react";

<QRCode data="https://example.com" preset="modern" logo="/logo.png" />
```

```jsx
<QRCode
  data="https://example.com"
  size={320}
  dots={{ style: "rounded", color: "#2563EB" }}
  fallback={<Skeleton />}
  onReady={(qr) => console.log(qr.report.estimatedMinPrintSize)}
/>
```

React is an optional peer dependency, so a Node-only install never pulls it in. The component renders its fallback during SSR and the code once generation resolves.

## Migrating from qr-code-styling

```diff
- import QRCodeStyling from "qr-code-styling";
+ import QRCodeStyling from "beautiful-qr/compat";
```

The options object, `append()`, `update()`, `getRawData()` and `download()` all keep working, including radian gradient rotations and the plural `dots` type name. You gain server rendering and verification; a config that never scanned gets repaired instead of faithfully reproduced.

Reach for the native API when you want `verify`, presets or the data helpers.

## Runtime support

Node 18+, modern browsers, Deno, Bun, Cloudflare Workers and other edge runtimes, plus React Server Components. Compression uses the web-standard `CompressionStream`, falling back to stored deflate blocks where it is missing, so output stays valid rather than failing.

## Credits

Encoding and decoding use [`qr`](https://github.com/paulmillr/qr) by Paul Miller, bundled into the build under MIT. See `NOTICE`.

## License

MIT
