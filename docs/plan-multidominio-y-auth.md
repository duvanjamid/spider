# Plan — Multidominio + login independiente por app

> Estado: **propuesta** (no implementado). Documento de arquitectura para discutir y
> ejecutar por fases. No cambia código todavía.

## 1. Objetivo

Hoy Spider es una plataforma con **login único** (el `admin` emite una cookie
`spider_session` compartida) y enrutado **por ruta** bajo un solo origen
(`spider.muvatec.com/<app>`). Eso sirve como **entorno de iteración**.

La meta a futuro:

- **Spider = taller de iteración.** Se conserva tal cual para desarrollar y probar
  todas las apps juntas (path-based, login admin compartido).
- **Producción = por app.** Cuando una app se promueve al público, vive en **su
  propio dominio** y trae **su propio sistema de login independiente** (unas solo
  Google, otras correo+contraseña, otras magic link, etc.). Sin cookie compartida,
  sin pasar por el admin.

Esto además alinea con el principio del `CLAUDE.md`: *"una app = una unidad
aislada"*. La auth centralizada actual es justo lo que rompe ese principio para
producción.

## 2. Dos planos

| | Plano iteración (Spider) | Plano producción (por app) |
|---|---|---|
| Dominio | `spider.muvatec.com/<app>` | `miapp.com` (propio por app) |
| Enrutado | por ruta (gateway nginx) | por host (gateway o Coolify) |
| Login | admin compartido (hoy) | propio de la app, independiente |
| Cookie | `spider_session` host-only | cookie propia por dominio (aislada) |
| Uso | desarrollar / probar | público |

La **misma imagen/código** sirve en ambos planos; cambia la **configuración**, no
el código (flag `AUTH_MODE=platform|standalone`).

## 3. Por qué es más simple que un SSO multi-subdominio

Al querer **login distinto por app** desaparece la necesidad de SSO entre
subdominios (cookie `Domain=.muvatec.com`, host central de auth, redirects, etc.):

- Cada app emite **su propia cookie host-only** en su dominio → aislamiento total.
- No hay redirect a un auth central; cada app se basta sola.
- Más seguro y más fácil de razonar. Una app comprometida no toca a otra.

## 4. Pieza central: módulo de auth *pluggable* por app

Un módulo reutilizable (`spider-auth`, posiblemente sobre `ligero-auth` que ya está
en el Maven local) que **cada backend embebe**. Los métodos de login son **plugins
que se activan por configuración**:

| Provider | Uso típico |
|---|---|
| Google OIDC | apps "entra con Google" (como hoy) |
| Email + contraseña | apps públicas clásicas |
| Magic link (correo) | sin contraseñas |
| *(futuro)* GitHub / Apple / OTP SMS-WhatsApp | según la app |

Config por entorno:

```
AUTH_PROVIDERS=google            # p.ej. electrolineras: solo Google
AUTH_PROVIDERS=password,google   # otra app: correo + Google
```

El scaffold genera el wiring y la pantalla de login se **auto-dibuja** según los
providers activos.

## 5. Contrato de auth (estándar por app)

- `GET  /<app>-api/auth/providers` → qué métodos mostrar en el login.
- `GET  /<app>-api/auth/google` + `/google/callback` (si Google activo).
- `POST /<app>-api/auth/login` · `/register` · `/magic` (si password/magic activos).
- `POST /<app>-api/auth/logout`.
- `GET  /<app>-api/me` → identidad desde **la cookie propia de la app**.

`electrolineras` ya tiene su `Identity`; se generaliza a partir de ahí.

## 6. Modelo de datos (encaja con schema-por-app)

Cada app, en **su propio schema**, su tabla de usuarios y sesiones:

- `app_user (id, email, provider, password_hash?, name, picture, created_at, …)`
  vía migración Flyway propia.
- Sesión = JWT firmado con **el secreto de la app** (`AUTH_JWT_SECRET` por app),
  cookie host-only. El patrón HMAC del `Identity` actual sirve de base.

Los usuarios de cada app son poblaciones separadas. Si algún día un subconjunto de
apps quiere compartir usuarios, se activa un IdP central **opcional** (el patrón lo
permite sin obligarlo).

## 7. Dominios / enrutado

- **DNS wildcard** `*.muvatec.com` (o el dominio real de cada app) → una sola vez.
- **Opción recomendada:** el gateway nginx enruta por `Host`, o dominio nativo en
  Coolify (Traefik + Let's Encrypt ya incluidos). Cert **wildcard** para cero
  trabajo por app.
- En producción, cada app puede tener un **dominio de marca distinto**
  (`misgastos.com`, `cargaya.co`…), no solo subdominio.
- No hace falta un proxy externo (NPM): Coolify ya trae el reverse proxy y el TLS.

## 8. Migración desde lo de hoy (sin romper nada)

Flag por entorno en cada app, `AUTH_MODE`:

- `platform` (dev/Spider): acepta la cookie del `admin` como hoy → se sigue
  iterando sin fricción.
- `standalone` (prod): usa su propio módulo de auth y su tabla de usuarios.

Se promueve una app a producción **cuando se quiera**, app por app, sin tocar las
demás.

## 9. "Agregar / promover una app" (estado final)

1. `scaffold-app miapp` → genera app **+ módulo auth + migración de usuarios +
   pantalla de login** genérica.
2. Se eligen providers: `AUTH_PROVIDERS=…` y sus secretos (Google client, SMTP para
   magic link, etc.) en Coolify.
3. Se apunta el dominio (una vez wildcard) y `deploy`.
4. `miapp.com` público, con **su** login. Cero impacto en las otras apps.

## 10. Decisiones pendientes (para la versión ejecutable)

1. **Base del módulo:** ¿`spider-auth` propio o sobre `ligero-auth`?
2. **Providers del primer corte:** ¿Google + email/contraseña? ¿Magic link ya o después?
3. **Usuarios:** ¿100% aislados por app (recomendado), con puerta abierta a IdP central opcional?
4. **Primera app a independizar:** ¿electrolineras o gastos como piloto?
5. **El `admin`:** ¿queda solo como hub interno de Spider (iteración), sin rol en producción?

---

## Anexo — Regla de persistencia (aprendida en el camino)

- **Datos de dominio del usuario → siempre en la BD** (por `owner_email` / usuario de
  la app). Ejemplos: vehículo, calificaciones, reportes.
- **`localStorage` → solo** preferencias de UI por dispositivo (tema, vista) y caché
  para modo invitado/offline. **Nunca** como fuente de verdad de datos del usuario.
