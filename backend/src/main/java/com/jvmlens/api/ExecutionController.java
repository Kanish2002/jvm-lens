package com.jvmlens.api;

import com.jvmlens.compiler.CompilationService;
import com.jvmlens.debugger.DebugEventLoop;
import com.jvmlens.debugger.JdiLauncher;
import com.jvmlens.parser.SourceAnalyzer;
import com.jvmlens.session.ExecutionSession;
import com.jvmlens.session.ExecutionSession.ExecutionCommand;
import com.jvmlens.session.ExecutionSessionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/executions")
@CrossOrigin(origins = "${JVM_LENS_ALLOWED_ORIGIN:http://localhost:5173}")
public class ExecutionController {
    private final CompilationService compiler;
    private final SourceAnalyzer sourceAnalyzer;
    private final ExecutionSessionManager sessions;
    private final JdiLauncher launcher;
    private final DebugEventLoop eventLoop;

    public ExecutionController(CompilationService compiler, SourceAnalyzer sourceAnalyzer,
                               ExecutionSessionManager sessions, JdiLauncher launcher, DebugEventLoop eventLoop) {
        this.compiler = compiler;
        this.sourceAnalyzer = sourceAnalyzer;
        this.sessions = sessions;
        this.launcher = launcher;
        this.eventLoop = eventLoop;
    }

    @PostMapping
    public StartResponse start(@RequestBody StartRequest request) throws Exception {
        var session = sessions.create();
        var analysis = sourceAnalyzer.analyze(request.sources());
        var compilation = compiler.compile(session.directory(), request.sources());
        if (!compilation.success()) {
            session.complete(true);
            return new StartResponse(session.id(), false, compilation.diagnostics(), analysis, "Compilation failed");
        }
        String mainClass = request.mainClass() == null || request.mainClass().isBlank() ? "Main" : request.mainClass();
        var vm = launcher.launch(compilation.classesDirectory(), mainClass);
        session.virtualMachine(vm);
        Thread.startVirtualThread(() -> eventLoop.run(session, vm, mainClass));
        return new StartResponse(session.id(), true, compilation.diagnostics(), analysis, null);
    }

    @GetMapping("/{id}")
    public SessionResponse session(@PathVariable UUID id) {
        var session = sessions.require(id);
        return new SessionResponse(session.id(), session.complete(), session.error(), session.autoPlay(), session.trace());
    }

    @PostMapping("/{id}/commands/{command}")
    public Map<String, Object> command(@PathVariable UUID id, @PathVariable String command) {
        ExecutionSession session = sessions.require(id);
        switch (command.toLowerCase()) {
            case "into" -> session.command(ExecutionCommand.INTO);
            case "over", "next" -> session.command(ExecutionCommand.OVER);
            case "out" -> session.command(ExecutionCommand.OUT);
            case "auto" -> session.autoPlay(!session.autoPlay());
            case "stop" -> session.command(ExecutionCommand.STOP);
            default -> throw new IllegalArgumentException("Unknown command: " + command);
        }
        return Map.of("accepted", true, "autoPlay", session.autoPlay());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> badRequest(IllegalArgumentException exception) {
        return Map.of("error", exception.getMessage());
    }

    public record StartRequest(Map<String, String> sources, String mainClass) {}
    public record StartResponse(UUID sessionId, boolean compiled, List<CompilationService.CompileDiagnostic> diagnostics,
                                SourceAnalyzer.Analysis analysis, String error) {}
    public record SessionResponse(UUID sessionId, boolean complete, String error, boolean autoPlay,
                                  List<com.jvmlens.trace.TraceModel.TraceStep> trace) {}
}

