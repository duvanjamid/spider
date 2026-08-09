---
name: scaffold-app
description: Crea el scaffolding de una nueva app dentro del monorepo Spider (backend Java+Ligero y frontend Angular en apps/<name>/, con su schema de BD, migraciones, y registro en docker-compose, gateway y los blueprints de Render). Úsala cuando el usuario pida "crear una app", "nueva app", "scaffold", "generar app <nombre>" o similar dentro de este repo.
---

# Scaffold de una app en Spider

Genera una app nueva siguiendo la arquitectura estándar del monorepo (ver `CLAUDE.md`).

## Cuándo usarla
Cuando se pida crear/añadir una app nueva al ecosistema Spider.

## Reglas (obligatorias)
- **Nombres únicos**: no puede existir otra app con el mismo nombre. El generador aborta si `apps/<name>` ya existe o si el servicio ya aparece en los configs.
- **Formato del nombre**: `^[a-z][a-z0-9]{1,29}$` (minúsculas, sin guiones ni espacios). Sirve como slug de ruta, package Java (`com.spider.<name>`) y schema de BD.
- **Un schema por app, nada compartido**: prod → `<name>`, test → `test_<name>`.
- **Nada de DDL a mano**: todo cambio de BD es una migración Flyway en `apps/<name>/backend/src/main/resources/db/migration`.

## Pasos
1. Confirma el nombre con el usuario si hay ambigüedad. Valida el formato.
2. Ejecuta el generador desde la raíz del repo:
   ```bash
   node tools/scaffold/scaffold-app.mjs <name>
   ```
3. El generador crea:
   - `apps/<name>/backend` (Java + Ligero + Flyway, con `V1__init_<name>.sql`)
   - `apps/<name>/frontend` (Angular)
   y registra la app en `docker-compose.yml`, `infra/gateway/nginx.conf`,
   `render.yaml` (production) y `render.test.yaml` (test).
4. Verifica en local:
   ```bash
   export BD_PASS=...
   docker compose up --build <name>-backend <name>-frontend gateway db
   # → http://localhost:8080/<name>
   # → http://localhost:8080/api/<name>/health
   ```
5. En Render, define el secreto `DATABASE_URL` del servicio backend (URL interna de `spider-db`) y las variables de OAuth si la app usa login.

## Notas
- Si el usuario quiere que la app tenga login con Google, reutiliza el patrón de `apps/admin` (`auth/AuthController` + `auth/AuthService`) como referencia; el scaffold base no lo incluye para mantener las apps mínimas.
- Tras generar, haz commit en la rama `develop` (gitflow) para desplegar a test.
