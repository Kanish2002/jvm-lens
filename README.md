# JVM Lens

JVM Lens is an interactive Java execution and JVM memory visualizer. It compiles source with the real `javac -g`, launches an isolated child JVM in educational (`-Xint`) mode, controls it through JDI, and turns each suspension into an immutable `TraceStep` for a React interface.

The project does **not** interpret Java and does not fabricate JVM internals.

## What works in this milestone

- Structured compiler diagnostics from the system Java compiler
- Child-JVM launch with `-Xint`, G1, and a 64 MB heap
- JDI breakpoint at `main`, source stepping into/over/out, stack frames, locals, `this`, primitives, references, arrays, fields, inherited fields, statics, exceptions, and logical object identities
- Generic inspection of user-defined classes—no class-name-specific renderers
- Immutable trace history and replay-based Previous
- Per-step local/object/frame/console diffs
- Tracked-root object graph and reachability labeling
- Runtime String identities and aliasing without equating equal text with intern-pool membership
- Real child-JVM aggregate memory telemetry through the JDK Attach API and local JMX when available
- Real bytecode disassembly from the same JDK toolchain
- Explicit simulated per-object GC teaching view
- Output, graph depth, object, array, source, heap, step, and time limits
- Responsive React/TypeScript workspace with Monaco
- Docker development runtime and tests

## Run

The recommended path uses Docker and therefore supplies the required JDK 25 compiler and Gradle toolchain:

```bash
docker compose up --build
```

Open <http://localhost:5173>.

For local development, run a JDK 25 Gradle installation from the repository root:

```bash
gradle :backend:bootRun
cd apps/web
npm install
npm run dev
```

## Accuracy contract

| Statement | JVM Lens treatment |
|---|---|
| Local value, field value, stack frame, source location | `OBSERVED` through JDI |
| Logical object graph and reachability from visible roots | `DERIVED` from observed references |
| Per-object Eden/Survivor/Old placement | `SIMULATED` educational model |
| Java reference equals a raw pointer | Never claimed |
| Logical object ID equals an address | Never claimed |
| Unreachable means collected | Never claimed |
| Method Area equals Metaspace | Never claimed |
| Class-file constant pool equals String intern pool | Never claimed |
| One source line equals one bytecode instruction | Never claimed |
| JVM frame equals a physical native stack layout | Never claimed |

`@obj17` is a stable logical ID for one debug session, backed by JDI `ObjectReference.uniqueID()`. It is not a physical memory address.

## Controls

- **Run** compiles and starts a child JVM, pausing at `Main.main`.
- **Next / Over**, **Into**, and **Out** send JDI step commands.
- **Previous** and timeline selection replay stored snapshots; they do not reverse the JVM.
- **Auto** repeatedly steps over source lines until termination or a configured limit.
- **Reset** terminates an active child JVM and clears the UI session.

## Security boundary

User code never runs in the Spring Boot JVM. The Docker profile uses a read-only container, a dedicated unprivileged user, a bounded tmpfs, CPU/RAM/PID limits, and `no-new-privileges`. The application also enforces source, output, heap, step, object, graph, and execution-time bounds.

For an Internet-facing deployment, place each execution session in its own short-lived sandbox with a disabled network namespace, stricter syscall filtering, and an independent filesystem. The included Compose profile is for local development, not a multi-tenant public sandbox.

## Repository map

```text
apps/web/                 React + TypeScript + Monaco interface
backend/                  Spring Boot, compiler, JDI, JMX, trace engine
shared/schema/            Transport schema
examples/                 Acceptance example
agents/jvmti-agent/       Future native-agent boundary and skeleton
docs/                     Architecture and limitations
docker/                   Runtime images and reverse proxy
```

## Implementation notes

The frontend consumes only serializable trace records and never sees JDI objects. One event-loop thread owns mutation of a live execution session. Console readers use virtual threads. Snapshot replay remains available after the child JVM exits.

JOL is included at the backend boundary, but this milestone does not invent or synthesize a selected live debuggee object's layout. Live-object layout needs cooperation inside the child VM or a carefully scoped agent. The inspector reports it as unavailable until that path is implemented.
