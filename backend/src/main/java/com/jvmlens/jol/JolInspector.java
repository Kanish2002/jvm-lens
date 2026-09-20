package com.jvmlens.jol;

import org.openjdk.jol.info.ClassLayout;
import org.springframework.stereotype.Service;

@Service
public class JolInspector {
    public String classLayout(Class<?> type) {
        return ClassLayout.parseClass(type).toPrintable();
    }
}

