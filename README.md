# 🕷️ Spider

Plataforma web responsive que hospeda múltiples apps bajo un mismo dominio,
con login de Google y control de acceso. Backend **Java + Ligero**, frontend
**Angular**, base **PostgreSQL** (un schema por app), despliegue en **Render**.

📖 **La arquitectura y todas las convenciones están en [`CLAUDE.md`](./CLAUDE.md).**

## Arranque rápido (local)

```bash
cp .env.example .env
export BD_PASS=una_clave_local
docker compose up --build
# http://localhost:8080/admin
```

## Crear una app nueva

```bash
node tools/scaffold/scaffold-app.mjs <nombre>
```

o usa la skill `scaffold-app` desde Claude Code.

## Estructura

```
apps/<app>/backend    Java + Ligero + Flyway
apps/<app>/frontend   Angular
infra/gateway         nginx (rutas /<app> y /api/<app>)
render.yaml           Render · un archivo, dos entornos (prod=main, test=develop)
```

## Gitflow

`develop` → entorno **test** · `main` → entorno **production**.
