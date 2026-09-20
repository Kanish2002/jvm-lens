package com.jvmlens.classfile;

import com.jvmlens.trace.TraceModel.BytecodeInstruction;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.classfile.ClassFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class ClassFileAnalyzer {

    private static final Pattern INSTRUCTION =
            Pattern.compile("^\\s*(\\d+):\\s+([a-z0-9_]+)(?:\\s+(.*))?$");

    private static final Pattern LINE_NUMBER =
            Pattern.compile("^\\s*line\\s+(\\d+):\\s+(\\d+)$");

    /*
     * Bytecode does not change while a compiled execution session is running.
     * Therefore javap should only be executed once per class instead of once
     * for every debugger step.
     */
    private final Map<CacheKey, List<BytecodeInstruction>> cache =
            new ConcurrentHashMap<>();

    public List<BytecodeInstruction> analyze(
            Path classesDir,
            String className
    ) {

        CacheKey key = new CacheKey(
                classesDir.toAbsolutePath().normalize(),
                className
        );

        return cache.computeIfAbsent(
                key,
                ignored -> analyzeUncached(classesDir, className)
        );
    }

    private List<BytecodeInstruction> analyzeUncached(
            Path classesDir,
            String className
    ) {

        try {

            Path classPath =
                    classesDir.resolve(
                            className.replace('.', '/') + ".class"
                    );

            /*
             * First verify that this is a valid class file using the
             * standard JDK ClassFile API.
             */
            ClassFile.of().parse(classPath);

            Process process =
                    new ProcessBuilder(
                            javaTool("javap"),
                            "-classpath",
                            classesDir.toString(),
                            "-c",
                            "-l",
                            "-p",
                            className
                    )
                            .redirectErrorStream(true)
                            .start();

            var instructions =
                    new ArrayList<BytecodeInstruction>();

            var lineNumbers =
                    new TreeMap<Integer, Integer>();

            try (
                    var reader =
                            new BufferedReader(
                                    new InputStreamReader(
                                            process.getInputStream(),
                                            StandardCharsets.UTF_8
                                    )
                            )
            ) {

                String line;

                while ((line = reader.readLine()) != null) {

                    var lineMatcher =
                            LINE_NUMBER.matcher(line);

                    if (lineMatcher.matches()) {

                        lineNumbers.put(
                                Integer.parseInt(
                                        lineMatcher.group(2)
                                ),
                                Integer.parseInt(
                                        lineMatcher.group(1)
                                )
                        );
                    }

                    var instructionMatcher =
                            INSTRUCTION.matcher(line);

                    if (instructionMatcher.matches()) {

                        instructions.add(
                                new BytecodeInstruction(
                                        Integer.parseInt(
                                                instructionMatcher.group(1)
                                        ),
                                        instructionMatcher.group(2),
                                        instructionMatcher.group(3) == null
                                                ? ""
                                                : instructionMatcher.group(3),
                                        null
                                )
                        );
                    }
                }
            }

            int exitCode = process.waitFor();

            if (exitCode != 0) {
                return List.of();
            }

            return instructions
                    .stream()
                    .map(instruction -> {

                        Map.Entry<Integer, Integer> source =
                                lineNumbers.floorEntry(
                                        instruction.offset()
                                );

                        return new BytecodeInstruction(
                                instruction.offset(),
                                instruction.mnemonic(),
                                instruction.detail(),
                                source == null
                                        ? null
                                        : source.getValue()
                        );
                    })
                    .toList();

        } catch (Exception ignored) {

            return List.of();
        }
    }

    private String javaTool(String command) {

        String executable =
                System.getProperty("os.name")
                        .toLowerCase()
                        .contains("win")
                        ? command + ".exe"
                        : command;

        return Path.of(
                System.getProperty("java.home"),
                "bin",
                executable
        ).toString();
    }

    private record CacheKey(
            Path classesDir,
            String className
    ) {
    }
}