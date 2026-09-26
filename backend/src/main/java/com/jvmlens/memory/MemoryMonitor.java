package com.jvmlens.memory;

import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceModel.Memory;
import com.sun.jdi.VirtualMachine;
import org.springframework.stereotype.Service;

import javax.management.MBeanServerConnection;
import javax.management.remote.JMXConnector;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.ThreadMXBean;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class MemoryMonitor {
    public Probe createProbe() { return new Probe(); }

    public static final class Probe implements AutoCloseable {
        private volatile MBeanServerConnection connection;
        private volatile JMXConnector connector;
        private final AtomicBoolean closed = new AtomicBoolean();

        public void connect(VirtualMachine vm) {
            if (closed.get()) return;
            com.sun.tools.attach.VirtualMachine attached = null;
            try {
                attached = com.sun.tools.attach.VirtualMachine.attach(Long.toString(vm.process().pid()));
                String address = attached.startLocalManagementAgent();
                JMXConnector opened = JMXConnectorFactory.connect(new JMXServiceURL(address));
                if (closed.get()) {
                    opened.close();
                    return;
                }
                connector = opened;
                connection = opened.getMBeanServerConnection();
            } catch (Exception ignored) {
                close();
            } finally {
                if (attached != null) {
                    try { attached.detach(); } catch (Exception ignored) { }
                }
            }
        }

        public Memory snapshot() {
            MBeanServerConnection active = connection;
            if (active == null) return unavailable();
            try {
                MemoryMXBean memory = ManagementFactory.newPlatformMXBeanProxy(active,
                        ManagementFactory.MEMORY_MXBEAN_NAME, MemoryMXBean.class);
                ThreadMXBean threads = ManagementFactory.newPlatformMXBeanProxy(active,
                        ManagementFactory.THREAD_MXBEAN_NAME, ThreadMXBean.class);
                ClassLoadingMXBean classes = ManagementFactory.newPlatformMXBeanProxy(active,
                        ManagementFactory.CLASS_LOADING_MXBEAN_NAME, ClassLoadingMXBean.class);
                long metaspace = ManagementFactory.getPlatformMXBeans(active, MemoryPoolMXBean.class).stream()
                        .filter(pool -> pool.getName().contains("Metaspace"))
                        .mapToLong(pool -> pool.getUsage().getUsed()).sum();
                return new Memory(memory.getHeapMemoryUsage().getUsed(), memory.getHeapMemoryUsage().getCommitted(),
                        memory.getHeapMemoryUsage().getMax(), memory.getNonHeapMemoryUsage().getUsed(), metaspace,
                        threads.getThreadCount(), classes.getLoadedClassCount(), EvidenceType.OBSERVED);
            } catch (Exception ignored) {
                return unavailable();
            }
        }

        @Override
        public void close() {
            closed.set(true);
            connection = null;
            JMXConnector active = connector;
            connector = null;
            if (active != null) {
                try { active.close(); } catch (Exception ignored) { }
            }
        }

        private Memory unavailable() {
            return new Memory(-1, -1, -1, -1, -1, -1, -1, EvidenceType.OBSERVED);
        }
    }
}
