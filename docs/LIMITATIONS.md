# What JVM Lens can and cannot know

## Observed

- Current source location and bytecode index
- Suspended-thread stack frames
- Visible primitive locals and reference values
- Runtime object type and JDI object identity
- Instance and static field values
- Primitive and reference arrays
- Active event thread and exceptions
- `stdout` and `stderr`
- Aggregate heap, non-heap, Metaspace, thread, and class counts when local JMX is available
- Class bytecode produced by the real compiler

## Derived

- Logical object IDs
- Object/reference graph from tracked roots
- Reachability from tracked roots
- Local, reference, field, frame, and console diffs between snapshots
- Source/bytecode association
- Object lifetime within the captured graph

“Unreachable from tracked roots” is deliberately narrower than “globally unreachable.” An object that disappears from this graph may still be reachable through an untracked thread, JNI global, class-loader structure, or another JVM root.

## Simulated

- Per-object placement in Eden
- Survivor aging
- Promotion to old generation
- Per-object generational history

These are teaching aids. Aggregate collector telemetry and per-object simulated placement are presented separately.

## Not promised

- Stable physical addresses or exact RAM locations
- Exact G1 region for an arbitrary object
- Physical collection merely because an object became unreachable
- A complete String-intern table from equal String contents
- Exact native operand or CPU stack state
- Complete JNI, `Unsafe`, direct-buffer, foreign-memory, mmap, or GPU memory graphs
- Perfect source mapping for lambdas, hidden/generated classes, proxies, reflection, or optimized code
- Deterministic multithread scheduling

## JIT

Educational mode uses `-Xint`. If a normal-JVM mode is added, inlining, escape analysis, scalar replacement, dead-code elimination, and allocation elimination can make the implementation differ from a straightforward source-level teaching model.

## Collection

The MVP does not claim physical object collection. The JVMTI milestone will tag selected objects and use `ObjectFree`; only then may collection be labeled `OBSERVED`.

## VisualVM

VisualVM is useful for development-time comparison of heap usage, allocation profiles, heap dumps, GC statistics, GC roots, and Visual GC. It is not embedded, automated per source line, or used as the execution engine. Heap dumps are expensive point-in-time snapshots and are not generated during stepping.

