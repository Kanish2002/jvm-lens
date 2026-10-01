# What JVM Lens can and cannot know

## Observed

- Current source location and bytecode index
- Suspended user-thread stack frames
- Visible primitive locals and reference values
- Runtime object type and JDI object identity
- Instance and static field values
- Primitive and reference arrays
- Active event thread, other suspended user threads, and exceptions
- `stdout` and `stderr`
- Aggregate heap, non-heap, Metaspace, thread, and class counts when local JMX is available
- Class bytecode produced by the real compiler

## Derived

- Logical object IDs
- Object/reference graph from tracked roots
- Reachability from tracked roots
- Local, reference, field, frame, and console diffs between snapshots
- Method-scoped source/bytecode association
- Program-order, field-access, monitor, and volatile-order evidence when visible at the suspended bytecode location
- Object lifetime within the captured graph

“Unreachable from tracked roots” is deliberately narrower than “globally unreachable.” An object that disappears from this graph may still be reachable through an untracked thread, JNI global, class-loader structure, or another JVM root.

## Simulated or qualified

- Race candidates derived from conflicting bytecode field accesses
- Possible reorderings or interleavings explained by the JMM explorer

These are teaching aids, not proof of a production race. A Java agent and happens-before analysis are required for stronger conclusions.

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

The child JVM is not forced into `-Xint`. Inlining, escape analysis, scalar replacement, dead-code elimination, and allocation elimination can make implementation behavior differ from a straightforward source-level teaching model. Debugger suspension also perturbs thread scheduling.

## Collection

The MVP does not claim physical object collection. The JVMTI milestone will tag selected objects and use `ObjectFree`; only then may collection be labeled `OBSERVED`.

## VisualVM

VisualVM is useful for development-time comparison of heap usage, allocation profiles, heap dumps, GC statistics, GC roots, and Visual GC. It is not embedded, automated per source line, or used as the execution engine. Heap dumps are expensive point-in-time snapshots and are not generated during stepping.
