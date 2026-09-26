package com.jvmlens.session;

import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceModel.JmmEvent;
import com.jvmlens.trace.TraceModel.TraceStep;
import com.sun.jdi.VirtualMachine;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

public final class ExecutionSession {
    private final UUID id = UUID.randomUUID();
    private final Instant createdAt = Instant.now();
    private final Path directory;
    private final int maxHistory;
    private final Map<Long, String> logicalObjectIds = new ConcurrentHashMap<>();
    private final AtomicLong nextObjectId = new AtomicLong(1);
    private final AtomicLong nextSequence = new AtomicLong(1);
    private final Deque<TraceStep> trace = new ArrayDeque<>();
    private final AtomicBoolean complete = new AtomicBoolean();
    private final AtomicBoolean autoPlay = new AtomicBoolean();
    private final AtomicBoolean slotReleased = new AtomicBoolean();
    private final AtomicReference<SessionStatus> status = new AtomicReference<>(SessionStatus.COMPILING);
    private final LinkedBlockingQueue<ExecutionCommand> commands = new LinkedBlockingQueue<>();
    private final Set<String> userClasses = ConcurrentHashMap.newKeySet();
    private final Set<String> volatileFields = ConcurrentHashMap.newKeySet();
    private final Map<String, FieldAccess> lastFieldAccesses = new ConcurrentHashMap<>();
    private volatile String error;
    private volatile VirtualMachine virtualMachine;
    private volatile Instant lastAccessedAt = Instant.now();

    public ExecutionSession(Path directory, int maxHistory) {
        this.directory = directory;
        this.maxHistory = maxHistory;
    }

    public UUID id() { return id; }
    public Instant createdAt() { return createdAt; }
    public Instant lastAccessedAt() { return lastAccessedAt; }
    public void touch() { lastAccessedAt = Instant.now(); }
    public Path directory() { return directory; }
    public long nextSequence() { return nextSequence.getAndIncrement(); }
    public long stepCount() { return nextSequence.get() - 1; }

    public synchronized List<TraceStep> trace() { return List.copyOf(trace); }
    public synchronized List<TraceStep> traceSince(long sequence) {
        return trace.stream().filter(step -> step.sequence() > sequence).toList();
    }
    public synchronized TraceStep lastStep() { return trace.peekLast(); }
    public synchronized long historyStartSequence() {
        TraceStep first = trace.peekFirst();
        return first == null ? nextSequence.get() : first.sequence();
    }
    public synchronized void add(TraceStep step) {
        trace.addLast(step);
        while (trace.size() > maxHistory) trace.removeFirst();
        status.set(SessionStatus.PAUSED);
        touch();
    }

    public String logicalId(long uniqueId) {
        return logicalObjectIds.computeIfAbsent(uniqueId, ignored -> "@obj" + nextObjectId.getAndIncrement());
    }
    public boolean complete() { return complete.get(); }
    public void complete(boolean value) {
        complete.set(value);
        if (value && status.get() != SessionStatus.STOPPED) {
            status.set(error == null ? SessionStatus.COMPLETED : SessionStatus.FAILED);
        }
        touch();
    }
    public SessionStatus status() { return status.get(); }
    public void status(SessionStatus value) { status.set(value); touch(); }
    public String error() { return error; }
    public void error(String error) { this.error = error; if (error != null) status.set(SessionStatus.FAILED); }
    public VirtualMachine virtualMachine() { return virtualMachine; }
    public void virtualMachine(VirtualMachine vm) { this.virtualMachine = vm; }
    public void command(ExecutionCommand command) { commands.offer(command); touch(); }
    public ExecutionCommand awaitCommand() throws InterruptedException {
        status.set(SessionStatus.PAUSED);
        while (true) {
            ExecutionCommand command = commands.poll();
            if (command != null) { status.set(SessionStatus.RUNNING); return command; }
            if (autoPlay.get()) { status.set(SessionStatus.RUNNING); return ExecutionCommand.OVER; }
            command = commands.poll(30, TimeUnit.SECONDS);
            if (command != null) { status.set(SessionStatus.RUNNING); return command; }
            touch();
        }
    }
    public void autoPlay(boolean enabled) {
        autoPlay.set(enabled);
        if (enabled) commands.offer(ExecutionCommand.OVER);
        touch();
    }
    public boolean autoPlay() { return autoPlay.get(); }
    public boolean releaseExecutionSlot() { return slotReleased.compareAndSet(false, true); }
    public void trackUserClass(String className) { if (className != null && !className.isBlank()) userClasses.add(className); }
    public Set<String> userClasses() { return Set.copyOf(userClasses); }
    public void trackVolatileField(String className, String field) {
        volatileFields.add(className + "." + field);
        volatileFields.add(field);
    }
    public boolean isVolatileField(String field) {
        return volatileFields.contains(field) || volatileFields.stream().anyMatch(candidate -> field.endsWith(candidate));
    }

    public List<JmmEvent> registerFieldAccess(String field, boolean write, long threadId, String threadName) {
        var events = new ArrayList<JmmEvent>();
        boolean volatileField = isVolatileField(field);
        events.add(new JmmEvent(write ? "FIELD_WRITE" : "FIELD_READ", threadId, threadName, field,
                volatileField ? "Volatile field access" : "Bytecode field access", EvidenceType.DERIVED));
        FieldAccess previous = lastFieldAccesses.put(field, new FieldAccess(threadId, write));
        if (volatileField) {
            events.add(new JmmEvent("VOLATILE_ORDER", threadId, threadName, field,
                    "Volatile access participates in synchronization order.", EvidenceType.DERIVED));
        } else if (previous != null && previous.threadId() != threadId && (write || previous.write())) {
            events.add(new JmmEvent("RACE_CANDIDATE", threadId, threadName, field,
                    "Conflicting accesses occurred on different threads; instrumentation is required to prove the race.",
                    EvidenceType.SIMULATED));
        }
        return List.copyOf(events);
    }

    public enum SessionStatus { COMPILING, STARTING, RUNNING, PAUSED, COMPLETED, FAILED, STOPPED }
    public enum ExecutionCommand { INTO, OVER, OUT, CONTINUE, STOP }
    private record FieldAccess(long threadId, boolean write) {}
}
