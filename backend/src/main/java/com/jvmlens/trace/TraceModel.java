package com.jvmlens.trace;

import java.util.List;
import java.util.Map;

public final class TraceModel {
    private TraceModel() {}

    public record Location(String className, String methodName, String file, int line, long bytecodeOffset) {}
    public record ThreadState(long id, String name, String state) {}
    public record Value(String kind, String type, Object value, String objectId, EvidenceType evidence) {}
    public record Variable(String name, Value value) {}
    public record StackFrame(String className, String methodName, int line, List<Variable> locals, String thisObjectId) {}
    public record Field(String name, String declaringType, boolean isStatic, Value value) {}
    public record HeapObject(String id, String runtimeType, String displayValue, List<Field> fields,
                             List<Value> elements, boolean reachable, EvidenceType reachabilityEvidence,
                             String simulatedGeneration, boolean truncated) {}
    public record StaticState(String className, List<Field> fields) {}
    public record BytecodeInstruction(int offset, String mnemonic, String detail, Integer sourceLine) {}
    public record Memory(long heapUsed, long heapCommitted, long heapMax, long nonHeapUsed,
                         long metaspaceUsed, int threadCount, int loadedClasses, EvidenceType evidence) {}
    public record TraceDiff(List<String> localsAdded, List<String> localsRemoved, List<String> localsChanged,
                            List<String> objectsCreated, List<String> objectsChanged,
                            List<String> referencesChanged, List<String> objectsBecameUnreachable,
                            List<String> framesAdded, List<String> framesRemoved,
                            String stdoutAdded, String stderrAdded, String explanation) {
        public static TraceDiff empty() {
            return new TraceDiff(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                    List.of(), List.of(), List.of(), "", "", "Program entry point reached.");
        }
    }
    public record TraceStep(long sequence, String event, Location location, ThreadState thread,
                            List<StackFrame> stackFrames, List<HeapObject> heap,
                            List<StaticState> staticFields, List<BytecodeInstruction> bytecode,
                            Memory memory, List<Map<String, Object>> gcEvents,
                            String stdout, String stderr, TraceDiff diff) {}
}

