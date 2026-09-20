package com.jvmlens.debugger;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class ConsoleCapture {
    private final StringBuilder buffer = new StringBuilder();
    private final int limit;

    public ConsoleCapture(InputStream stream, int limit) {
        this.limit = limit;
        Thread.startVirtualThread(() -> read(stream));
    }
    private void read(InputStream stream) {
        byte[] bytes = new byte[4096];
        try {
            int read;
            while ((read = stream.read(bytes)) >= 0) append(new String(bytes, 0, read, StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }
    private synchronized void append(String value) {
        int available = Math.max(0, limit - buffer.length());
        buffer.append(value, 0, Math.min(available, value.length()));
    }
    public synchronized String value() { return buffer.toString(); }
}

