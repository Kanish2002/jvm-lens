package com.jvmlens.session;

import com.jvmlens.compiler.CompilationService;
import com.jvmlens.debugger.DebugEventLoop;
import com.jvmlens.debugger.JdiLauncher;
import com.jvmlens.parser.SourceAnalyzer;
import com.jvmlens.session.ExecutionSession.ExecutionCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ExecutionService {
    private static final Logger log = LoggerFactory.getLogger(ExecutionService.class);
    private final CompilationService compiler;
    private final SourceAnalyzer sourceAnalyzer;
    private final ExecutionSessionManager sessions;
    private final JdiLauncher launcher;
    private final DebugEventLoop eventLoop;

    public ExecutionService(CompilationService compiler, SourceAnalyzer sourceAnalyzer,
                            ExecutionSessionManager sessions, JdiLauncher launcher, DebugEventLoop eventLoop) {
        this.compiler = compiler;
        this.sourceAnalyzer = sourceAnalyzer;
        this.sessions = sessions;
        this.launcher = launcher;
        this.eventLoop = eventLoop;
    }

    public StartResult start(Map<String, String> sources, String requestedMainClass) throws Exception {
        var session = sessions.create();
        boolean eventLoopStarted = false;
        try {
            if (sources == null) throw new IllegalArgumentException("At least one Java source file is required.");
            var analysis = sourceAnalyzer.analyze(sources);
            analysis.types().forEach(type -> {
                session.trackUserClass(type.name());
                type.volatileFields().forEach(field -> session.trackVolatileField(type.name(), field));
            });
            var compilation = compiler.compile(session.directory(), sources);
            if (!compilation.success()) {
                session.error("Compilation failed");
                session.complete(true);
                sessions.release(session);
                return new StartResult(session.id(), false, session.status().name(),
                        compilation.diagnostics(), analysis, "Compilation failed");
            }
            String mainClass = requestedMainClass == null || requestedMainClass.isBlank() ? "Main" : requestedMainClass;
            var vm = launcher.launch(compilation.classesDirectory(), mainClass);
            session.virtualMachine(vm);
            session.status(ExecutionSession.SessionStatus.STARTING);
            Thread.ofPlatform().daemon().name("jvm-lens-debug-" + session.id()).start(() -> eventLoop.run(session, vm, mainClass));
            eventLoopStarted = true;
            log.info("Execution session {} started for {}", session.id(), mainClass);
            return new StartResult(session.id(), true, session.status().name(),
                    compilation.diagnostics(), analysis, null);
        } catch (Exception exception) {
            session.error(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
            session.complete(true);
            if (!eventLoopStarted) sessions.release(session);
            throw exception;
        }
    }

    public CommandResult command(UUID id, String command) {
        ExecutionSession session = sessions.require(id);
        switch (command.toLowerCase()) {
            case "into" -> session.command(ExecutionCommand.INTO);
            case "over", "next" -> session.command(ExecutionCommand.OVER);
            case "out" -> session.command(ExecutionCommand.OUT);
            case "auto" -> session.autoPlay(!session.autoPlay());
            case "stop" -> sessions.stop(id);
            default -> throw new IllegalArgumentException("Unknown command: " + command);
        }
        return new CommandResult(true, session.autoPlay());
    }

    public ExecutionSession require(UUID id) { return sessions.require(id); }

    public record StartResult(UUID sessionId, boolean compiled, String status,
                              List<CompilationService.CompileDiagnostic> diagnostics,
                              SourceAnalyzer.Analysis analysis, String error) { }
    public record CommandResult(boolean accepted, boolean autoPlay) { }
}
