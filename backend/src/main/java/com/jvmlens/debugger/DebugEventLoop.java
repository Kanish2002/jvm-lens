package com.jvmlens.debugger;

import com.jvmlens.classfile.ClassFileAnalyzer;
import com.jvmlens.memory.MemoryMonitor;
import com.jvmlens.session.ExecutionSession;
import com.jvmlens.session.ExecutionSession.ExecutionCommand;
import com.jvmlens.session.ExecutionSession.SessionStatus;
import com.jvmlens.session.ExecutionSessionManager;
import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceDiffer;
import com.jvmlens.trace.TraceModel.JmmEvent;
import com.jvmlens.trace.TraceModel.Location;
import com.jvmlens.trace.TraceModel.ThreadState;
import com.jvmlens.trace.TraceModel.TraceStep;
import com.jvmlens.websocket.ExecutionEventPublisher;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.VMDisconnectedException;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.LocatableEvent;
import com.sun.jdi.event.ModificationWatchpointEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.ModificationWatchpointRequest;
import com.sun.jdi.request.StepRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class DebugEventLoop {
    private static final Logger log = LoggerFactory.getLogger(DebugEventLoop.class);
    private final StackHeapSnapshotter snapshotter;
    private final TraceDiffer differ;
    private final MemoryMonitor memory;
    private final ClassFileAnalyzer bytecode;
    private final ExecutionEventPublisher events;
    private final ExecutionSessionManager sessions;
    private final int maxSteps;
    private final int maxOutput;

    public DebugEventLoop(StackHeapSnapshotter snapshotter, TraceDiffer differ, MemoryMonitor memory,
                          ClassFileAnalyzer bytecode, ExecutionEventPublisher events,
                          ExecutionSessionManager sessions,
                          @Value("${jvm-lens.max-steps}") int maxSteps,
                          @Value("${jvm-lens.max-output-bytes}") int maxOutput) {
        this.snapshotter = snapshotter;
        this.differ = differ;
        this.memory = memory;
        this.bytecode = bytecode;
        this.events = events;
        this.sessions = sessions;
        this.maxSteps = maxSteps;
        this.maxOutput = maxOutput;
    }

    public void run(ExecutionSession session, VirtualMachine vm, String mainClass) {
        var stdout = new ConsoleCapture(vm.process().getInputStream(), maxOutput);
        var stderr = new ConsoleCapture(vm.process().getErrorStream(), maxOutput);
        var probe = memory.createProbe();
        session.status(SessionStatus.STARTING);
        try {
            Thread.ofPlatform().daemon().name("jvm-lens-probe-" + session.id()).start(() -> probe.connect(vm));
            installRequests(session, vm, mainClass);
            session.status(SessionStatus.RUNNING);
            boolean alive = true;
            while (alive && session.stepCount() < maxSteps) {
                var eventSet = vm.eventQueue().remove(30_000);
                if (eventSet == null) throw new IllegalStateException("Execution timed out while waiting for a JVM event.");
                for (var event : eventSet) {
                    if (event instanceof ClassPrepareEvent prepared) {
                        session.trackUserClass(prepared.referenceType().name());
                        if (prepared.referenceType().name().equals(mainClass)) installMainBreakpoint(vm, prepared);
                    } else if (event instanceof BreakpointEvent breakpoint) {
                        record(session, "BREAKPOINT", breakpoint, stdout.value(), stderr.value(), probe);
                        installFieldWatchpoints(session, vm);
                        installStep(vm, breakpoint.thread(), session.awaitCommand());
                    } else if (event instanceof StepEvent step) {
                        step.request().disable();
                        vm.eventRequestManager().deleteEventRequest(step.request());
                        record(session, "LINE_STEP", step, stdout.value(), stderr.value(), probe);
                        installStep(vm, step.thread(), session.awaitCommand());
                    } else if (event instanceof ExceptionEvent exception) {
                        record(session, "EXCEPTION", exception, stdout.value(), stderr.value(), probe);
                    } else if (event instanceof ModificationWatchpointEvent fieldWrite) {
                        record(session, "FIELD_WRITE", fieldWrite, stdout.value(), stderr.value(), probe);
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        alive = false;
                    }
                }
                eventSet.resume();
            }
            if (session.stepCount() >= maxSteps) session.error("Maximum step count reached.");
        } catch (VMDisconnectedException ignored) {
            // Normal when the debuggee exits between events.
        } catch (Exception exception) {
            log.warn("Execution session {} failed", session.id(), exception);
            session.error(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
        } finally {
            session.complete(true);
            events.complete(session);
            log.info("Execution session {} completed with status {} after {} steps{}", session.id(),
                    session.status(), session.stepCount(), session.error() == null ? "" : ": " + session.error());
            try { vm.dispose(); } catch (Exception ignored) { }
            probe.close();
            bytecode.clear(session.directory().resolve("classes"));
            sessions.release(session);
        }
    }

    private void installRequests(ExecutionSession session, VirtualMachine vm, String mainClass) {
        for (String className : session.userClasses()) {
            var prepare = vm.eventRequestManager().createClassPrepareRequest();
            prepare.addClassFilter(className);
            prepare.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            prepare.enable();
        }

        var exceptions = vm.eventRequestManager().createExceptionRequest(null, true, true);
        for (String prefix : List.of("java.*", "jdk.*", "sun.*", "com.sun.*")) {
            exceptions.addClassExclusionFilter(prefix);
        }
        exceptions.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        exceptions.enable();
    }

    private void installFieldWatchpoints(ExecutionSession session, VirtualMachine vm) {
        if (!vm.canWatchFieldModification()) return;
        try {
            for (String className : session.userClasses()) {
                for (var type : vm.classesByName(className)) {
                    for (com.sun.jdi.Field field : type.fields()) {
                        ModificationWatchpointRequest request = vm.eventRequestManager().createModificationWatchpointRequest(field);
                        request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        request.enable();
                    }
                }
            }
        } catch (Exception exception) {
            log.debug("Could not install field watchpoints", exception);
        }
    }

    private void installMainBreakpoint(VirtualMachine vm, ClassPrepareEvent classPrepare) {
        try {
            var mainMethod = classPrepare.referenceType().methodsByName("main").stream()
                    .filter(method -> method.isStatic()).findFirst();
            if (mainMethod.isEmpty()) return;
            var locations = mainMethod.get().allLineLocations();
            if (locations.isEmpty()) return;
            var breakpoint = vm.eventRequestManager().createBreakpointRequest(locations.getFirst());
            breakpoint.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            breakpoint.enable();
        } catch (Exception exception) {
            log.debug("Could not install main breakpoint", exception);
        }
    }

    private void installStep(VirtualMachine vm, ThreadReference thread, ExecutionCommand command) {
        if (command == ExecutionCommand.STOP) {
            vm.exit(143);
            return;
        }
        int depth = switch (command) {
            case INTO -> StepRequest.STEP_INTO;
            case OUT -> StepRequest.STEP_OUT;
            default -> StepRequest.STEP_OVER;
        };
        StepRequest request = vm.eventRequestManager().createStepRequest(thread, StepRequest.STEP_LINE, depth);
        for (String prefix : List.of("java.*", "jdk.*", "sun.*", "com.sun.*", "org.springframework.*")) {
            request.addClassExclusionFilter(prefix);
        }
        request.addCountFilter(1);
        request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        request.enable();
    }

    private void record(ExecutionSession session, String eventName, LocatableEvent event,
                        String stdout, String stderr, MemoryMonitor.Probe probe) {
        long started = System.nanoTime();
        var loc = event.location();
        var captured = snapshotter.capture(session, event.thread());
        var location = new Location(loc.declaringType().name(), loc.method().name(), safeSource(loc),
                loc.lineNumber(), loc.codeIndex());
        var thread = new ThreadState(event.thread().uniqueID(), event.thread().name(), threadStatus(event.thread().status()));
        var instructions = bytecode.analyze(session.directory().resolve("classes"), loc.declaringType().name());
        TraceStep previous = session.lastStep();
        long sequence = session.nextSequence();
        var memoryState = previous == null || sequence % 5 == 1 ? probe.snapshot() : previous.memory();
        var jmmEvents = deriveJmmEvents(session, previous, thread, location, instructions, event);

        var provisional = new TraceStep(sequence, eventName, location, thread, captured.frames(), captured.threads(),
                captured.heap(), captured.statics(), instructions, memoryState, List.of(), jmmEvents,
                stdout, stderr, null);
        var completed = new TraceStep(provisional.sequence(), provisional.event(), provisional.location(),
                provisional.thread(), provisional.stackFrames(), provisional.threads(), provisional.heap(),
                provisional.staticFields(), provisional.bytecode(), provisional.memory(), provisional.gcEvents(),
                provisional.jmmEvents(), provisional.stdout(), provisional.stderr(), differ.compare(previous, provisional));
        session.add(completed);
        events.step(session, completed);
        log.debug("Captured session {} step {} at {}:{} in {} ms", session.id(), sequence,
                location.className(), location.line(), (System.nanoTime() - started) / 1_000_000);
    }

    private List<JmmEvent> deriveJmmEvents(ExecutionSession session, TraceStep previous, ThreadState thread,
                                           Location location,
                                           List<com.jvmlens.trace.TraceModel.BytecodeInstruction> instructions,
                                           LocatableEvent event) {
        var events = new ArrayList<JmmEvent>();
        if (previous != null && previous.thread().id() == thread.id()) {
            events.add(new JmmEvent("PROGRAM_ORDER", thread.id(), thread.name(), "",
                    "Step " + previous.sequence() + " happens before step " + (previous.sequence() + 1) + " in this thread.",
                    EvidenceType.DERIVED));
        }
        if (event instanceof ModificationWatchpointEvent write) {
            String field = write.field().declaringType().name() + "." + write.field().name();
            events.addAll(session.registerFieldAccess(field, true, thread.id(), thread.name()));
            return List.copyOf(events);
        }
        instructions.stream()
                .filter(instruction -> instruction.methodName().equals(location.methodName()))
                .filter(instruction -> instruction.offset() == location.bytecodeOffset())
                .findFirst()
                .ifPresent(instruction -> {
                    String mnemonic = instruction.mnemonic();
                    if (List.of("getfield", "getstatic", "putfield", "putstatic").contains(mnemonic)) {
                        String field = fieldName(instruction.detail());
                        events.addAll(session.registerFieldAccess(field, mnemonic.startsWith("put"), thread.id(), thread.name()));
                    } else if (mnemonic.equals("monitorenter") || mnemonic.equals("monitorexit")) {
                        events.add(new JmmEvent("MONITOR", thread.id(), thread.name(), "monitor",
                                mnemonic.equals("monitorenter") ? "Monitor acquired." : "Monitor released.", EvidenceType.OBSERVED));
                    }
                });
        return List.copyOf(events);
    }

    private String fieldName(String detail) {
        int marker = detail.indexOf("Field ");
        String value = marker >= 0 ? detail.substring(marker + 6) : detail;
        int colon = value.indexOf(':');
        return (colon >= 0 ? value.substring(0, colon) : value).trim().replace('/', '.');
    }

    private String safeSource(com.sun.jdi.Location location) {
        try { return location.sourceName(); } catch (Exception ignored) { return "Unknown.java"; }
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
}
