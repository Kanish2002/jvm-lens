package com.jvmlens.session;

import com.jvmlens.trace.TraceModel.TraceStep;
import com.sun.jdi.VirtualMachine;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public final class ExecutionSession {
    private final UUID id = UUID.randomUUID();
    private final Instant createdAt = Instant.now();
    private final Path directory;
    private final Map<Long, String> logicalObjectIds = new ConcurrentHashMap<>();
    private final AtomicLong nextObjectId = new AtomicLong(1);
    private final List<TraceStep> trace = new CopyOnWriteArrayList<>();
    private final AtomicBoolean complete = new AtomicBoolean();
    private final AtomicBoolean autoPlay = new AtomicBoolean();
    private final LinkedBlockingQueue<ExecutionCommand> commands = new LinkedBlockingQueue<>();
    private volatile String error;
    private volatile VirtualMachine virtualMachine;

    public ExecutionSession(Path directory) { this.directory = directory; }
    public UUID id() { return id; }
    public Instant createdAt() { return createdAt; }
    public Path directory() { return directory; }
    public List<TraceStep> trace() { return List.copyOf(trace); }
    public void add(TraceStep step) { trace.add(step); }
    public String logicalId(long uniqueId) {
        return logicalObjectIds.computeIfAbsent(uniqueId, ignored -> "@obj" + nextObjectId.getAndIncrement());
    }
    public boolean complete() { return complete.get(); }
    public void complete(boolean value) { complete.set(value); }
    public String error() { return error; }
    public void error(String error) { this.error = error; }
    public VirtualMachine virtualMachine() { return virtualMachine; }
    public void virtualMachine(VirtualMachine vm) { this.virtualMachine = vm; }
    public void command(ExecutionCommand command) { commands.offer(command); }
    public ExecutionCommand awaitCommand() throws InterruptedException {
        return autoPlay.get() ? ExecutionCommand.OVER : commands.take();
    }
    public void autoPlay(boolean enabled) { autoPlay.set(enabled); if (enabled) commands.offer(ExecutionCommand.OVER); }
    public boolean autoPlay() { return autoPlay.get(); }
    public enum ExecutionCommand { INTO, OVER, OUT, CONTINUE, STOP }
}
