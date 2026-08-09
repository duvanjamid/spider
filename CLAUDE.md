# 🕷️ Spider — Plataforma multi-app

Spider es una **plataforma web responsive** que hospeda muchas aplicaciones
bajo un mismo dominio. Spider es el "maestro": desde él se accede a cada app
(`spider.dominio/<app>`), se controla el acceso con **login de Google** y se
gestiona todo el ecosistema.

Este archivo es la **fuente de verdad** de la arquitectura y las convenciones.
Cualquier código o decisión debe respetarlo. **Las buenas prácticas de
arquitectura y diseño priman siempre.**

---

## 1. Principios (no negociables)

1. **Arquitectura y patrones primero.** Código limpio, capas separadas,
   nombres claros, SOLID, 12-factor. Antes de "que funcione", que esté bien.
2. **Una app = una unidad aislada.** Cada app tiene su backend, su frontend y
   su **schema** de base de datos. **Nada se comparte entre apps** salvo la
   plataforma (auth/registro) que expone el `admin`.
3. **Nada de cambios de BD a mano.** Todo el esquema y los datos semilla se
   crean con **migraciones SQL versionadas (Flyway)**. Cero DDL manual.
4. **Config por entorno (12-factor).** Los secretos y parámetros viven en
   variables de entorno, nunca en el repo. `.env` está git-ignored.
5. **Nombres de app únicos.** No puede haber dos apps con el mismo nombre.
6. **Todo dockerizado.** Local (docker-compose) y despliegue (Render) usan la
   misma imagen por servicio.

---

## 2. Stack tecnológico

| Capa        | Tecnología                                                    |
|-------------|---------------------------------------------------------------|
| Backend     | **Java 21** + **Ligero Framework** (`ligeroframework.com`)     |
| Migraciones | **Flyway** (una carpeta de migraciones por app)               |
| Frontend    | **Angular 18** (standalone) + **PrimeNG** (UI, tema Aura)       |
| Base datos  | **PostgreSQL** (una sola instancia; **un schema por app**)    |
| Gateway     | **nginx** (enruta `/<app>` y `/api/<app>`)                    |
| Local       | **docker-compose** (todas las apps + BD en un solo entorno)   |
| Deploy      | **Render.com** (Blueprints Docker, entornos test y production)|
| Build back  | **Gradle** (fat-jar con shadow)                               |

> ⚠️ **Ligero no está aún en Maven Central.** Se compila desde su repo y se
> publica a Maven local. El `Dockerfile` del backend lo hace automáticamente
> (etapa `builder`). Para compilar sin Docker: `./scripts/install-ligero.sh`.
> Cuando Ligero publique en Central, simplifica los `Dockerfile` quitando el
> bloque de bootstrap. Coordenadas: `com.ligeroframework:ligero-core:0.5.0`.

---

## 3. Estructura del monorepo

```
spider/
├── CLAUDE.md                 ← este archivo (fuente de verdad)
├── docker-compose.yml        ← entorno local COMPLETO (BD + gateway + apps)
├── .env.example              ← plantilla de variables locales
├── render.yaml               ← Blueprint Render ÚNICO (prod + test vía projects)
├── infra/
│   ├── db/init/00-init.sql    ← init de Postgres (solo local)
│   └── gateway/               ← nginx (reverse proxy local, rutas por app)
├── apps/
│   └── <app>/
│       ├── backend/           ← Java + Ligero + Flyway (Gradle, Dockerfile)
│       │   └── src/main/resources/db/migration/  ← migraciones de la app
│       └── frontend/          ← Angular (Dockerfile → nginx)
├── tools/scaffold/           ← generador de apps (scaffold-app.mjs)
├── scripts/                  ← utilidades (install-ligero.sh)
└── .claude/skills/scaffold-app/  ← skill para generar apps
```

**Regla de rutas por app:**
- Frontend: `/<app>/`      → contenedor `frontend` de la app
- Backend:  `/api/<app>/`  → contenedor `backend` de la app

La app por defecto es **`admin`** (la maestra).

---

## 4. Backend (Java + Ligero)

- Punto de entrada: `App.java`. Al arrancar:
  1. resuelve la BD (`DbConfig.fromEnv()`),
  2. corre migraciones Flyway sobre **su schema**,
  3. registra controllers y levanta Ligero en `PORT`.
- Paquete base por app: `com.spider.<app>`.
- Capas: `config` (env), `db` (conexión + migraciones), `<dominio>` (controllers/servicios).
- Los servicios **no conocen Ligero** (p.ej. `AuthService`): separación de capas.
- Build: `gradle shadowJar` → `build/libs/app.jar`. Runtime: `eclipse-temurin:21-jre`.

### API de Ligero
Se usa la API Express-inspired de Ligero 0.5.0 (`Ligero.create(port)`,
`app.get/post(path, ctx -> …)`, `ctx.json/redirect/status/pathParam/queryParam`).
Si tu versión de Ligero difiere en nombres, ajusta en los controllers (punto único).

---

## 5. Base de datos y migraciones

- **Una sola instancia Postgres** para **todos los entornos y apps**.
- **Aislamiento por schema**, nunca por base:
  - production → schema `<app>`  (p.ej. `admin`)
  - test       → schema `test_<app>`  (p.ej. `test_admin`)
- El schema lo fija la variable `DB_SCHEMA` de cada servicio.
- **Flyway** gestiona todo: crea el schema (`createSchemas=true`), su tabla de
  historial y todas las tablas. Las migraciones NO llevan prefijo de schema en
  el SQL (Flyway fija el `defaultSchema`), así la **misma** migración sirve para
  `admin` y `test_admin`.
- Migraciones por app en `apps/<app>/backend/src/main/resources/db/migration`
  con nombres `V<n>__<desc>.sql`. **Nunca** se edita una migración ya aplicada:
  se añade una nueva.

### Instancia en Render (`spider-db`)
- name: `spider` · user: `spider_user` · host: `dpg-d9rv602jnfac738gmja0-a` · port `5432`
- La contraseña vive en la variable de entorno `BD_PASS` (local) y como secreto
  en Render. **No se commitea.**
- Cada backend recibe `DATABASE_URL` como secreto (`sync: false`) y se conecta
  con `sslmode=require`.
- **Una sola base, una sola conexión, para prod y test.** La BD existe solo en
  producción; **test usa la MISMA `DATABASE_URL`** (mismo `spider-db`) y se
  aísla por el prefijo de schema (`test_<app>`). Así no hace falta una segunda
  base para el entorno de test.
  - Si `spider` y `spider-test` están en la misma región/cuenta de Render, usa
    la **URL interna** en ambos. Si el servicio de test no alcanza la interna,
    usa la **URL externa** (`...oregon-postgres.render.com/...`).

---

## 6. Autenticación (login con Google)

- La identidad la da **Google OAuth 2.0 / OIDC**; el **permiso por app** lo da
  el `admin` (tablas `app_user`, `application`, `user_app_access`).
- Flujo en `apps/admin/backend` (`auth/AuthController` + `auth/AuthService`):
  `login → Google → callback → canje de tokens → upsert de usuario → sesión JWT`.
- Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_JWT_SECRET`,
  `PUBLIC_BASE_URL`.
- El canje de tokens/validación de `id_token` está marcado con `TODO(auth)` para
  completarse con las credenciales reales (ver `AuthService.completeLogin`).

---

## 7. Desarrollo local (docker-compose)

Todas las apps y la BD suben en **un solo entorno**:

```bash
cp .env.example .env          # ajusta valores
export BD_PASS=una_clave_local
docker compose up --build
```

- `http://localhost:8080/`            → redirige a `/admin/`
- `http://localhost:8080/admin/`      → frontend admin
- `http://localhost:8080/api/admin/health`

El **gateway** (nginx) reproduce en local el enrutamiento por path de producción.

Para compilar un backend sin Docker, primero: `./scripts/install-ligero.sh`.

---

## 8. Despliegue en Render

- **Un solo `render.yaml`** (Blueprint Docker, `services` a nivel raíz), con un
  servicio por backend y por frontend. Los **dos entornos** se expresan por
  servicio con su rama + schema:
  - **production** → servicios sin sufijo, rama **main**, schema `<app>`.
  - **test**       → servicios con sufijo `-test`, rama **develop**, schema
    `test_<app>`.
  Es la **fuente de verdad única**: test valida el mismo código/imagen que se
  promociona a main; entre entornos solo cambia rama, nombre y schema.
- Ambos entornos comparten la **misma** `spider-db` y la **misma `DATABASE_URL`**.
  La BD vive solo en prod; test reutiliza esa conexión, aislado por schema.
- ⚠️ `dockerfilePath` y `dockerContext` son **relativos a la raíz del repo**
  (p.ej. `apps/admin/backend/Dockerfile` + `dockerContext: apps/admin/backend`).
- Secretos por servicio (dashboard): `DATABASE_URL`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL`. `AUTH_JWT_SECRET` se autogenera.
- Health check del backend: `/health`. El frontend (nginx) escucha en `$PORT`.

> **Unificación de rutas en producción:** en local el gateway da `/<app>`. En
> Render cada servicio tiene su URL. Para reproducir `spider.dominio/<app>` en
> prod, el siguiente paso es añadir un **servicio gateway** (mismo nginx) como
> punto de entrada, o usar reglas de routing/subdominios. Documentado como
> mejora; el scaffold inicial despliega cada app como servicio independiente.

---

## 9. Gitflow

- `main`     → despliega al entorno **production** (`render.yaml`).
- `develop`  → despliega al entorno **test** (mismo `render.yaml`).
- `feature/*` → se integran en `develop`. `release/*` y `hotfix/*` según gitflow.
- Regla de oro: no se rompe `main`. Todo pasa antes por `develop`/test.

---

## 10. Crear una app nueva (scaffolding)

Usa la **skill `scaffold-app`** o directamente el generador:

```bash
node tools/scaffold/scaffold-app.mjs <name>   # name: ^[a-z][a-z0-9]{1,29}$
```

Genera `apps/<name>/backend` + `frontend`, su migración `V1`, y **registra** la
app en `docker-compose.yml`, `infra/gateway/nginx.conf` y `render.yaml` (crea
los 4 servicios —back/front × prod/test— y los añade a los dos entornos).
**Rechaza nombres repetidos.** No borres los marcadores `# SCAFFOLD:*` de esos
archivos: el generador inyecta ahí.

---

## 11. Convenciones de código

- **Java**: paquetes `com.spider.<app>.<capa>`; controllers finos, lógica en
  servicios; sin estado global mutable; `record` para modelos inmutables.
- **Angular**: standalone components, `signal()` para estado local, servicios
  con `inject()`, un servicio por recurso de API (`environment.apiBase`).
- **PrimeNG (obligatorio)**: toda la UI usa **PrimeNG** con el tema **Aura**
  (`@primeng/themes`). Se configura en `app.config.ts` con
  `provideAnimationsAsync()` + `providePrimeNG({ theme: { preset: Aura } })`.
  Iconos con **PrimeIcons**. No se introducen otras librerías de componentes
  ni CSS a mano donde PrimeNG ya resuelve (botones, tablas, formularios, etc.).
- **SQL**: snake_case; claves `id BIGINT GENERATED ALWAYS AS IDENTITY`;
  timestamps `TIMESTAMPTZ DEFAULT now()`.
- **Secretos**: jamás en el repo. Siempre por entorno.
