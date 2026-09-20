package com.jvmlens.debugger;

import com.sun.jdi.Bootstrap;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.Map;

@Service
public class JdiLauncher {

    public VirtualMachine launch(
            Path classesDirectory,
            String mainClass
    ) throws Exception {

        LaunchingConnector connector =
                Bootstrap
                        .virtualMachineManager()
                        .defaultConnector();

        Map<String, Connector.Argument> arguments =
                connector.defaultArguments();

        arguments
                .get("main")
                .setValue(mainClass);

        /*
         * Do NOT use -Xint.
         *
         * JDI line stepping works without forcing the JVM into
         * interpreter-only mode.
         *
         * -Xint makes Java programs unnecessarily slow.
         */
        arguments
                .get("options")
                .setValue(
                        "-cp \"" + classesDirectory + "\" " +
                                "-XX:+UseG1GC " +
                                "-Xms32m " +
                                "-Xmx64m " +
                                "-Dfile.encoding=UTF-8"
                );

        /*
         * Start JVM suspended.
         *
         * DebugEventLoop will install the main() breakpoint
         * before execution begins.
         */
        arguments
                .get("suspend")
                .setValue("true");

        return connector.launch(arguments);
    }
}