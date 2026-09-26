package com.jvmlens.api;

import com.jvmlens.session.ExecutionService;
import com.jvmlens.session.ExecutionSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/executions")
public class ExecutionController {
    private final ExecutionService executions;

    public ExecutionController(ExecutionService executions) { this.executions = executions; }

    @PostMapping
    public ExecutionService.StartResult start(@RequestBody StartRequest request) throws Exception {
        return executions.start(request.sources(), request.mainClass());
    }

    @GetMapping("/{id}")
    public SessionResponse session(@PathVariable UUID id, @RequestParam(defaultValue = "0") long after) {
        ExecutionSession session = executions.require(id);
        long historyStart = session.historyStartSequence();
        boolean reset = after > 0 && after < historyStart - 1;
        var trace = reset ? session.trace() : session.traceSince(Math.max(after, 0));
        return new SessionResponse(session.id(), session.status().name(), session.complete(), session.error(),
                session.autoPlay(), historyStart, session.stepCount(), reset, trace);
    }

    @PostMapping("/{id}/commands/{command}")
    public ExecutionService.CommandResult command(@PathVariable UUID id, @PathVariable String command) {
        return executions.command(id, command);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> badRequest(IllegalArgumentException exception) {
        return Map.of("error", exception.getMessage());
    }

    public record StartRequest(Map<String, String> sources, String mainClass) { }
    public record SessionResponse(UUID sessionId, String status, boolean complete, String error, boolean autoPlay,
                                  long historyStartSequence, long latestSequence, boolean reset,
                                  List<com.jvmlens.trace.TraceModel.TraceStep> trace) { }
}
