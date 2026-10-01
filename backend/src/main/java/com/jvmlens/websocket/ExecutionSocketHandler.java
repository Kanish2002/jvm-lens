package com.jvmlens.websocket;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvmlens.session.ExecutionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ExecutionSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(ExecutionSocketHandler.class);
    private final ObjectMapper objectMapper;
    private final ExecutionService executions;
    private final ExecutionEventPublisher publisher;
    private final Map<String, UUID> activeSessions = new ConcurrentHashMap<>();

    public ExecutionSocketHandler(ObjectMapper objectMapper, ExecutionService executions,
                                  ExecutionEventPublisher publisher) {
        this.objectMapper = objectMapper;
        this.executions = executions;
        this.publisher = publisher;
    }

    @Override
    protected void handleTextMessage(WebSocketSession socket, TextMessage message) {
        String type = "unknown";
        try {
            JsonNode payload = objectMapper.readTree(message.getPayload());
            type = payload.path("type").asText();
            if ("start".equals(type)) {
                Map<String, String> sources = objectMapper.convertValue(payload.path("sources"), new TypeReference<>() { });
                var result = executions.start(sources, payload.path("mainClass").asText("Main"));
                var response = new LinkedHashMap<String, Object>();
                response.put("type", "started");
                response.put("sessionId", result.sessionId());
                response.put("compiled", result.compiled());
                response.put("status", result.status());
                response.put("diagnostics", result.diagnostics());
                response.put("analysis", result.analysis());
                response.put("error", result.error());
                if (result.compiled()) {
                    activeSessions.put(socket.getId(), result.sessionId());
                    publisher.register(result.sessionId(), socket);
                }
                safeSend(socket, response);
                if (result.compiled()) {
                    var session = executions.require(result.sessionId());
                    session.trace().forEach(step -> publisher.step(session, step));
                    if (session.complete()) publisher.complete(session);
                }
            } else if ("command".equals(type)) {
                UUID sessionId = activeSessions.get(socket.getId());
                if (sessionId == null) throw new IllegalArgumentException("Start an execution before sending commands.");
                var result = executions.command(sessionId, payload.path("command").asText());
                safeSend(socket, Map.of("type", "command-accepted", "accepted", result.accepted(),
                        "autoPlay", result.autoPlay()));
            } else {
                throw new IllegalArgumentException("Unknown socket message: " + type);
            }
        } catch (Exception exception) {
            log.warn("WebSocket request failed (socket={}, type={}): {}", socket.getId(), type,
                    exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
            safeSend(socket, Map.of("type", "error", "message",
                    exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage()));
        }
    }

    private void safeSend(WebSocketSession socket, Object payload) {
        try {
            publisher.send(socket, payload);
        } catch (Exception exception) {
            log.debug("Could not send WebSocket response to {}: {}", socket.getId(), exception.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession socket, CloseStatus status) {
        UUID sessionId = activeSessions.remove(socket.getId());
        if (sessionId == null) return;
        publisher.unregister(sessionId, socket);
        log.info("WebSocket detached from execution session {} with status {}; REST polling can continue", sessionId, status);
    }
}
