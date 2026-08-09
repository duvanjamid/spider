# ══════════════════════════════════════════════════════════════
#  Backend admin · imagen para Render (y docker-compose local)
#
#  Ligero aún NO está en Maven Central, así que la etapa `builder`
#  lo compila desde su repo y lo publica a Maven local; luego
#  construye el fat-jar de la app contra ese repo local.
#
#  Cuando Ligero publique en Maven Central, borra el bloque de
#  bootstrap y deja solo `gradle shadowJar`.
# ══════════════════════════════════════════════════════════════

# ── Etapa 1: build ──
FROM gradle:8.10.2-jdk21 AS builder
ARG LIGERO_REPO=https://github.com/ligero-framework/ligero
ARG LIGERO_REF=main

USER root
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Bootstrap de Ligero → Maven local (~/.m2).
RUN git clone --depth 1 --branch ${LIGERO_REF} ${LIGERO_REPO} /tmp/ligero \
    && cd /tmp/ligero \
    && (./gradlew publishToMavenLocal --no-daemon || gradle publishToMavenLocal --no-daemon)

# Build de la app.
WORKDIR /app
COPY settings.gradle build.gradle ./
COPY src ./src
RUN gradle shadowJar --no-daemon

# ── Etapa 2: runtime ──
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=builder /app/build/libs/app.jar ./app.jar

ENV PORT=8080
EXPOSE 8080
# Render inyecta PORT; la app lo respeta.
ENTRYPOINT ["sh", "-c", "java -jar /app/app.jar"]
