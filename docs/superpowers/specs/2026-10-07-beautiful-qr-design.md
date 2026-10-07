# beautiful-qr — design

Date: 2026-10-07
Status: approved, in implementation

## Positioning

Beautiful QR codes that are provably scannable, rendering identically in browser,
Node, edge runtimes and React Server Components.

The styled-QR market is led by `qr-code-styling` (924k weekly downloads) which has
not shipped since April 2025, carries no `exports` map, and is canvas-first — it
throws `ReferenceError: self is not defined` in Next.js server contexts and requires
hand-injected `node-canvas` or `jsdom` on the server. A maintained fork,
`@liquid-js/qr-code-styling`, reached only 15k weekly downloads, which establishes
that a better fork of the same product does not move users.

Two claims competitors cannot cheaply match:

1. No canvas, no DOM, no native dependency anywhere in the pipeline.
2. Every generated code is decoded back before it is returned, and probed against
   simulated print degradation to report the smallest physical size that still scans.

Feature parity on shapes, gradients and logos is table stakes, not the pitch.

## Architecture

One geometry source feeds two backends, so the verified artifact and the exported
artifact are never allowed to diverge.

```
options
  → encodeQR(data, 'raw')        qr, zero-dep, returns boolean[][]
  → matrix
  → geometry                     ShapeList in module coordinates
      ├→ svg serializer          → SVG string
      └→ analytic rasterizer     → RGBA buffer
                                    ├→ png encoder → PNG / WebP
                                    └→ verifier → decodeQR → degradation ladder
  → repair loop (on failure, re-enter with adjusted options)
  → result + report
```

### Constrained shape vocabulary

The rasterizer supports exactly two primitives: rounded rectangle with per-corner
radii, and circle. Both have closed-form area coverage, so antialiasing is analytic —
no bezier flattening, no scanline polygon fill, no path parser. Every v1 dot and
corner style is expressible in these two primitives.

This constraint is the reason the project is tractable. Exotic shapes (heart, star)
arrive later through a plugin supplying its own coverage function.

### Rejected alternatives

- **SVG-primary with a platform rasterizer** (canvas in browser, `resvg`/`sharp` in
  Node). Much less code, but reintroduces native dependencies and kills edge/RSC
  support — recreating the incumbent's core weakness.
- **Simplified grid rasterizer for verification only.** Cheaper, but verification
  would test an approximation rather than the real output. The degradation ladder
  specifically probes dot merging under blur, which is exactly where an
  approximation diverges from the truth.

## Verification

Verification is on by default.

The clean render is decoded first. The ladder then re-decodes under progressively
harsher conditions — downscale, gaussian blur, contrast crush, small rotation — and
reports the harshest surviving setting, converted to a minimum physical print size.

On failure the engine applies the minimal repair that preserves design intent, in
this order: raise error correction, widen quiet zone, increase contrast, shrink
logo, substitute a higher-coverage dot style. It re-verifies after each step and
returns both the working code and a list of what it changed and why.

Rationale for repair-by-default over throwing: a hard error breaks builds over
designs that are marginally out of tolerance, and users respond by disabling the
check. Warn-only is ignored outright. Repair keeps the default path working, which
is what makes the feature worth having.

## What implementation changed

Three decisions moved once the code could be measured rather than reasoned about.

Repair order was wrong. Contrast was fourth, so a design at 1.5:1 exhausted its
whole repair budget on error correction, quiet zone and logo size and still
failed, because none of those compensate for modules a scanner cannot separate
from the background. Contrast now runs first.

The degradation ladder was quantisation noise on the resolution axis. Walking a
fixed list made the result depend on where steps happened to fall, which made
unrelated designs look different and identical designs look the same as the list
changed. Scale is now bisected to a step-independent threshold for the same
number of decodes.

With that noise removed, dot shape turned out not to be reliably measurable
here: a round module still reads dark at the centre a decoder samples, and
apparent differences tracked the payload rather than the style. The real penalty
is physical, so it is applied as a stated constant from print guidance and kept
separable from measured robustness in the report.

Low contrast also had to become a failure in its own right. Decoders threshold a
clean buffer adaptively and read codes at 1.5:1 that a phone in poor light will
not, so contrast is gated at 3:1 independently of whether the decode succeeded.

## Logo handling

Verification models the logo as an opaque occlusion mask derived from its bounds.
No logo pixels are ever decoded, which is both conservative and correct.

Export is where format matters:

| Export  | PNG logo | SVG logo     | JPEG logo    |
| ------- | -------- | ------------ | ------------ |
| SVG     | yes      | yes          | yes          |
| PNG/WebP| yes      | browser only | browser only |

SVG export embeds any logo as a data URI — pure passthrough. PNG export needs real
pixels; PNG logos work everywhere because the inflate machinery is already present
for the PNG encoder. SVG logos would require a full SVG renderer and JPEG a full
JPEG decoder, neither of which belongs in v1. In Node both throw an actionable error
naming the fix rather than silently emitting a logo-less code.

## v1 scope

Core: matrix, geometry, SVG, rasterizer, PNG/WebP, verification with repair and
degradation ladder, 6 dot styles, 4 corner styles, logo, solid and gradient fills,
backgrounds.

Adoption kit: `beautiful-qr/react`, `beautiful-qr/compat` accepting the
`qr-code-styling` options object unchanged, ~10 presets, and data helpers for wifi,
vcard, email, sms, phone and geo.

Deferred: frames, plugin system, CLI, playground site. The plugin API in particular
should not be designed before real users have stressed the core, or the extension
points will be wrong.

## Package shape

Single package, subpath exports, dual ESM/CJS with types. `qr` is bundled rather
than declared as a runtime dependency — it is 11.5KB gzipped, zero-dep and
MIT/Apache-2.0 — so consumers install nothing transitively and the CJS build works
despite `qr` being ESM-only. Attribution is carried in `NOTICE`, which ships.

React is an optional peer dependency, so Node-only consumers never pull it in.

## Testing

Round-trip decode is the primary assertion: every style combination, every error
correction level, and a spread of payload sizes must encode, render, rasterize and
decode back to the exact input. Degradation thresholds are asserted as ranges rather
than exact values so antialiasing changes do not produce brittle failures. The
repair loop is tested by feeding deliberately broken configurations and asserting
both that the output verifies and that the reported repairs match what changed.
