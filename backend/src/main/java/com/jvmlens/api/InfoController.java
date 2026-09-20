package com.jvmlens.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class InfoController {
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "jdk", Runtime.version().toString(), "engine", "javac + JDI");
    }

    @GetMapping("/capabilities")
    public Map<String, Object> capabilities() {
        return Map.of(
                "observed", List.of("source locations", "stack frames", "locals", "object fields", "arrays", "statics", "threads", "console", "aggregate memory"),
                "derived", List.of("logical object graph", "tracked-root reachability", "snapshot diffs", "source/bytecode relationship"),
                "simulated", List.of("per-object Eden placement", "survivor age", "promotion"),
                "unavailable", List.of("physical addresses", "exact G1 region per object", "complete JNI/off-heap graph", "ObjectFree without JVMTI")
        );
    }
}

