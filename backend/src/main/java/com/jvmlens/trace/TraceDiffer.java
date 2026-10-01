package com.jvmlens.trace;

import com.jvmlens.trace.TraceModel.HeapObject;
import com.jvmlens.trace.TraceModel.StackFrame;
import com.jvmlens.trace.TraceModel.TraceDiff;
import com.jvmlens.trace.TraceModel.TraceStep;
import com.jvmlens.trace.TraceModel.Variable;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TraceDiffer {
    public TraceDiff compare(TraceStep previous, TraceStep current) {
        if (previous == null) return TraceDiff.empty();
        Map<String, Variable> beforeLocals = locals(previous.stackFrames());
        Map<String, Variable> afterLocals = locals(current.stackFrames());
        var added = afterLocals.keySet().stream().filter(k -> !beforeLocals.containsKey(k)).toList();
        var removed = beforeLocals.keySet().stream().filter(k -> !afterLocals.containsKey(k)).toList();
        var changed = afterLocals.keySet().stream().filter(beforeLocals::containsKey)
                .filter(k -> !Objects.equals(beforeLocals.get(k).value(), afterLocals.get(k).value())).toList();
        Map<String, HeapObject> beforeHeap = heap(previous.heap());
        Map<String, HeapObject> afterHeap = heap(current.heap());
        var created = afterHeap.keySet().stream().filter(k -> !beforeHeap.containsKey(k)).toList();
        var heapChanged = afterHeap.keySet().stream().filter(beforeHeap::containsKey)
                .filter(k -> !Objects.equals(beforeHeap.get(k).fields(), afterHeap.get(k).fields()) ||
                        !Objects.equals(beforeHeap.get(k).elements(), afterHeap.get(k).elements())).toList();
        var unreachable = beforeHeap.keySet().stream().filter(k -> !afterHeap.containsKey(k)).toList();
        int frameDelta = current.stackFrames().size() - previous.stackFrames().size();
        var refs = changed.stream().filter(k -> {
            var a = beforeLocals.get(k).value().objectId();
            var b = afterLocals.get(k).value().objectId();
            return !Objects.equals(a, b);
        }).toList();
        String stdoutAdded = suffix(previous.stdout(), current.stdout());
        String stderrAdded = suffix(previous.stderr(), current.stderr());
        String explanation = explain(added, changed, created, heapChanged, unreachable, frameDelta);
        return new TraceDiff(added, removed, changed, created, heapChanged, refs, unreachable,
                frameDelta > 0 ? List.of("+" + frameDelta + " frame") : List.of(),
                frameDelta < 0 ? List.of(frameDelta + " frame") : List.of(), stdoutAdded, stderrAdded, explanation);
    }

    private Map<String, Variable> locals(List<StackFrame> frames) {
        var values = new LinkedHashMap<String, Variable>();
        for (int i = 0; i < frames.size(); i++) {
            for (Variable variable : frames.get(i).locals()) values.put(i + ":" + variable.name(), variable);
        }
        return values;
    }
    private Map<String, HeapObject> heap(List<HeapObject> objects) {
        return objects.stream().collect(Collectors.toMap(HeapObject::id, o -> o, (a, b) -> b, LinkedHashMap::new));
    }
    private String suffix(String previous, String current) {
        return current.startsWith(previous) ? current.substring(previous.length()) : current;
    }
    private String explain(List<String> added, List<String> changed, List<String> created,
                           List<String> heapChanged, List<String> unreachable, int frameDelta) {
        if (!created.isEmpty()) return "A new object became visible from the tracked roots: " + String.join(", ", created) + ".";
        if (!heapChanged.isEmpty()) return "Observed object state changed for " + String.join(", ", heapChanged) + ".";
        if (!unreachable.isEmpty()) return String.join(", ", unreachable) + " is no longer reachable from tracked roots. This does not mean it was collected.";
        if (!added.isEmpty()) return "A local variable entered scope. No allocation is implied unless a new heap object is also shown.";
        if (!changed.isEmpty()) return "A local value changed. Primitive reassignment does not allocate a heap object.";
        if (frameDelta > 0) return "A method call pushed a new JVM frame.";
        if (frameDelta < 0) return "A method returned and its JVM frame was removed.";
        return "The program advanced to the next observable source location.";
    }
}
