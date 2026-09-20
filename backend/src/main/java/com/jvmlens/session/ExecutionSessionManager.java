package com.jvmlens.session;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ExecutionSessionManager {
    private final Path workspace;
    private final Map<UUID, ExecutionSession> sessions = new ConcurrentHashMap<>();

    public ExecutionSessionManager(@Value("${jvm-lens.workspace}") Path workspace) throws IOException {
        this.workspace = workspace;
        Files.createDirectories(workspace);
    }
    public ExecutionSession create() throws IOException {
        var session = new ExecutionSession(Files.createTempDirectory(workspace, "session-"));
        sessions.put(session.id(), session);
        return session;
    }
    public ExecutionSession require(UUID id) {
        var session = sessions.get(id);
        if (session == null) throw new IllegalArgumentException("Unknown execution session: " + id);
        return session;
    }
    public void stop(UUID id) {
        var session = require(id);
        if (session.virtualMachine() != null) {
            try { session.virtualMachine().exit(143); } catch (Exception ignored) {}
        }
        session.complete(true);
    }
}
