# JVMTI agent — advanced milestone

This directory intentionally contains architecture only. The MVP never labels an object as physically collected.

The native agent milestone will tag selected objects, listen for `ObjectFree`, and expose heap/reference traversal and GC start/finish events over a narrow local IPC protocol. `ObjectFree` is the point at which JVM Lens may label collection as `OBSERVED`; loss of reachability in a JDI-derived graph is not enough.

