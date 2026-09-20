package com.jvmlens.debugger;

import com.jvmlens.session.ExecutionSession;
import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceModel.Field;
import com.jvmlens.trace.TraceModel.HeapObject;
import com.jvmlens.trace.TraceModel.StackFrame;
import com.jvmlens.trace.TraceModel.StaticState;
import com.jvmlens.trace.TraceModel.Value;
import com.jvmlens.trace.TraceModel.Variable;
import com.sun.jdi.ArrayReference;
import com.sun.jdi.ClassType;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.PrimitiveValue;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

@Service
public class StackHeapSnapshotter {
    private final int maxObjects;
    private final int maxDepth;
    private final int maxArrayElements;

    public StackHeapSnapshotter(
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-objects}") int maxObjects,
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-depth}") int maxDepth,
            @org.springframework.beans.factory.annotation.Value("${jvm-lens.max-array-elements}") int maxArrayElements) {
        this.maxObjects = maxObjects;
        this.maxDepth = maxDepth;
        this.maxArrayElements = maxArrayElements;
    }

    public Snapshot capture(ExecutionSession session, ThreadReference thread) {
        var heap = new LinkedHashMap<String, HeapObject>();
        var frames = new ArrayList<StackFrame>();
        var roots = new ArrayList<ObjectReference>();
        try {
            for (com.sun.jdi.StackFrame frame : thread.frames()) {
                var locals = new ArrayList<Variable>();
                try {
                    Map<LocalVariable, com.sun.jdi.Value> values = frame.getValues(frame.visibleVariables());
                    for (var entry : values.entrySet()) {
                        locals.add(new Variable(entry.getKey().name(), describe(session, entry.getValue(), roots)));
                    }
                } catch (Exception ignored) {}
                String thisId = null;
                if (frame.thisObject() != null) {
                    roots.add(frame.thisObject());
                    thisId = session.logicalId(frame.thisObject().uniqueID());
                }
                var location = frame.location();
                frames.add(new StackFrame(location.declaringType().name(), location.method().name(),
                        safeLine(location.lineNumber()), List.copyOf(locals), thisId));
            }
        } catch (Exception ignored) {}
        roots.forEach(root -> inspect(session, root, 0, heap, new HashSet<>()));
        var statics = captureStatics(session, thread, heap);
        return new Snapshot(List.copyOf(frames), List.copyOf(heap.values()), statics);
    }

    private void inspect(ExecutionSession session, ObjectReference object, int depth,
                         Map<String, HeapObject> heap, Set<Long> path) {
        String id = session.logicalId(object.uniqueID());
        if (heap.containsKey(id) || heap.size() >= maxObjects) return;
        if (!path.add(object.uniqueID())) return;
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
                    Value value = describe(session, raw, new ArrayList<>());
                    elements.add(value);
                    if (!truncated && raw instanceof ObjectReference child) inspect(session, child, depth + 1, heap, new HashSet<>(path));
                }
                truncated = truncated || array.length() > maxArrayElements;
            } else if (!truncated) {
                for (com.sun.jdi.Field jdiField : object.referenceType().allFields()) {
                    if (jdiField.isStatic()) continue;
                    com.sun.jdi.Value raw = object.getValue(jdiField);
                    fields.add(new Field(jdiField.name(), jdiField.declaringType().name(), false,
                            describe(session, raw, new ArrayList<>())));
                    if (raw instanceof ObjectReference child) inspect(session, child, depth + 1, heap, new HashSet<>(path));
                }
            }
        } catch (Exception ignored) { truncated = true; }
        heap.put(id, new HeapObject(id, object.referenceType().name(), display, List.copyOf(fields),
                List.copyOf(elements), true, EvidenceType.DERIVED, "Eden", truncated));
    }

    private List<StaticState> captureStatics(ExecutionSession session, ThreadReference thread,
                                              Map<String, HeapObject> heap) {
        var states = new ArrayList<StaticState>();
        try {
            Set<String> userClasses = new HashSet<>();
            for (com.sun.jdi.StackFrame frame : thread.frames()) userClasses.add(frame.location().declaringType().name());
            for (ReferenceType type : thread.virtualMachine().allClasses()) {
                if (type.classLoader() == null || (!userClasses.contains(type.name()) && !isDefaultPackage(type.name()))) continue;
                var fields = new ArrayList<Field>();
                for (com.sun.jdi.Field field : type.allFields()) {
                    if (!field.isStatic()) continue;
                    com.sun.jdi.Value raw = type.getValue(field);
                    fields.add(new Field(field.name(), field.declaringType().name(), true, describe(session, raw, new ArrayList<>())));
                    if (raw instanceof ObjectReference child) inspect(session, child, 0, heap, new HashSet<>());
                }
                if (!fields.isEmpty()) states.add(new StaticState(type.name(), List.copyOf(fields)));
            }
        } catch (Exception ignored) {}
        return List.copyOf(states);
    }

    private boolean isDefaultPackage(String name) { return !name.contains("."); }

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

    private int safeLine(int line) { return Math.max(line, -1); }
    public record Snapshot(List<StackFrame> frames, List<HeapObject> heap, List<StaticState> statics) {}
}
