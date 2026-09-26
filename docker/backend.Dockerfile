FROM gradle:9.1-jdk21 AS build
WORKDIR /workspace
COPY settings.gradle.kts build.gradle.kts ./
COPY backend ./backend
RUN gradle :backend:bootJar --no-daemon

FROM eclipse-temurin:21-jdk
RUN useradd --system --uid 10001 jvmlens && mkdir -p /tmp/jvm-lens && chown -R jvmlens /tmp/jvm-lens
USER jvmlens
COPY --from=build /workspace/backend/build/libs/backend-*.jar /app.jar
ENV JAVA_TOOL_OPTIONS="-Xms64m -Xmx384m -XX:+UseSerialGC -XX:MaxMetaspaceSize=192m -XX:MaxDirectMemorySize=64m -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
