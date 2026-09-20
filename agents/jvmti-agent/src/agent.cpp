#include <jni.h>
#include <jvmti.h>

// Deliberately minimal: object tagging and ObjectFree delivery are a later milestone.
JNIEXPORT jint JNICALL Agent_OnLoad(JavaVM* vm, char*, void*) {
    jvmtiEnv* jvmti = nullptr;
    if (vm->GetEnv(reinterpret_cast<void**>(&jvmti), JVMTI_VERSION_1_2) != JNI_OK) return JNI_ERR;
    return JNI_OK;
}

