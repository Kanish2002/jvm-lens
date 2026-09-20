package com.jvmlens.classfile;

import com.jvmlens.trace.TraceModel.BytecodeInstruction;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.classfile.ClassFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Map;
import java.util.TreeMap;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class ClassFileAnalyzer {
    private static final Pattern INSTRUCTION = Pattern.compile("^\\s*(\\d+):\\s+([a-z0-9_]+)(?:\\s+(.*))?$");
    private static final Pattern LINE_NUMBER = Pattern.compile("^\\s*line\\s+(\\d+):\\s+(\\d+)$");

    public List<BytecodeInstruction> analyze(Path classesDir, String className) {
        try {
            // Parse with the standard JDK Class-File API first. javap below is used only as
            // the JDK-owned textual instruction renderer; it is not a second compiler.
            Path classPath = classesDir.resolve(className.replace('.', '/') + ".class");
            ClassFile.of().parse(classPath);
            Process process = new ProcessBuilder(javaTool("javap"), "-classpath", classesDir.toString(), "-c", "-l", "-p", className)
                    .redirectErrorStream(true).start();
            var result = new ArrayList<BytecodeInstruction>();
            var lineNumbers = new TreeMap<Integer, Integer>();
            try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    var lineMatcher = LINE_NUMBER.matcher(line);
                    if (lineMatcher.matches()) lineNumbers.put(Integer.parseInt(lineMatcher.group(2)), Integer.parseInt(lineMatcher.group(1)));
                    var matcher = INSTRUCTION.matcher(line);
                    if (matcher.matches()) {
                        result.add(new BytecodeInstruction(Integer.parseInt(matcher.group(1)), matcher.group(2),
                                matcher.group(3) == null ? "" : matcher.group(3), null));
                    }
                }
            }
            process.waitFor();
            return result.stream().map(instruction -> {
                Map.Entry<Integer, Integer> source = lineNumbers.floorEntry(instruction.offset());
                return new BytecodeInstruction(instruction.offset(), instruction.mnemonic(), instruction.detail(),
                        source == null ? null : source.getValue());
            }).toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String javaTool(String command) {
        String executable = System.getProperty("os.name").toLowerCase().contains("win") ? command + ".exe" : command;
        return Path.of(System.getProperty("java.home"), "bin", executable).toString();
    }
}
