# Migración de Render a Coolify

Guía para desplegar Spider en **Coolify** (self-hosted, VM Oracle Always Free)
en lugar de Render. Reemplaza el modelo de `render.yaml` por un único recurso
**Docker Compose** más un **Postgres gestionado** por Coolify.

## Qué cambia respecto a Render

| Aspecto | Render (`render.yaml`) | Coolify |
|---|---|---|
| Servicios | 1 servicio web por back/front (18 servicios) | 1 recurso **Docker Compose** con todos |
| Entrada | `spider-gateway` público + N URLs `*.onrender.com` | `gateway` público en `spider.muvatec.com`, resto interno |
| Base de datos | `spider-db` (Render Postgres) vía `DATABASE_URL` | **Postgres gestionado de Coolify** vía `DB_HOST/DB_*` |
| Aislamiento | 1 BD, **un schema por app** | igual (1 BD, schema por app) |
| TLS | Render gestiona | Traefik + Let's Encrypt (automático) |
| Sleep / keep-alive | free tier duerme → `/keepalive` | **no aplica**: la VM no duerme |
| Entornos | prod (`main`) + test (`develop`) por servicio | 1 recurso por entorno (empieza con prod) |

`render.yaml` se conserva; esta carpeta añade el camino Coolify sin borrarlo.

## Archivos

- `docker-compose.coolify.yml` — stack completo (gateway + 4 apps × back/front).
  Sin `db` (gestionado aparte) y sin puertos al host (ingress por Traefik).
- `.env.coolify.example` — variables a cargar en Coolify.

## Requisitos previos (ya hechos en esta VM)

- VM Oracle Always Free (ARM 4 OCPU / 24 GB) con Coolify instalado.
- DNS wildcard `*.muvatec.com` → IP de la VM, y `master.muvatec.com` (panel).
- Puertos abiertos: 22, 80, 443, 6001-6002.

## Pasos

### 1. Crear el Postgres gestionado

Coolify → tu proyecto → **+ New** → **Database** → **PostgreSQL 16**.
- Name: `spider-db`
- Database: `spider`  ·  User: `spider_user`  ·  Password: (fuerte)
- Deploy. Anota el **hostname interno** (pestaña *Connection → Internal*):
  será tu `DB_HOST`.

### 2. Crear los schemas (uno por app)

Las migraciones Flyway de cada backend crean sus tablas dentro de su schema,
pero el schema debe existir. Desde la consola de la BD en Coolify (o `psql`):

```sql
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS gastos;
CREATE SCHEMA IF NOT EXISTS electrolineras;
CREATE SCHEMA IF NOT EXISTS alertas;
```

> Si prefieres entorno de test en la misma BD, crea también `test_admin`,
> `test_gastos`, etc., y despliega un segundo recurso Compose apuntando a
> esos schemas (`DB_SCHEMA`).

### 3. Crear el recurso Docker Compose

Coolify → proyecto → **+ New** → **Docker Compose**.
- Source: el repo `duvanjamid/spider`, rama `develop` (o la que promociones).
- Compose file path: `infra/coolify/docker-compose.coolify.yml`
- Base directory: `/`
- Activa el toggle **Connect To Predefined Network** (para alcanzar la BD
  gestionada por su hostname interno).

### 4. Variables de entorno

En el recurso Compose → **Environment Variables**, carga las de
`.env.coolify.example` con valores reales (`DB_HOST` = hostname del paso 1).

### 5. Dominio del gateway

Primer **Deploy**. Luego, en el servicio `gateway` del recurso, pon el dominio:

```
https://spider.muvatec.com
```

Coolify genera las labels de Traefik y emite el cert Let's Encrypt (puertos
80/443 ya abiertos). En 1-2 min:

- `https://spider.muvatec.com` → redirige a `/admin/`
- `https://spider.muvatec.com/gastos/` → frontend de gastos
- `https://spider.muvatec.com/gastos-api/` → backend de gastos
- …igual para `admin`, `electrolineras`, `alertas`.

### 6. Google OAuth

En Google Cloud Console → credenciales OAuth, añade el redirect URI de
producción:

```
https://spider.muvatec.com/api/admin/auth/google/callback
```

(ajusta la ruta si el backend usa otra; ver `AuthController`).

## Verificación

```bash
curl -I https://spider.muvatec.com/healthz          # gateway → 200
curl -I https://spider.muvatec.com/admin-api/health # backend admin → 200
```

## Rollback

El despliegue en Render sigue intacto (`render.yaml` sin tocar). Para volver,
apunta el DNS de vuelta y reactiva los servicios en Render.

## Operación / troubleshooting

### Panel Coolify da 502 (Bad Gateway) al recargar
El programa del panel corre bien; Traefik (`coolify-proxy`) se salió de la red
interna `coolify` y no lo alcanza. Las apps (spider-test) siguen sirviendo.
Fix SIN la UI (justo con 502 no carga):

```bash
ssh -i ~/.ssh/oci_coolify ubuntu@129.153.222.97 \
  'sudo docker network connect coolify coolify-proxy 2>/dev/null; echo ok'
```

No reinicies el proxy con `docker restart` crudo (pierde redes). Si hace falta
reiniciarlo, hazlo desde Coolify → *Server → Proxy → Restart*.

### Un `/<app>-api` da 502 tras reiniciar un backend
El nginx del gateway cachea la IP del upstream al arrancar. Reinicia el gateway
para que re-resuelva:

```bash
ssh -i ~/.ssh/oci_coolify ubuntu@129.153.222.97 \
  'sudo docker restart $(sudo docker ps --format "{{.Names}}" | grep gateway- | head -1)'
```

### Deploy manual
```bash
curl -X POST -H "Authorization: Bearer <TOKEN_COOLIFY>" \
  "https://master.muvatec.com/api/v1/deploy?uuid=<APP_UUID>&force=false"
```
(o el botón *Deploy* del recurso). La URL `/api/v1/deploy` necesita bearer, así
que NO sirve como webhook de GitHub: para auto-deploy usa la URL de la pestaña
*Webhooks* del recurso.
