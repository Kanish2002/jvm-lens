package com.jvmlens.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvmlens.session.ExecutionSession;
import com.jvmlens.trace.TraceModel.TraceStep;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ExecutionEventPublisher {
    private static final Logger log = LoggerFactory.getLogger(ExecutionEventPublisher.class);
    private final ObjectMapper objectMapper;
    private final Map<UUID, WebSocketSession> sockets = new ConcurrentHashMap<>();

    public ExecutionEventPublisher(ObjectMapper objectMapper) { this.objectMapper = objectMapper; }

    public void register(UUID sessionId, WebSocketSession socket) { sockets.put(sessionId, socket); }
    public void unregister(UUID sessionId, WebSocketSession socket) { sockets.remove(sessionId, socket); }

    public void step(ExecutionSession session, TraceStep step) {
        send(session.id(), Map.of("type", "step", "sessionId", session.id(), "status", session.status().name(),
                "latestSequence", session.stepCount(), "step", step));
    }

    public void complete(ExecutionSession session) {
        var message = new LinkedHashMap<String, Object>();
        message.put("type", "complete");
        message.put("sessionId", session.id());
        message.put("status", session.status().name());
        message.put("latestSequence", session.stepCount());
        message.put("error", session.error());
        send(session.id(), message);
        sockets.remove(session.id());
    }

    public void send(WebSocketSession socket, Object payload) throws IOException {
        synchronized (socket) {
            if (socket.isOpen()) socket.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
        }
    }

    private void send(UUID sessionId, Object payload) {
        WebSocketSession socket = sockets.get(sessionId);
        if (socket == null) return;
        try {
            send(socket, payload);
        } catch (Exception exception) {
            sockets.remove(sessionId, socket);
            log.debug("Detached closed WebSocket from execution session {}: {}", sessionId, exception.getMessage());
        }
    }
}
