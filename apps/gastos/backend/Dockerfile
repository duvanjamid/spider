# Backend · imagen para Render y docker-compose (ver CLAUDE.md).
FROM gradle:8.10.2-jdk21 AS builder
ARG LIGERO_REPO=https://github.com/ligero-framework/ligero
ARG LIGERO_REF=main
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${LIGERO_REF} ${LIGERO_REPO} /tmp/ligero \
    && cd /tmp/ligero \
    && (./gradlew publishToMavenLocal --no-daemon || gradle publishToMavenLocal --no-daemon)
WORKDIR /app
COPY settings.gradle build.gradle ./
COPY src ./src
RUN gradle shadowJar --no-daemon

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=builder /app/build/libs/app.jar ./app.jar
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -jar /app/app.jar"]
