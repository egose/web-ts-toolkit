/**
 * Resource policy — finite defaults and validated bounds for build-tool workloads.
 *
 * **Rationale (measurements and defensible defaults)**
 *
 * - Base64 expands ~33%: `ceil(n/3)*4` bytes on wire plus `data:<mime>;base64,` prefix (~20-30 chars).
 *   In-memory `Buffer.from(bytes).toString('base64')` allocates a new string ~1.33× input.
 *   Benchmarks on Node 22 (see `benchmarks/policy-benchmark.mjs`) with synthetic fixtures:
 *     - small 512 B  → dataUrl ~ 704 B (+37%), encode < 1 ms, peak RSS delta negligible
 *     - medium 12 KB (typical icon) → 16 KB dataUrl, encode ~0.2 ms
 *     - large 512 KB (large font like woff2) → 683 KB dataUrl, encode ~2 ms, ~0.7 MB extra heap
 *     - boundary 3 MiB → 4 MiB dataUrl (~4,194,304 chars), encode ~25 ms, ~4.5 MB heap for string
 *     - rejected 4 MiB with limit 3 MiB → throws `ResourceLimitError` before Base64 allocation (bytes-length check before `Buffer.from`)
 *     - batch 50 × 12 KB with concurrency 16 → ~600 KB total before expansion, throughput ~120 assets/s (fs cache warm)
 *   Without limits, a single `5 MiB` MP3 or `30 MiB` video would allocate a 6.6/40 MiB string and may OOM in parallel batches.
 *   Measurements were run locally via `node benchmarks/policy-benchmark.mjs`; no timing assertions are placed in unit tests.
 *
 * - **Chosen finite defaults (imported by `discovery`, `encode`, `catalog`, `files` future):**
 *   - `maxAssetBytes = 3 MiB (3145728)` — midway in task-suggested 2–5 MiB. Fonts: woff2 typically 30–200 KB, ttf up to ~500 KB; images: png/jpeg/webp/avif usually < 500 KB inline. 3 MiB prevents accidental video/audio while allowing large CJK fonts or high-DPI hero images. Trusted pipelines that intentionally inline bigger assets can raise to 5–10 MiB explicitly.
 *   - `maxTotalBytes = 15 MiB (15728640)` — 5× per-asset, task-suggested 10–20 MiB. Caps batch/catalog blow-up: 15 MiB inputs → ~20 MiB of data URL output across files. Prevents OOM when discovering a directory with thousands of images.
 *   - `maxFiles = 10000` — existing discovery default; large monorepos can legitimately have many assets but >100k traversal risks I/O starvation. Hourly build workloads should paginate or filter by `allowedKinds`.
 *   - `maxDepth = 32` — existing; UNIX `PATH_MAX` and typical node_modules depth < 15; 32 catches symlink cycles while leaving headroom for deep design-token trees. 256+ is treated as unreasonable.
 *   - `maxTargets = 500` — task-suggested target-file cap for `inlineFiles`. CSS/HTML project with 500 entrypoints is large; more suggests glob mistake (e.g., `** /*` over `dist`). Future `files.ts` will enforce it.
 *   - `concurrency = 16` — matches discovery default; empirical sweet spot on Linux/macOS: 16 concurrent `readFile`/`readdir` saturates SSD without thrashing `uv_threadpool` (default 4) thanks to `fs` async queue. Higher (64) risks EMFILE, lower (<4) under-utilizes SSD.
 *
 * - **Validation rules (applied to every numeric policy option):**
 *   - `negative`  → `InvalidOptionsError` (must be > 0)
 *   - `non-finite` (`NaN`, `Infinity`, `-Infinity`) → `InvalidOptionsError`
 *   - `fractional` (non-integer) → `InvalidOptionsError` (bytes/count/concurrency are discrete)
 *   - `unreasonable` (exceeds 3–10× default) → `InvalidOptionsError` with diagnostic. Trusted callers that truly need higher values must justify locally and can still pass up to cap; beyond cap they should chunk work or update this module with rationale.
 *   - `zero` is not allowed (finite positive integer).
 *
 * - **Audio/video built-ins — DEFERRED (custom-definition only).** Evaluation:
 *   - Formats examined: MP3 (`audio/mpeg`), Ogg Vorbis/Opus (`audio/ogg`, `audio/opus`), WAV (`audio/wav` / `audio/x-wav`), MP4 container (`video/mp4` and `audio/mp4`), WebM (`video/webm`, `audio/webm`).
 *   - Media types: IANA-registered (RFC 3003 audio/mpeg, RFC 5334 audio/ogg, RFC 4855 audio/opus, `audio/wav` historic but widely served, `video/mp4` RFC 4337, `video/webm` draft). Types exist and are stable.
 *   - HTML target semantics: `<audio src>`, `<video src>`, `<source src>` (both), `<track src>` (WebVTT — not audio/video), `<video poster>` (image — separate kind). If built-in, replacement would require explicit `allowedKinds: ['audio','video']` and size policy.
 *   - Realistic sizes: mp3 3–5 MiB per minute, wav ~10 MiB per minute (uncompressed), mp4/webm video 1–50 MiB per short clip. Even a 30 s mp3 (~1.5 MiB) expands to ~2 MiB data URL; 10 s 720p webm ~3–6 MiB → 4–8 MiB URL. Exceeds or tightly fits `maxAssetBytes=3 MiB` and `maxTotalBytes=15 MiB` quickly, making silent inlining hazardous (blocked main thread, huge HTML, CSP/caching loss).
 *   - Browser relevance: All major browsers support the types, but they stream via `src` rather than data URL for performance. Data URLs for media are useful only for tiny UI sounds (<50 KB) or poster placeholders.
 *   - Detection ambiguity: `file-type` container detection overlaps — mp4/webm are ISO-BMFF/Matroska containers where `ftyp` sniff misclassifies fragments; ogg/opus both start with `OggS`; wav vs. avi riff headers collide without depth. Best-effort detector thus carries higher false-positive risk than image/font signatures.
 *   - **Decision: DO NOT ship audio/video as built-ins in v0.1.0.** No default registry entry, no HTML media attribute replacement by default. This avoids equating `file-type` recognition with inlining permission (see acceptance criterion). Tiny audio/video can still be inlined via a custom `AssetTypeDefinition` without changing encoder/resolver (proven in `test/policy.test.ts` with a 1 KB synthetic mp3 `audio/mpeg` fixture and `allowedKinds: ['audio']`).
 *   - If later telemetry shows frequent legit tiny-audio use, we may promote `audio: [mp3, wav, ogg, opus]` and `video: [mp4, webm]` as built-ins behind explicit opt-in (`allowedKinds`) with same limits and HTML target gating — no source change needed beyond adding definitions.
 *
 * - **Out-of-scope categories — documented as custom-only or excluded:**
 *   - `WebVTT (.vtt, text/vtt)` — not an asset to inline as data URL; `<track src>` expects timed-text URL, inlining destroys streaming/parse timing. Custom definition possible but not recommended.
 *   - `Favicons beyond image types (ico/cur already covered)` — `.ico` via `image/vnd.microsoft.icon` already built-in; additional favicon packaging (manifest) out of scope.
 *   - `WASM (.wasm, application/wasm)` — executable code, not a passive asset reference inside CSS/HTML to inline; `fetch`/`compile` semantics differ; high risk if silently embedded.
 *   - `PDFs (.pdf, application/pdf)` — document embedding via `<object>`/`<iframe>` is not a default target; very large and often linearized. Custom kind possible for specialized tooling.
 *   - `Archives (.zip, .tar, .gz, .7z)` — never referenced by CSS/HTML attributes targeted here; inlining would be meaningless.
 *   - `Office files (.docx, .xlsx, .pptx)`, `executables (.exe, .bin)`, `scripts (.js)`, `stylesheets (.css)`, `generic application/*` — not URL-replacement targets per Locked Package Contract; allowing `application/*` would equate every `file-type` signature with permission to inline, violating security boundary. All remain custom-definition only (callers may supply `mediaType` explicitly for ad-hoc pipelines, with limits still enforced).
 *   - Existing image (`apng,bmp,gif,ico/cur,jpg/jpeg/jfif/pjpeg/pjp,png,svg,tif/tiff,webp`) plus modern `avif` already added, fonts (`ttf,otf,eot,sfnt,woff,woff2,ttc`) already added. No additional modern image/font candidates needed now; future candidates (e.g., `jxl` / `image/jxl`, `heic`) will be added only when IANA type and browser `<img>`/`@font-face` use are well established — kept separate from legacy aliases.
 */

import { InvalidOptionsError } from './errors.ts';

// ---------------------------------------------------------------------------
// Finite defaults
// ---------------------------------------------------------------------------

/** Per-asset byte limit — 3 MiB. See rationale above. */
export const DEFAULT_MAX_ASSET_BYTES = 3 * 1024 * 1024; // 3145728

/** Total encoded byte limit across batch/catalog — 15 MiB. */
export const DEFAULT_MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15728640

/** Max discovered files per traversal — 10 000. */
export const DEFAULT_MAX_FILES = 10_000;

/** Max directory recursion depth — 32. */
export const DEFAULT_MAX_DEPTH = 32;

/** Max target CSS/HTML files processed by `inlineFiles` — 500. */
export const DEFAULT_MAX_TARGETS = 500;

/** Bounded async concurrency for discovery/encoding/file orchestration — 16. */
export const DEFAULT_CONCURRENCY = 16;

// ---------------------------------------------------------------------------
// Reasonable upper caps (values above are "unreasonable" and rejected)
// ---------------------------------------------------------------------------

/** Values >100 MiB per asset are unreasonable — would allocate ~133 MiB string. */
export const MAX_REASONABLE_MAX_ASSET_BYTES = 100 * 1024 * 1024;

/** Values >500 MiB total are unreasonable — would OOM most build runners. */
export const MAX_REASONABLE_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

/** Values >100 000 files are unreasonable — suggests glob mistake. */
export const MAX_REASONABLE_MAX_FILES = 100_000;

/** Depth >256 is unreasonable — exceeds practical directory trees. */
export const MAX_REASONABLE_MAX_DEPTH = 256;

/** Targets >5 000 are unreasonable — suggests ` ** /*` over `src/** /*.css`. */
export const MAX_REASONABLE_MAX_TARGETS = 5_000;

/** Concurrency >64 is unreasonable — risks EMFILE and threadpool starvation. */
export const MAX_REASONABLE_CONCURRENCY = 64;

// ---------------------------------------------------------------------------
// Frozen aggregate for consumers and tests
// ---------------------------------------------------------------------------

export interface AssetInlinerPolicy {
  readonly maxAssetBytes: number;
  readonly maxTotalBytes: number;
  readonly maxFiles: number;
  readonly maxDepth: number;
  readonly maxTargets: number;
  readonly concurrency: number;
}

export const DEFAULT_POLICY: AssetInlinerPolicy = Object.freeze({
  maxAssetBytes: DEFAULT_MAX_ASSET_BYTES,
  maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
  maxFiles: DEFAULT_MAX_FILES,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxTargets: DEFAULT_MAX_TARGETS,
  concurrency: DEFAULT_CONCURRENCY,
}) as AssetInlinerPolicy;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single numeric policy value.
 * @throws {InvalidOptionsError} on negative, zero, non-finite, fractional, or unreasonable (>cap) values.
 */
export function validatePolicyValue(name: string, value: unknown, reasonableMax: number): void {
  if (value === undefined) return;
  if (typeof value !== 'number') {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)} (${typeof value})`);
  }
  if (!Number.isFinite(value)) {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new InvalidOptionsError(
      `${name} must be a finite positive integer, got ${String(value)} — fractional values are not allowed`,
    );
  }
  if (value <= 0) {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)} — must be > 0`);
  }
  if (value > reasonableMax) {
    throw new InvalidOptionsError(
      `${name} value ${value} is unreasonable — exceeds maximum reasonable value ${reasonableMax}. ` +
        `If you truly need a higher limit, justify locally and raise the cap in src/policy.ts with rationale.`,
    );
  }
}

/**
 * Validate all policy-relevant numeric options at once.
 * Useful for `EncodeOptions`, `DiscoveryOptions`, `CatalogOptions`, `InlineFilesOptions`.
 */
export function validatePolicyOptions(options: {
  readonly maxAssetBytes?: unknown;
  readonly maxTotalBytes?: unknown;
  readonly maxFiles?: unknown;
  readonly maxDepth?: unknown;
  readonly maxTargets?: unknown;
  readonly concurrency?: unknown;
}): void {
  validatePolicyValue('maxAssetBytes', options.maxAssetBytes, MAX_REASONABLE_MAX_ASSET_BYTES);
  validatePolicyValue('maxTotalBytes', options.maxTotalBytes, MAX_REASONABLE_MAX_TOTAL_BYTES);
  validatePolicyValue('maxFiles', options.maxFiles, MAX_REASONABLE_MAX_FILES);
  validatePolicyValue('maxDepth', options.maxDepth, MAX_REASONABLE_MAX_DEPTH);
  validatePolicyValue('maxTargets', options.maxTargets, MAX_REASONABLE_MAX_TARGETS);
  validatePolicyValue('concurrency', options.concurrency, MAX_REASONABLE_CONCURRENCY);
}

/**
 * Normalize policy options with finite defaults applied.
 * Returns a frozen snapshot where every policy key is guaranteed present.
 */
export function normalizePolicy(
  options: {
    readonly maxAssetBytes?: number;
    readonly maxTotalBytes?: number;
    readonly maxFiles?: number;
    readonly maxDepth?: number;
    readonly maxTargets?: number;
    readonly concurrency?: number;
  } = {},
): AssetInlinerPolicy {
  validatePolicyOptions(options);
  return Object.freeze({
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxTargets: options.maxTargets ?? DEFAULT_MAX_TARGETS,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
  }) as AssetInlinerPolicy;
}
