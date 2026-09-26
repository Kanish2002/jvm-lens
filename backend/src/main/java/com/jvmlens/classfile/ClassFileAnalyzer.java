package com.jvmlens.classfile;

import com.jvmlens.trace.TraceModel.BytecodeInstruction;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.DataInputStream;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class ClassFileAnalyzer {
    private static final Pattern INSTRUCTION = Pattern.compile("^\\s*(\\d+):\\s+([a-z0-9_]+)(?:\\s+(.*))?$");
    private static final Pattern LINE_NUMBER = Pattern.compile("^\\s*line\\s+(\\d+):\\s+(\\d+)$");
    private final Map<CacheKey, List<BytecodeInstruction>> cache = new ConcurrentHashMap<>();

    public List<BytecodeInstruction> analyze(Path classesDir, String className) {
        CacheKey key = new CacheKey(classesDir.toAbsolutePath().normalize(), className);
        return cache.computeIfAbsent(key, ignored -> analyzeUncached(classesDir, className));
    }

    public void clear(Path classesDir) {
        Path normalized = classesDir.toAbsolutePath().normalize();
        cache.keySet().removeIf(key -> key.classesDir().equals(normalized));
    }

    private List<BytecodeInstruction> analyzeUncached(Path classesDir, String className) {
        try {
            Path classPath = classesDir.resolve(className.replace('.', '/') + ".class");
            try (var input = new DataInputStream(Files.newInputStream(classPath))) {
                if (input.readInt() != 0xCAFEBABE) return List.of();
            }
            Process process = new ProcessBuilder(javaTool("javap"), "-classpath", classesDir.toString(),
                    "-c", "-l", "-p", className).redirectErrorStream(true).start();

            Map<String, List<RawInstruction>> byMethod = new LinkedHashMap<>();
            Map<String, TreeMap<Integer, Integer>> linesByMethod = new LinkedHashMap<>();
            String currentMethod = "<unknown>";
            try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String parsedMethod = parseMethodHeader(line, className);
                    if (parsedMethod != null) currentMethod = parsedMethod;
                    var lineMatcher = LINE_NUMBER.matcher(line);
                    if (lineMatcher.matches()) {
                        linesByMethod.computeIfAbsent(currentMethod, ignored -> new TreeMap<>())
                                .put(Integer.parseInt(lineMatcher.group(2)), Integer.parseInt(lineMatcher.group(1)));
                    }
                    var instructionMatcher = INSTRUCTION.matcher(line);
                    if (instructionMatcher.matches()) {
                        byMethod.computeIfAbsent(currentMethod, ignored -> new ArrayList<>()).add(new RawInstruction(
                                Integer.parseInt(instructionMatcher.group(1)), instructionMatcher.group(2),
                                instructionMatcher.group(3) == null ? "" : instructionMatcher.group(3)));
                    }
                }
            }
            if (process.waitFor() != 0) return List.of();

            var result = new ArrayList<BytecodeInstruction>();
            byMethod.forEach((method, instructions) -> {
                TreeMap<Integer, Integer> lineNumbers = linesByMethod.getOrDefault(method, new TreeMap<>());
                for (RawInstruction instruction : instructions) {
                    var source = lineNumbers.floorEntry(instruction.offset());
                    result.add(new BytecodeInstruction(method, instruction.offset(), instruction.mnemonic(),
                            instruction.detail(), source == null ? null : source.getValue()));
                }
            });
            return List.copyOf(result);
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String parseMethodHeader(String line, String className) {
        String trimmed = line.trim();
        if (trimmed.equals("static {};")) return "<clinit>";
        if (!trimmed.endsWith(");") || !trimmed.contains("(")) return null;
        String beforeArguments = trimmed.substring(0, trimmed.indexOf('(')).trim();
        if (beforeArguments.isEmpty()) return null;
        String name = beforeArguments.substring(beforeArguments.lastIndexOf(' ') + 1);
        String simpleClass = className.substring(className.lastIndexOf('.') + 1);
        return name.equals(simpleClass) || name.equals(className) ? "<init>" : name;
    }

    private String javaTool(String command) {
        String executable = System.getProperty("os.name").toLowerCase().contains("win") ? command + ".exe" : command;
        return Path.of(System.getProperty("java.home"), "bin", executable).toString();
    }

    private record CacheKey(Path classesDir, String className) { }
    private record RawInstruction(int offset, String mnemonic, String detail) { }
}
