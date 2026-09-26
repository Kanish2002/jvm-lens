package com.jvmlens.debugger;

import com.jvmlens.session.ExecutionSession;
import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceModel.Field;
import com.jvmlens.trace.TraceModel.HeapObject;
import com.jvmlens.trace.TraceModel.StackFrame;
import com.jvmlens.trace.TraceModel.StaticState;
import com.jvmlens.trace.TraceModel.ThreadSnapshot;
import com.jvmlens.trace.TraceModel.ThreadState;
import com.jvmlens.trace.TraceModel.Value;
import com.jvmlens.trace.TraceModel.Variable;
import com.sun.jdi.ArrayReference;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.PrimitiveValue;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class StackHeapSnapshotter {
    private final int maxObjects;
    private final int maxDepth;
    private final int maxArrayElements;

    public StackHeapSnapshotter(
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-objects}") int maxObjects,
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-depth}") int maxDepth,
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-array-elements}") int maxArrayElements
    ) {
        this.maxObjects = maxObjects;
        this.maxDepth = maxDepth;
        this.maxArrayElements = maxArrayElements;
    }

    public Snapshot capture(ExecutionSession session, ThreadReference eventThread) {
        var heap = new LinkedHashMap<String, HeapObject>();
        var roots = new ArrayList<ObjectReference>();
        var threadSnapshots = new ArrayList<ThreadSnapshot>();
        List<StackFrame> eventFrames = List.of();

        try {
            for (ThreadReference thread : eventThread.virtualMachine().allThreads()) {
                List<StackFrame> frames = captureFrames(session, thread, roots);
                boolean active = thread.uniqueID() == eventThread.uniqueID();
                if (active) eventFrames = frames;
                if (active || !frames.isEmpty()) {
                    threadSnapshots.add(new ThreadSnapshot(
                            new ThreadState(thread.uniqueID(), safeThreadName(thread), threadStatus(thread.status())),
                            frames, active));
                }
            }
        } catch (Exception ignored) {
            eventFrames = captureFrames(session, eventThread, roots);
        }

        if (threadSnapshots.isEmpty()) {
            threadSnapshots.add(new ThreadSnapshot(
                    new ThreadState(eventThread.uniqueID(), safeThreadName(eventThread), threadStatus(eventThread.status())),
                    eventFrames, true));
        }

        for (ObjectReference root : roots) inspect(session, root, 0, heap, new HashSet<>());
        List<StaticState> statics = captureStatics(session, eventThread, heap);
        return new Snapshot(eventFrames, List.copyOf(threadSnapshots), List.copyOf(heap.values()), statics);
    }

    private List<StackFrame> captureFrames(ExecutionSession session, ThreadReference thread,
                                           List<ObjectReference> roots) {
        var frames = new ArrayList<StackFrame>();
        try {
            for (com.sun.jdi.StackFrame frame : thread.frames()) {
                var location = frame.location();
                ReferenceType declaringType = location.declaringType();
                if (declaringType.classLoader() == null) continue;
                session.trackUserClass(declaringType.name());

                var locals = new ArrayList<Variable>();
                try {
                    Map<LocalVariable, com.sun.jdi.Value> values = frame.getValues(frame.visibleVariables());
                    for (var entry : values.entrySet()) {
                        locals.add(new Variable(entry.getKey().name(), describe(session, entry.getValue(), roots)));
                    }
                } catch (Exception ignored) { }

                String thisId = null;
                try {
                    if (frame.thisObject() != null) {
                        roots.add(frame.thisObject());
                        thisId = session.logicalId(frame.thisObject().uniqueID());
                    }
                } catch (Exception ignored) { }

                frames.add(new StackFrame(declaringType.name(), location.method().name(),
                        Math.max(location.lineNumber(), -1), List.copyOf(locals), thisId));
            }
        } catch (Exception ignored) { }
        return List.copyOf(frames);
    }

    private void inspect(ExecutionSession session, ObjectReference object, int depth,
                         Map<String, HeapObject> heap, Set<Long> path) {
        String id = session.logicalId(object.uniqueID());
        if (heap.containsKey(id) || heap.size() >= maxObjects || !path.add(object.uniqueID())) return;

        var fields = new ArrayList<Field>();
        var elements = new ArrayList<Value>();
        boolean truncated = depth >= maxDepth;
        String display = null;
        try {
            if (object instanceof StringReference string) {
                display = string.value();
            } else if (object instanceof ArrayReference array) {
                int size = Math.min(array.length(), maxArrayElements);
                for (int i = 0; i < size; i++) {
                    com.sun.jdi.Value raw = array.getValue(i);
                    elements.add(describe(session, raw, new ArrayList<>()));
                    if (!truncated && raw instanceof ObjectReference child) {
                        inspect(session, child, depth + 1, heap, new HashSet<>(path));
                    }
                }
                truncated = truncated || array.length() > maxArrayElements;
            } else if (!truncated) {
                for (com.sun.jdi.Field jdiField : object.referenceType().allFields()) {
                    if (jdiField.isStatic()) continue;
                    com.sun.jdi.Value raw = object.getValue(jdiField);
                    fields.add(new Field(jdiField.name(), jdiField.declaringType().name(), false,
                            describe(session, raw, new ArrayList<>())));
                    if (raw instanceof ObjectReference child) {
                        inspect(session, child, depth + 1, heap, new HashSet<>(path));
                    }
                }
            }
        } catch (Exception ignored) {
            truncated = true;
        }

        heap.put(id, new HeapObject(id, object.referenceType().name(), display, List.copyOf(fields),
                List.copyOf(elements), true, EvidenceType.DERIVED, "Tracked", truncated));
    }

    private List<StaticState> captureStatics(ExecutionSession session, ThreadReference thread,
                                             Map<String, HeapObject> heap) {
        var states = new ArrayList<StaticState>();
        try {
            for (String className : session.userClasses()) {
                for (ReferenceType type : thread.virtualMachine().classesByName(className)) {
                    var fields = new ArrayList<Field>();
                    for (com.sun.jdi.Field field : type.allFields()) {
                        if (!field.isStatic()) continue;
                        com.sun.jdi.Value raw = type.getValue(field);
                        fields.add(new Field(field.name(), field.declaringType().name(), true,
                                describe(session, raw, new ArrayList<>())));
                        if (raw instanceof ObjectReference child) inspect(session, child, 0, heap, new HashSet<>());
                    }
                    states.add(new StaticState(type.name(), List.copyOf(fields)));
                }
            }
        } catch (Exception ignored) { }
        return List.copyOf(states);
    }

    private Value describe(ExecutionSession session, com.sun.jdi.Value value, List<ObjectReference> roots) {
        if (value == null) return new Value("null", "null", null, null, EvidenceType.OBSERVED);
        if (value instanceof PrimitiveValue primitive) {
            return new Value("primitive", primitive.type().name(), primitive.toString(), null, EvidenceType.OBSERVED);
        }
        if (value instanceof ObjectReference object) {
            roots.add(object);
            String display = value instanceof StringReference string ? string.value() : null;
            return new Value("reference", object.referenceType().name(), display,
                    session.logicalId(object.uniqueID()), EvidenceType.OBSERVED);
        }
        return new Value("unknown", value.type().name(), value.toString(), null, EvidenceType.OBSERVED);
    }

    private String safeThreadName(ThreadReference thread) {
        try { return thread.name(); } catch (Exception ignored) { return "unknown"; }
    }

    private String threadStatus(int status) {
        return switch (status) {
            case ThreadReference.THREAD_STATUS_MONITOR -> "BLOCKED";
            case ThreadReference.THREAD_STATUS_NOT_STARTED -> "NEW";
            case ThreadReference.THREAD_STATUS_RUNNING -> "RUNNABLE";
            case ThreadReference.THREAD_STATUS_SLEEPING -> "TIMED_WAITING";
            case ThreadReference.THREAD_STATUS_WAIT -> "WAITING";
            case ThreadReference.THREAD_STATUS_ZOMBIE -> "TERMINATED";
            default -> "UNKNOWN";
        };
    }

    public record Snapshot(List<StackFrame> frames, List<ThreadSnapshot> threads,
                           List<HeapObject> heap, List<StaticState> statics) { }
}
