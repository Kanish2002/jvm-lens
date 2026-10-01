package com.jvmlens.compiler;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class CompilationService {
    private final long maxSourceBytes;

    public CompilationService(@Value("${jvm-lens.max-source-bytes}") long maxSourceBytes) {
        this.maxSourceBytes = maxSourceBytes;
    }

    public CompilationResult compile(Path sessionDir, Map<String, String> sources) throws IOException {
        if (sources.isEmpty() || sources.size() > 20) {
            return new CompilationResult(false, List.of(new CompileDiagnostic("", 0, 0, "ERROR", "Provide 1 to 20 Java source files.")), null);
        }
        long bytes = sources.values().stream().mapToLong(s -> s.getBytes(StandardCharsets.UTF_8).length).sum();
        if (bytes > maxSourceBytes) {
            return new CompilationResult(false, List.of(new CompileDiagnostic("", 0, 0, "ERROR", "Source exceeds the configured size limit.")), null);
        }
        var sourceDir = Files.createDirectories(sessionDir.resolve("src"));
        var classesDir = Files.createDirectories(sessionDir.resolve("classes"));
        var sourcePaths = new ArrayList<Path>();
        for (var entry : sources.entrySet()) {
            String filename = sanitizeFilename(entry.getKey());
            Path path = sourceDir.resolve(filename);
            Files.writeString(path, entry.getValue(), StandardCharsets.UTF_8);
            sourcePaths.add(path);
        }
        var compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("JVM Lens requires a full JDK; no system Java compiler is available.");
        var diagnostics = new DiagnosticCollector<JavaFileObject>();
        try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            var units = files.getJavaFileObjectsFromPaths(sourcePaths);
            var options = List.of("-g", "-parameters", "-encoding", "UTF-8", "-d", classesDir.toString());
            boolean ok = Boolean.TRUE.equals(compiler.getTask(null, files, diagnostics, options, null, units).call());
            var mapped = diagnostics.getDiagnostics().stream().map(this::mapDiagnostic).toList();
            return new CompilationResult(ok, mapped, classesDir);
        }
    }

    private CompileDiagnostic mapDiagnostic(Diagnostic<? extends JavaFileObject> diagnostic) {
        String file = diagnostic.getSource() == null ? "" : Path.of(diagnostic.getSource().toUri()).getFileName().toString();
        return new CompileDiagnostic(file, diagnostic.getLineNumber(), diagnostic.getColumnNumber(),
                diagnostic.getKind().name(), diagnostic.getMessage(null));
    }

    private String sanitizeFilename(String name) {
        if (!name.matches("[A-Za-z_$][A-Za-z0-9_$]*\\.java")) {
            throw new IllegalArgumentException("Invalid Java filename: " + name);
        }
        return name;
    }

    public record CompileDiagnostic(String file, long line, long column, String kind, String message) {}
    public record CompilationResult(boolean success, List<CompileDiagnostic> diagnostics, Path classesDirectory) {}
}

