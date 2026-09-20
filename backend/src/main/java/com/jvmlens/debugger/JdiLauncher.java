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
    public VirtualMachine launch(Path classesDirectory, String mainClass) throws Exception {
        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("main").setValue(mainClass);
        arguments.get("options").setValue("-cp \"" + classesDirectory + "\" -Xint -XX:+UseG1GC -Xms32m -Xmx64m -Dfile.encoding=UTF-8");
        arguments.get("suspend").setValue("true");
        return connector.launch(arguments);
    }
}

