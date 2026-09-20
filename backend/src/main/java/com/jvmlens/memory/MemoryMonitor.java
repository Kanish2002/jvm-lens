package com.jvmlens.memory;

import com.jvmlens.trace.EvidenceType;
import com.jvmlens.trace.TraceModel.Memory;
import com.sun.jdi.VirtualMachine;
import org.springframework.stereotype.Service;

import javax.management.MBeanServerConnection;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.ThreadMXBean;

@Service
public class MemoryMonitor {
    private volatile MBeanServerConnection connection;

    public void connect(VirtualMachine vm) {
        com.sun.tools.attach.VirtualMachine attached = null;
        try {
            // JDI controls execution, while the Attach API starts the local JMX
            // management agent in the separate debuggee process.
            attached = com.sun.tools.attach.VirtualMachine.attach(Long.toString(vm.process().pid()));
            String address = attached.startLocalManagementAgent();
            connection = JMXConnectorFactory.connect(new JMXServiceURL(address)).getMBeanServerConnection();
        } catch (Exception ignored) {
            connection = null;
        } finally {
            if (attached != null) {
                try { attached.detach(); } catch (Exception ignored) {}
            }
        }
    }

    public Memory snapshot() {
        try {
            if (connection == null) return unavailable();
            MemoryMXBean memory = ManagementFactory.newPlatformMXBeanProxy(connection,
                    ManagementFactory.MEMORY_MXBEAN_NAME, MemoryMXBean.class);
            ThreadMXBean threads = ManagementFactory.newPlatformMXBeanProxy(connection,
                    ManagementFactory.THREAD_MXBEAN_NAME, ThreadMXBean.class);
            ClassLoadingMXBean classes = ManagementFactory.newPlatformMXBeanProxy(connection,
                    ManagementFactory.CLASS_LOADING_MXBEAN_NAME, ClassLoadingMXBean.class);
            long metaspace = ManagementFactory.getPlatformMXBeans(connection, MemoryPoolMXBean.class).stream()
                    .filter(pool -> pool.getName().contains("Metaspace")).mapToLong(pool -> pool.getUsage().getUsed()).sum();
            return new Memory(memory.getHeapMemoryUsage().getUsed(), memory.getHeapMemoryUsage().getCommitted(),
                    memory.getHeapMemoryUsage().getMax(), memory.getNonHeapMemoryUsage().getUsed(), metaspace,
                    threads.getThreadCount(), classes.getLoadedClassCount(), EvidenceType.OBSERVED);
        } catch (Exception ignored) { return unavailable(); }
    }

    private Memory unavailable() {
        return new Memory(-1, -1, -1, -1, -1, -1, -1, EvidenceType.OBSERVED);
    }
}
