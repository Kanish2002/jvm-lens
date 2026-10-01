cmake_minimum_required(VERSION 3.20)
project(jvm_lens_agent LANGUAGES CXX)
find_package(JNI REQUIRED)
add_library(jvm_lens_agent SHARED src/agent.cpp)
target_include_directories(jvm_lens_agent PRIVATE ${JNI_INCLUDE_DIRS})
target_compile_features(jvm_lens_agent PRIVATE cxx_std_20)

