#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  Spider · generador de apps (scaffolding)
//
//  Crea una app nueva con la estructura estándar:
//     apps/<name>/backend   (Java + Ligero + Flyway)
//     apps/<name>/frontend  (Angular)
//  y la registra en:
//     - docker-compose.yml        (entorno local)
//     - infra/gateway/nginx.conf  (rutas /<name> y /api/<name>)
//     - render.yaml               (4 servicios back/front × prod/test y su
//                                  membresía en los entornos production y test)
//
//  Reglas:
//     - No se permiten nombres repetidos.
//     - name válido: ^[a-z][a-z0-9]{1,29}$  (sirve para slug, package y schema).
//
//  Uso:  node tools/scaffold/scaffold-app.mjs <name>
// ══════════════════════════════════════════════════════════════
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── 1) Validación del nombre ──────────────────────────────────
const name = (process.argv[2] || '').trim();
if (!name) fail('Falta el nombre.  Uso: node tools/scaffold/scaffold-app.mjs <name>');
if (!/^[a-z][a-z0-9]{1,29}$/.test(name)) {
  fail(`Nombre inválido: "${name}". Debe cumplir ^[a-z][a-z0-9]{1,29}$ (minúsculas, sin guiones ni espacios).`);
}

// ── 2) Unicidad ───────────────────────────────────────────────
const appDir = join(ROOT, 'apps', name);
if (existsSync(appDir)) fail(`Ya existe una app llamada "${name}" (${appDir}). Los nombres no se pueden repetir.`);
for (const [file, token] of [
  ['docker-compose.yml', `${name}-backend:`],
  ['render.yaml', `name: ${name}-backend`],
]) {
  const p = join(ROOT, file);
  if (existsSync(p) && readFileSync(p, 'utf8').includes(token)) {
    fail(`El servicio "${name}" ya aparece en ${file}. Aborto para no duplicar.`);
  }
}

const PKG = `com.spider.${name}`;
const PKG_PATH = `com/spider/${name}`;
const T = (s) => s.replaceAll('__APP__', name).replaceAll('__PKG__', PKG).replaceAll('__THEME__', colorForApp(name));

function main() {
console.log(`▸ Generando app "${name}" …`);

// ── 3) Backend ────────────────────────────────────────────────
const be = (p) => join(appDir, 'backend', p);
w(be('settings.gradle'), T(TPL.settings));
w(be('build.gradle'), T(TPL.buildGradle));
w(be('Dockerfile'), TPL.backendDockerfile);
w(be('.dockerignore'), TPL.backendDockerignore);
w(be('src/main/resources/ligero.yml'), TPL.ligeroYml);
w(be('src/main/resources/simplelogger.properties'), TPL.simpleLogger);
w(be(`src/main/java/${PKG_PATH}/App.java`), T(TPL.appJava));
w(be(`src/main/java/${PKG_PATH}/config/Env.java`), T(TPL.envJava));
w(be(`src/main/java/${PKG_PATH}/db/DbConfig.java`), T(TPL.dbConfigJava));
w(be(`src/main/java/${PKG_PATH}/db/Migrations.java`), T(TPL.migrationsJava));
w(be(`src/main/java/${PKG_PATH}/health/HealthController.java`), T(TPL.healthJava));
w(be(`src/main/java/${PKG_PATH}/registry/Registry.java`), T(TPL.registryJava));
w(be(`src/main/resources/db/migration/V1__init_${name}.sql`), T(TPL.migrationSql));

// ── 4) Frontend ───────────────────────────────────────────────
const fe = (p) => join(appDir, 'frontend', p);
w(fe('package.json'), T(TPL.pkgJson));
w(fe('angular.json'), T(TPL.angularJson));
w(fe('tsconfig.json'), TPL.tsconfig);
w(fe('tsconfig.app.json'), TPL.tsconfigApp);
w(fe('nginx.conf'), TPL.frontNginx);
w(fe('Dockerfile'), TPL.frontDockerfile);
w(fe('.dockerignore'), TPL.frontDockerignore);
w(fe('src/index.html'), T(TPL.indexHtml));
w(fe('src/main.ts'), TPL.mainTs);
w(fe('src/styles.scss'), TPL.stylesScss);
w(fe('src/environments/environment.ts'), T(TPL.envTs));
w(fe('src/environments/environment.prod.ts'), T(TPL.envProdTs));
w(fe('src/app/app.config.ts'), TPL.appConfigTs);
w(fe('src/app/app.component.ts'), T(TPL.appComponentTs));
// PWA propia de la app (instalable por separado con su icono).
w(fe('src/manifest.webmanifest'), T(TPL.manifest));
w(fe('src/sw.js'), TPL.sw);
writeBuffer(fe('src/icon-192.png'), pngIcon(192, colorForApp(name)));
writeBuffer(fe('src/icon-512.png'), pngIcon(512, colorForApp(name)));

// ── 5) Registro en configs compartidas ────────────────────────
injectCompose(name);
injectGateway(name);
injectRenderServices(name);

console.log(`✓ App "${name}" creada y registrada.
  - apps/${name}/backend  · apps/${name}/frontend
  - docker-compose.yml · infra/gateway/nginx.conf · render.yaml (prod + test)

Siguientes pasos:
  export BD_PASS=...  &&  docker compose up --build
  → http://localhost:8080/${name}      (frontend)
  → http://localhost:8080/api/${name}/health
`);
}

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════
function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function w(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
function writeBuffer(path, buf) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, buf); }

// ── Icono PWA generado (anillo de color por app), PNG puro con zlib ──
function colorForApp(n) {
  const palette = ['#6c8cff', '#10b981', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#3b82f6'];
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
function pngIcon(size, hex) {
  const fg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const bg = [15, 17, 21];
  const cx = size / 2, cy = size / 2, rOut = size * 0.30, rIn = size * 0.15;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const c = d <= rIn ? bg : d <= rOut ? fg : bg;
      const o = 1 + x * 3; row[o] = c[0]; row[o + 1] = c[1]; row[o + 2] = c[2];
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows), { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c;
}
function injectBeforeMarker(file, marker, snippet) {
  const p = join(ROOT, file);
  const src = readFileSync(p, 'utf8');
  const idx = src.indexOf(marker);
  if (idx === -1) fail(`No se encontró el marcador "${marker}" en ${file}.`);
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  writeFileSync(p, src.slice(0, lineStart) + snippet + '\n' + src.slice(lineStart));
}
function injectCompose(n) {
  injectBeforeMarker('docker-compose.yml', '# SCAFFOLD:SERVICES', T_(n, COMPOSE_SNIPPET));
}
function injectGateway(n) {
  injectBeforeMarker('infra/gateway/nginx.conf', '# SCAFFOLD:LOCATIONS', T_(n, GATEWAY_SNIPPET));
  // El keep-alive despierta también la app nueva (front + health del back).
  injectBeforeMarker('infra/gateway/nginx.conf', '# SCAFFOLD:KEEPALIVE_END', T_(n, KEEPALIVE_SNIPPET));
}
function injectRenderServices(n) {
  injectBeforeMarker('render.yaml', '# SCAFFOLD:SERVICES', renderServices(n));
}
function T_(n, s) { return s.replaceAll('__APP__', n); }

// ── Snippets de configs compartidas ───────────────────────────
const COMPOSE_SNIPPET = `
  # ═════════════════════ APP: __APP__ ═════════════════════════
  __APP__-backend:
    build:
      context: ./apps/__APP__/backend
    container_name: spider-__APP__-backend
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: \${POSTGRES_DB:-spider}
      DB_USER: \${POSTGRES_USER:-spider_user}
      DB_PASSWORD: \${BD_PASS:?define BD_PASS}
      DB_SCHEMA: __APP__
      APP_NAME: __APP__
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  __APP__-frontend:
    build:
      context: ./apps/__APP__/frontend
    container_name: spider-__APP__-frontend
    depends_on:
      - __APP__-backend
    restart: unless-stopped
`;

// Enrutado LOCAL por convención /<app> y /<app>-api (hostnames de docker-compose).
// En Render el gateway usa URLs públicas por variable de entorno: al añadir una
// app se cablea su ruta en infra/gateway (ver admin/gastos como referencia).
const GATEWAY_SNIPPET = `
    # ═════════════════════ APP: __APP__ ═══════════════════════
    location /__APP__-api/ {
      proxy_pass         http://__APP__-backend:8080/;
      proxy_set_header   Host \$host;
      proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto \$scheme;
    }
    location /__APP__/ {
      proxy_pass         http://__APP__-frontend:80/;
      proxy_set_header   Host \$host;
      proxy_set_header   X-Forwarded-Proto \$scheme;
      proxy_intercept_errors on;                       # página de carga si el front está dormido
      error_page 502 503 504 /__spider_loading.html;
    }
`;

// Mirrors del keep-alive: despiertan el frontend y el health del backend.
const KEEPALIVE_SNIPPET = `      mirror /__APP__/;
      mirror /__APP__-api/health;`;

// Bloques de servicios para render.yaml (prod + test en un solo archivo).
function renderBackend(n, suffix, branch, schema) {
  return `
  - type: web
    name: ${n}-backend${suffix}
    runtime: docker
    branch: ${branch}
    dockerfilePath: apps/${n}/backend/Dockerfile
    dockerContext: apps/${n}/backend
    plan: free
    region: oregon
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: APP_NAME
        value: ${n}
      - key: DB_SCHEMA
        value: ${schema}
      - key: DATABASE_URL
        sync: false
`;
}
function renderFrontend(n, suffix, branch) {
  return `
  - type: web
    name: ${n}-frontend${suffix}
    runtime: docker
    branch: ${branch}
    dockerfilePath: apps/${n}/frontend/Dockerfile
    dockerContext: apps/${n}/frontend
    plan: free
    region: oregon
    autoDeploy: true
`;
}
function renderServices(n) {
  return `  # ═════════════════════ APP: ${n} ═════════════════════════`
    + renderBackend(n, '', 'main', n)
    + renderFrontend(n, '', 'main')
    + renderBackend(n, '-test', 'develop', 'test_' + n)
    + renderFrontend(n, '-test', 'develop');
}

// ══════════════════════════════════════════════════════════════
//  Plantillas de la app generada
// ══════════════════════════════════════════════════════════════
const TPL = {
settings: `rootProject.name = 'spider-__APP__-backend'\n`,

buildGradle: `plugins {
    id 'application'
    id 'com.gradleup.shadow' version '8.3.5'
}

group = '__PKG__'
version = '0.1.0'

java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}

repositories {
    mavenLocal()   // Ligero se publica aquí (ver Dockerfile / bootstrap)
    mavenCentral()
}

ext {
    ligeroVersion = '0.5.0'
    flywayVersion = '10.17.0'
}

dependencies {
    implementation "com.ligeroframework:ligero-core:\${ligeroVersion}"
    implementation "com.ligeroframework:ligero-server-jdk:\${ligeroVersion}"
    implementation "com.ligeroframework:ligero-json:\${ligeroVersion}"
    implementation "org.flywaydb:flyway-core:\${flywayVersion}"
    implementation "org.flywaydb:flyway-database-postgresql:\${flywayVersion}"
    implementation 'org.postgresql:postgresql:42.7.4'
    implementation 'org.slf4j:slf4j-simple:2.0.16'
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.17.2'
    implementation 'com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.17.2'
}

application { mainClass = '__PKG__.App' }

shadowJar {
    archiveBaseName = 'app'
    archiveClassifier = ''
    archiveVersion = ''
    // Fusiona META-INF/services (ServiceLoader): imprescindible para que
    // Flyway cargue sus plugins (prefijos V/U/R, tipos de BD) en el fat-jar.
    mergeServiceFiles()
}
tasks.named('jar') { enabled = false }
`,

backendDockerfile: `# Backend · imagen para Render y docker-compose (ver CLAUDE.md).
FROM gradle:8.10.2-jdk21 AS builder
ARG LIGERO_REPO=https://github.com/ligero-framework/ligero
ARG LIGERO_REF=main
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git \\
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch \${LIGERO_REF} \${LIGERO_REPO} /tmp/ligero \\
    && cd /tmp/ligero \\
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
# Banderas de arranque rápido (menos JIT/GC init): reducen el cold-start.
ENTRYPOINT ["sh", "-c", "java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -jar /app/app.jar"]
`,

backendDockerignore: `.gradle/\nbuild/\n*.log\n.idea/\n`,

ligeroYml: `server:\n  host: 0.0.0.0\n  port: \${PORT:-8080}\nlogging:\n  level: INFO\n`,

simpleLogger: `org.slf4j.simpleLogger.logFile=System.out
org.slf4j.simpleLogger.showDateTime=true
org.slf4j.simpleLogger.dateTimeFormat=yyyy-MM-dd HH:mm:ss.SSS
org.slf4j.simpleLogger.levelInBrackets=true
org.slf4j.simpleLogger.defaultLogLevel=info
`,

appJava: `package __PKG__;

import com.ligero.Ligero;
import __PKG__.config.Env;
import __PKG__.db.DbConfig;
import __PKG__.db.Migrations;
import __PKG__.health.HealthController;
import __PKG__.registry.Registry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Punto de entrada del backend "__APP__" (Ligero + Java 21). */
public final class App {
    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        DbConfig db = DbConfig.fromEnv();
        Migrations.run(db);                 // nada de DDL a mano
        Registry.selfRegister();            // se da a conocer al admin

        Ligero app = Ligero.create(Env.port());
        HealthController.register(app);
        log.info("Backend '{}' escuchando en :{} (schema '{}')",
                Env.appName(), Env.port(), db.schema());
        app.start();
    }

    private App() {}
}
`,

envJava: `package __PKG__.config;

/** Configuración por variables de entorno (12-factor). */
public final class Env {
    private Env() {}
    public static String get(String k, String d) {
        String v = System.getenv(k); return (v == null || v.isBlank()) ? d : v;
    }
    public static String require(String k) {
        String v = System.getenv(k);
        if (v == null || v.isBlank()) throw new IllegalStateException("Falta env: " + k);
        return v;
    }
    public static int getInt(String k, int d) {
        String v = System.getenv(k); return (v == null || v.isBlank()) ? d : Integer.parseInt(v.trim());
    }
    public static int port() { return getInt("PORT", 8080); }
    public static String appName() { return get("APP_NAME", "__APP__"); }
    public static String dbSchema() { return get("DB_SCHEMA", appName()); }
    public static String environment() {
        return get("SPIDER_ENV", dbSchema().startsWith("test_") ? "test" : "production");
    }
}
`,

dbConfigJava: `package __PKG__.db;

import __PKG__.config.Env;

/** Resuelve la conexión JDBC desde DATABASE_URL o variables sueltas. */
public record DbConfig(String jdbcUrl, String user, String password, String schema) {

    public static DbConfig fromEnv() {
        String schema = Env.dbSchema();
        String databaseUrl = System.getenv("DATABASE_URL");
        if (databaseUrl != null && !databaseUrl.isBlank()) {
            return fromDatabaseUrl(databaseUrl.trim(), schema);
        }
        String host = Env.get("DB_HOST", "localhost");
        int port = Env.getInt("DB_PORT", 5432);
        String name = Env.get("DB_NAME", "spider");
        String url = "jdbc:postgresql://%s:%d/%s".formatted(host, port, name);
        return new DbConfig(url, Env.require("DB_USER"), Env.require("DB_PASSWORD"), schema);
    }

    static DbConfig fromDatabaseUrl(String raw, String schema) {
        if (raw.startsWith("jdbc:")) {
            return new DbConfig(raw, Env.get("DB_USER", ""), Env.get("DB_PASSWORD", ""), schema);
        }
        java.net.URI uri = java.net.URI.create(raw.replaceFirst("^postgresql://", "postgres://"));
        String[] creds = (uri.getUserInfo() == null ? "" : uri.getUserInfo()).split(":", 2);
        String user = creds.length > 0 ? dec(creds[0]) : "";
        String pass = creds.length > 1 ? dec(creds[1]) : "";
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String dbn = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");
        String query = uri.getQuery() == null ? "sslmode=require" : uri.getQuery();
        String jdbc = "jdbc:postgresql://%s:%d/%s?%s".formatted(uri.getHost(), port, dbn, query);
        return new DbConfig(jdbc, user, pass, schema);
    }

    private static String dec(String s) {
        return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
`,

migrationsJava: `package __PKG__.db;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Ejecuta migraciones Flyway sobre el schema de la app (un schema por app). */
public final class Migrations {
    private static final Logger log = LoggerFactory.getLogger(Migrations.class);
    private Migrations() {}
    public static void run(DbConfig db) {
        Flyway flyway = Flyway.configure()
                .dataSource(db.jdbcUrl(), db.user(), db.password())
                .schemas(db.schema())
                .defaultSchema(db.schema())
                .createSchemas(true)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .load();
        var r = flyway.migrate();
        log.info("Migraciones aplicadas: {} (schema '{}')", r.migrationsExecuted, db.schema());
    }
}
`,

healthJava: `package __PKG__.health;

import com.ligero.Ligero;
import __PKG__.config.Env;
import java.util.Map;

/** Health check (usado por Render). */
public final class HealthController {
    private HealthController() {}
    public static void register(Ligero app) {
        app.get("/health", ctx -> ctx.json(Map.of(
                "status", "UP", "app", Env.appName(), "schema", Env.dbSchema(),
                "env", Env.environment())));
    }
}
`,

registryJava: `package __PKG__.registry;

import __PKG__.config.Env;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Auto-registro de la app en el admin al arrancar (idempotente, no fatal).
 * Mantiene el aislamiento: la app NO toca la BD del admin, solo su API.
 * Requiere ADMIN_REGISTRY_URL y REGISTRY_TOKEN; si faltan, se omite.
 */
public final class Registry {
    private static final Logger log = LoggerFactory.getLogger(Registry.class);
    private Registry() {}

    public static void selfRegister() {
        String adminUrl = Env.get("ADMIN_REGISTRY_URL", "");
        String token = Env.get("REGISTRY_TOKEN", "");
        if (adminUrl.isBlank() || token.isBlank()) {
            log.info("Auto-registro omitido (falta ADMIN_REGISTRY_URL o REGISTRY_TOKEN)");
            return;
        }
        String slug = Env.appName();
        String name = Env.get("APP_TITLE", slug);
        String desc = Env.get("APP_DESCRIPTION", "");
        String icon = Env.get("APP_ICON", "fa-solid fa-cube");
        String color = Env.get("APP_COLOR", "#6c8cff");
        String url = adminUrl.replaceAll("/+$", "") + "/registry"
                + "?slug=" + enc(slug) + "&name=" + enc(name) + "&description=" + enc(desc)
                + "&icon=" + enc(icon) + "&color=" + enc(color);
        try {
            HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("X-Registry-Token", token)
                    .timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 == 2) log.info("App '{}' registrada en el admin", slug);
            else log.warn("Auto-registro respondió {}: {}", res.statusCode(), res.body());
        } catch (Exception e) {
            log.warn("Auto-registro falló (se continúa): {}", e.getMessage());
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
`,

migrationSql: `-- __APP__ · V1 · esquema inicial (sin prefijo de schema: lo fija Flyway).
CREATE TABLE example (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,

pkgJson: `{
  "name": "spider-__APP__-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": { "start": "ng serve", "build": "ng build" },
  "dependencies": {
    "@angular/animations": "^18.2.0",
    "@angular/common": "^18.2.0",
    "@angular/compiler": "^18.2.0",
    "@angular/core": "^18.2.0",
    "@angular/forms": "^18.2.0",
    "@angular/platform-browser": "^18.2.0",
    "@angular/router": "^18.2.0",
    "@fortawesome/fontawesome-free": "^6.7.2",
    "@primeng/themes": "^18.0.0",
    "primeng": "^18.0.0",
    "primeicons": "^7.0.0",
    "rxjs": "~7.8.0",
    "tslib": "^2.3.0",
    "zone.js": "~0.14.10"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^18.2.0",
    "@angular/cli": "^18.2.0",
    "@angular/compiler-cli": "^18.2.0",
    "typescript": "~5.5.2"
  }
}
`,

angularJson: `{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "spider-__APP__-frontend": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "assets": [
              "src/manifest.webmanifest",
              "src/sw.js",
              "src/icon-192.png",
              "src/icon-512.png"
            ],
            "styles": [
              "node_modules/primeicons/primeicons.css",
              "node_modules/@fortawesome/fontawesome-free/css/all.min.css",
              "src/styles.scss"
            ],
            "baseHref": "./"
          },
          "configurations": {
            "production": {
              "outputHashing": "all",
              "fileReplacements": [
                { "replace": "src/environments/environment.ts", "with": "src/environments/environment.prod.ts" }
              ]
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "configurations": {
            "development": { "buildTarget": "spider-__APP__-frontend:build:production" }
          },
          "defaultConfiguration": "development"
        }
      }
    }
  }
}
`,

tsconfig: `{
  "compileOnSave": false,
  "compilerOptions": {
    "outDir": "./dist/out-tsc",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": { "strictTemplates": true }
}
`,

tsconfigApp: `{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "./dist/out-tsc/app", "types": [] },
  "files": ["src/main.ts"]
}
`,

frontNginx: `server {
  listen __PORT__;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  # PWA: tipo correcto para el manifest (nginx no mapea .webmanifest por defecto).
  location = /manifest.webmanifest { default_type application/manifest+json; }
  location / { try_files $uri $uri/ /index.html; }
  location ~* \\.(js|css|woff2?|png|jpg|svg|ico)$ {
    expires 7d; add_header Cache-Control "public, immutable";
  }
}
`,

frontDockerfile: `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/browser /usr/share/nginx/html
ENV PORT=80
EXPOSE 80
CMD ["/bin/sh", "-c", "sed -i \\"s/__PORT__/\${PORT}/\\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
`,

frontDockerignore: `node_modules/\ndist/\n.angular/\n*.log\n`,

indexHtml: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Spider · __APP__</title>
  <base href="./">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- PWA propia de esta app (scope = /__APP__/): se instala por separado con su icono. -->
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="__THEME__">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="__APP__">
  <link rel="apple-touch-icon" href="icon-192.png">
</head>
<body>
  <app-root></app-root>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  </script>
</body>
</html>
`,

manifest: `{
  "name": "Spider · __APP__",
  "short_name": "__APP__",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#0f1115",
  "theme_color": "__THEME__",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
`,

sw: `self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
});
`,

mainTs: `import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
`,

stylesScss: `html, body { margin: 0; min-height: 100%; background: #0f1115; color: #e6e8ee;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
`,

envTs: `export const environment = { production: false, apiBase: '/__APP__-api' };\n`,
envProdTs: `export const environment = { production: true, apiBase: '/__APP__-api' };\n`,

appConfigTs: `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch()),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
  ],
};
`,

appComponentTs: `import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CardModule } from 'primeng/card';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CardModule],
  template: \`
    <div style="max-width:720px;margin:0 auto;padding:48px 20px">
      <p-card header="🕷️ __APP__" subheader="App generada por el scaffolding de Spider">
        <p>Backend health: <code>{{ health() }}</code></p>
      </p-card>
    </div>\`,
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);
  readonly health = signal('…');
  ngOnInit(): void {
    this.http.get<{ status: string }>(\`\${environment.apiBase}/health\`).subscribe({
      next: (r) => this.health.set(r.status),
      error: () => this.health.set('sin conexión'),
    });
  }
}
`,
};

main();
