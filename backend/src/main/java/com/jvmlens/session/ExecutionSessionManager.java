package com.jvmlens.session;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

@Service
public class ExecutionSessionManager {
    private static final Logger log = LoggerFactory.getLogger(ExecutionSessionManager.class);
    private final Path workspace;
    private final int maxHistory;
    private final Duration sessionTtl;
    private final Map<UUID, ExecutionSession> sessions = new ConcurrentHashMap<>();
    private final Semaphore executionSlots;

    public ExecutionSessionManager(
            @Value("${jvm-lens.workspace}") Path workspace,
            @Value("${jvm-lens.max-history:500}") int maxHistory,
            @Value("${jvm-lens.session-ttl-seconds:900}") long sessionTtlSeconds,
            @Value("${jvm-lens.max-concurrent-executions:2}") int maxConcurrentExecutions
    ) throws IOException {
        this.workspace = workspace.toAbsolutePath().normalize();
        this.maxHistory = maxHistory;
        this.sessionTtl = Duration.ofSeconds(sessionTtlSeconds);
        this.executionSlots = new Semaphore(maxConcurrentExecutions, true);
        Files.createDirectories(this.workspace);
    }

    public ExecutionSession create() throws IOException {
        if (!executionSlots.tryAcquire()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "JVM Lens is at its execution limit. Please retry shortly.");
        }
        try {
            var session = new ExecutionSession(Files.createTempDirectory(workspace, "session-"), maxHistory);
            sessions.put(session.id(), session);
            return session;
        } catch (IOException exception) {
            executionSlots.release();
            throw exception;
        }
    }

    public ExecutionSession require(UUID id) {
        var session = sessions.get(id);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown or expired execution session: " + id);
        }
        session.touch();
        return session;
    }

    public void release(ExecutionSession session) {
        if (session.releaseExecutionSlot()) executionSlots.release();
        session.touch();
    }

    public void stop(UUID id) {
        var session = require(id);
        session.status(ExecutionSession.SessionStatus.STOPPED);
        session.command(ExecutionSession.ExecutionCommand.STOP);
        if (session.virtualMachine() != null) {
            try { session.virtualMachine().exit(143); } catch (Exception ignored) { }
        }
        session.complete(true);
    }

    @Scheduled(fixedDelayString = "${jvm-lens.cleanup-interval-ms:60000}")
    public void cleanupExpired() {
        Instant cutoff = Instant.now().minus(sessionTtl);
        sessions.values().stream()
                .filter(session -> session.lastAccessedAt().isBefore(cutoff))
                .toList()
                .forEach(session -> {
                    if (!session.complete()) {
                        log.info("Stopping abandoned execution session {} after {} seconds without client activity",
                                session.id(), sessionTtl.toSeconds());
                        stop(session.id());
                    }
                    remove(session);
                });
    }

    private void remove(ExecutionSession session) {
        if (!sessions.remove(session.id(), session)) return;
        release(session);
        Path directory = session.directory().toAbsolutePath().normalize();
        if (!directory.startsWith(workspace) || directory.equals(workspace)) return;
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) { }
    }

    @PreDestroy
    public void shutdown() {
        log.info("Backend shutdown requested; stopping {} execution session(s)", sessions.size());
        sessions.values().forEach(session -> {
            if (!session.complete()) {
                session.error("The backend instance restarted while this execution was active. Run the code again.");
                session.complete(true);
            }
            if (session.virtualMachine() != null) {
                try { session.virtualMachine().exit(143); } catch (Exception ignored) { }
            }
            release(session);
        });
    }
}
