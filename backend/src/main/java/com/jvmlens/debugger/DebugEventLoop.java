package com.jvmlens.debugger;

import com.jvmlens.classfile.ClassFileAnalyzer;
import com.jvmlens.memory.MemoryMonitor;
import com.jvmlens.session.ExecutionSession;
import com.jvmlens.session.ExecutionSession.ExecutionCommand;
import com.jvmlens.trace.TraceDiffer;
import com.jvmlens.trace.TraceModel.Location;
import com.jvmlens.trace.TraceModel.ThreadState;
import com.jvmlens.trace.TraceModel.TraceStep;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.VMDisconnectedException;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.LocatableEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.event.VMStartEvent;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.StepRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class DebugEventLoop {
    private final StackHeapSnapshotter snapshotter;
    private final TraceDiffer differ;
    private final MemoryMonitor memory;
    private final ClassFileAnalyzer bytecode;
    private final SimpMessagingTemplate messaging;
    private final int maxSteps;
    private final int maxOutput;

    public DebugEventLoop(StackHeapSnapshotter snapshotter, TraceDiffer differ, MemoryMonitor memory,
                          ClassFileAnalyzer bytecode, SimpMessagingTemplate messaging,
                          @Value("${jvm-lens.max-steps}") int maxSteps,
                          @Value("${jvm-lens.max-output-bytes}") int maxOutput) {
        this.snapshotter = snapshotter;
        this.differ = differ;
        this.memory = memory;
        this.bytecode = bytecode;
        this.messaging = messaging;
        this.maxSteps = maxSteps;
        this.maxOutput = maxOutput;
    }

    public void run(ExecutionSession session, VirtualMachine vm, String mainClass) {
        ConsoleCapture stdout = new ConsoleCapture(vm.process().getInputStream(), maxOutput);
        ConsoleCapture stderr = new ConsoleCapture(vm.process().getErrorStream(), maxOutput);
        try {
            memory.connect(vm);
            ClassPrepareRequest prepare = vm.eventRequestManager().createClassPrepareRequest();
            prepare.addClassFilter(mainClass);
            prepare.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            prepare.enable();
            boolean alive = true;
            while (alive && session.trace().size() < maxSteps) {
                var eventSet = vm.eventQueue().remove(10_000);
                if (eventSet == null) throw new IllegalStateException("Execution timed out while waiting for a JVM event.");
                for (var event : eventSet) {
                    if (event instanceof ClassPrepareEvent cp) {
                        var method = cp.referenceType().methodsByName("main").stream().findFirst();
                        if (method.isPresent() && !method.get().allLineLocations().isEmpty()) {
                            var breakpoint = vm.eventRequestManager().createBreakpointRequest(method.get().allLineLocations().getFirst());
                            breakpoint.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                            breakpoint.enable();
                        }
                    } else if (event instanceof BreakpointEvent breakpoint) {
                        record(session, "BREAKPOINT", breakpoint, stdout.value(), stderr.value());
                        installStep(vm, breakpoint.thread(), session.awaitCommand());
                    } else if (event instanceof StepEvent step) {
                        step.request().disable();
                        vm.eventRequestManager().deleteEventRequest(step.request());
                        record(session, "LINE_STEP", step, stdout.value(), stderr.value());
                        installStep(vm, step.thread(), session.awaitCommand());
                    } else if (event instanceof ExceptionEvent exception) {
                        record(session, "EXCEPTION", exception, stdout.value(), stderr.value());
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        alive = false;
                    } else if (event instanceof VMStartEvent) {
                        // The launch connector starts suspended; ClassPrepare establishes the real entry breakpoint.
                    }
                }
                eventSet.resume();
            }
            if (session.trace().size() >= maxSteps) session.error("Maximum step count reached.");
        } catch (VMDisconnectedException ignored) {
        } catch (Exception exception) {
            session.error(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
        } finally {
            session.complete(true);
            messaging.convertAndSend("/topic/session/" + session.id(), Map.of("type", "complete", "error", session.error() == null ? "" : session.error()));
            try { vm.dispose(); } catch (Exception ignored) {}
        }
    }

    private void installStep(VirtualMachine vm, ThreadReference thread, ExecutionCommand command) {
        if (command == ExecutionCommand.STOP) { vm.exit(143); return; }
        int depth = switch (command) {
            case INTO -> StepRequest.STEP_INTO;
            case OUT -> StepRequest.STEP_OUT;
            default -> StepRequest.STEP_OVER;
        };
        StepRequest request = vm.eventRequestManager().createStepRequest(thread, StepRequest.STEP_LINE, depth);
        for (String prefix : List.of("java.*", "jdk.*", "sun.*", "com.sun.*", "org.springframework.*")) request.addClassExclusionFilter(prefix);
        request.addCountFilter(1);
        request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        request.enable();
    }

    private void record(ExecutionSession session, String eventName, LocatableEvent event, String stdout, String stderr) {
        var loc = event.location();
        var captured = snapshotter.capture(session, event.thread());
        var location = new Location(loc.declaringType().name(), loc.method().name(), safeSource(loc), loc.lineNumber(), loc.codeIndex());
        var thread = new ThreadState(event.thread().uniqueID(), event.thread().name(), threadStatus(event.thread().status()));
        var instructions = bytecode.analyze(session.directory().resolve("classes"), loc.declaringType().name());
        var provisional = new TraceStep(session.trace().size() + 1L, eventName, location, thread,
                captured.frames(), captured.heap(), captured.statics(), instructions, memory.snapshot(), List.of(), stdout, stderr, null);
        TraceStep previous = session.trace().isEmpty() ? null : session.trace().getLast();
        var completed = new TraceStep(provisional.sequence(), provisional.event(), provisional.location(), provisional.thread(),
                provisional.stackFrames(), provisional.heap(), provisional.staticFields(), provisional.bytecode(), provisional.memory(),
                provisional.gcEvents(), provisional.stdout(), provisional.stderr(), differ.compare(previous, provisional));
        session.add(completed);
        messaging.convertAndSend("/topic/session/" + session.id(), completed);
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
