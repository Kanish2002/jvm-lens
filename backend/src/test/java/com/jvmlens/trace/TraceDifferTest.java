package com.jvmlens.trace;

import com.jvmlens.trace.TraceModel.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TraceDifferTest {
    private final TraceDiffer differ = new TraceDiffer();

    @Test
    void identifiesPrimitiveLocalChangeWithoutAllocation() {
        TraceStep before = step("1");
        TraceStep after = step("2");
        TraceDiff diff = differ.compare(before, after);
        assertThat(diff.localsChanged()).containsExactly("0:version");
        assertThat(diff.objectsCreated()).isEmpty();
        assertThat(diff.explanation()).contains("Primitive reassignment");
    }

    private TraceStep step(String value) {
        var variable = new Variable("version", new Value("primitive", "int", value, null, EvidenceType.OBSERVED));
        var frame = new StackFrame("Main", "main", 1, List.of(variable), null);
        return new TraceStep(1, "LINE_STEP", new Location("Main", "main", "Main.java", 1, 0),
                new ThreadState(1, "main", "RUNNABLE"), List.of(frame), List.of(), List.of(), List.of(),
                new Memory(-1, -1, -1, -1, -1, -1, -1, EvidenceType.OBSERVED), List.of(), "", "", TraceDiff.empty());
    }
}

