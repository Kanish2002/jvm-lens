package com.jvmlens.parser;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class SourceAnalyzer {
    public Analysis analyze(Map<String, String> sources) {
        var classes = sources.entrySet().stream().flatMap(entry -> {
            var unit = StaticJavaParser.parse(entry.getValue());
            return unit.findAll(ClassOrInterfaceDeclaration.class).stream().map(type ->
                    new SourceType(entry.getKey(), type.getNameAsString(), type.isInterface(),
                            type.getMethods().stream().map(m -> m.getNameAsString()).toList(),
                            type.getFields().stream().flatMap(f -> f.getVariables().stream()).map(v -> v.getNameAsString()).toList(),
                            type.getFields().stream().filter(f -> f.hasModifier(Modifier.Keyword.VOLATILE))
                                    .flatMap(f -> f.getVariables().stream()).map(v -> v.getNameAsString()).toList(),
                            type.getMethods().stream().filter(m -> m.hasModifier(Modifier.Keyword.SYNCHRONIZED))
                                    .map(m -> m.getNameAsString()).toList()));
        }).toList();
        return new Analysis(classes);
    }
    public record Analysis(List<SourceType> types) {}
    public record SourceType(String file, String name, boolean isInterface, List<String> methods,
                             List<String> fields, List<String> volatileFields, List<String> synchronizedMethods) {}
}
