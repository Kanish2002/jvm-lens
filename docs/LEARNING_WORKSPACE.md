# JVM Lens learning workspace

The default frontend is a deterministic Step → UI renderer. It opens the aliasing example at step 1 without connecting to a Java service. The original JDI workspace remains at `?view=live`; edited Java can also be captured through the existing REST backend and shown in the new renderer.

## Component tree

```text
LearningApp (MotionConfig, theme, local preferences, keyboard commands)
├── ExamplePicker (starter, ten misconceptions, three JMM demonstrations)
├── MisconceptionBanner
├── CodePane (local CodeMirror 6, line/gutter marker, inline diagnostics)
│   ├── PredictCard (three options, explanation, first-attempt score)
│   └── Caption (ARIA live region) + output
├── MemoryBoard
│   ├── StackPane → Frame → ValueCell → ChangeRing
│   ├── HeapPane → static strip + zones → HeapNode → ValueCell
│   └── ArrowLayer (measured SVG Béziers)
├── ThreadLanes (replaces MemoryBoard for JMM demonstrations)
│   ├── Writer observations
│   ├── Main Memory (shared writes)
│   ├── Reader / Main observations
│   └── HappensBefore edge / stale-read labels
├── ComparisonVersion (CodePane + ThreadLanes, same index)
├── Share / PNG / GIF controls
├── Inline shortcut sheet
└── TransportBar (first, previous, play/pause, next, last, speed, ticks)
```

## Data contract

The complete exported TypeScript types live in `apps/web/src/learning/schema.ts`.

```ts
type MemoryValue =
  | { kind: 'primitive'; type: string; value: string | number | boolean }
  | { kind: 'reference'; type: string; target: string | null };

interface Step {
  id: string;
  line: number;
  stack: Frame[];
  heap: HeapNode[];
  statics: Local[];
  threads: Thread[];
  event: 'start' | 'assign' | 'allocate' | 'call' | 'return' |
    'unreachable' | 'gc' | 'read' | 'write' | 'happens-before' | 'error';
  explanation: string;
  diff: { added: string[]; changed: string[]; removed: string[] };
  prediction?: Prediction;
  output?: string;
  shared?: Local[];
  happensBefore?: { from: string; to: string; reason: string };
  error?: string;
}
```

Every step is a full snapshot. IDs identify frames, locals, heap objects, fields, thread observations, and static fields. `model.ts` computes diffs and transitive root reachability without mutating snapshots. Arrays and objects use distinct heap zones; values use a discriminated union so a primitive can never accidentally render as a reference.

The Zustand store contains only selection and learning controls. The prediction gate checks every forward navigation route, including a scrub directly to the last step. Wrong guesses explain the misconception, remain locked, and count against the first-attempt score. Going backward preserves the score and restores the selected snapshot. Editing source pauses playback and blocks trace navigation until a matching capture is loaded.

## The aliasing proof was implemented first

`model.test.ts` verifies one Person, two incoming references, shared mutation, last-reference removal, delayed collection, and immutable earlier history. `renderer.test.tsx` verifies primitive cells, reference ports, one shared object card, garbage styling, and backward restoration.

## Tokens and motion

`tokens.ts` is the visual source of truth for both themes, semantic colors, typography, spacing, control dimensions, arrow geometry, and motion. It emits prefixed CSS variables consumed by `learning.css` and CodeMirror. There are no component libraries. Tailwind is configured through its Vite plugin; the layout and semantic states use scoped CSS with the same tokens.

Inter and JetBrains Mono are bundled locally. The editor does not depend on a CDN. Changed values get a separate per-step white ring, so consecutive writes to one cell both pulse. Arrow paths use stable source/target keys; reassigning a reference retracts the old path and draws the new one. Resize and scroll measurements keep endpoints attached during layout motion. Small screens use focusable target chips. Transform, fade, and path animations all honor reduced motion; exports also disable motion.

Desktop: code 4/12, stack 3/12, heap 5/12 with 16px gutters. Tablet: code plus a vertical memory split. Mobile: code at 35vh, Stack/Heap/Both controls beneath it, swipe navigation, target chips, pinned playback with safe-area support. Panes scroll internally; the page does not scroll.

## Curated trace files

- `apps/web/src/learning/traces/aliasing.json`
- `apps/web/src/learning/traces/integer-cache.json`
- `apps/web/src/learning/traces/volatile-visibility.json`

These are real snapshots with materialized diffs, not stubs. Regenerate with `node scripts/create-learning-traces.mjs` from `apps/web`. The remaining lessons are defined in `library.ts` and `synchronization.ts`.

The ten misconceptions are pass-by-value swap, String pool vs `new String`, Integer cache, shared mutable list, shallow/deep copy, identity/equality, static state, stack overflow, retention through a static list, and array aliasing. The starting aliasing trace and volatile/synchronized/join labs are additional lessons.

## Accuracy boundaries

- Curated traces are teaching examples, labeled as curated. GC is explicitly simulated. A real `System.gc()` only requests collection.
- String literal roots and the Integer default cache are stated modeling assumptions. The guaranteed Integer cache range is -128…127; 128 is not guaranteed to be a distinct instance on every JVM.
- JMM lanes show read observations, not literal CPU caches or a complete scheduler. Volatile publication, monitor unlock/lock, and successful join are distinct happens-before examples. Seeing a volatile write of `true` guarantees the earlier `data` write; running the reader before publication may skip the print.
- Plain and volatile variants compare illustrative executions at aligned teaching steps. They do not claim to enumerate all legal schedules.
- Live captures preserve object identity from JDI. Missing objects in a bounded snapshot stay labeled “Not captured this step”; absence is not treated as a GC event. No pooled identity or happens-before edge is inferred from matching contents.
- The original backend's deployment/runtime constraints are unchanged. Curated lessons, prediction, sharing and local exports do not require that backend.

## Sharing and export

URLs contain the lesson, one-based step, and UTF-8 Java source encoded as URL-safe base64. The source is in the link, so it is visible to anyone receiving that link. Invalid data falls back to a useful example. A modified or live-source link asks the receiver to run the code; a remembered step is applied after capture. Links are capped at 32 KB of source.

PNG captures the current workspace. GIF captures every step, including explicit GC, using `html-to-image` and a lazy-loaded `gifenc` encoder. Export restores index, prediction gate, focus and motion state afterward and leaves playback paused. GIFs are limited to 60 steps. Browser rasterization and downloads need a normal browser session.

## Run and validate

```sh
cd apps/web
npm ci
npm test
npm run build
npm run dev
```

The old generated `vite.config.js` and `.d.ts` files were removed because they masked the authoritative TypeScript configuration. Keep `tsconfig.node.json` on `noEmit`.

Validation covers original frontend tests, aliasing model/rendering, fixture invariants, prediction bypass attempts, Unicode/malformed share links, JMM comparison and interleavings, keyboard controls, recoverable compile errors, actual CodeMirror line/error rendering, and the observed-trace adapter. All 42 frontend tests pass. Production TypeScript and Vite build are checked. Browser screenshots, downloaded PNG/GIF inspection, and live Java execution require their respective runtimes and are not claimed by jsdom tests.
