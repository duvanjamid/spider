# Plan — Un dominio y un login por app (simple)

> Estado: **propuesta** (no implementado). Versión simplificada: **cada app es
> independiente de punta a punta, también en el login. Sin plataforma central,
> sin SSO, sin integración entre apps.**

## 1. Principio

Cada app es **autónoma**: su dominio, su login, sus usuarios, su sesión. No hay
un "login de la plataforma" que las conecte. Si mañana quito o rompo una app, las
demás ni se enteran.

Esto respeta el `CLAUDE.md` (*"una app = una unidad aislada"*) llevado también a
la autenticación.

## 2. Qué significa "login único por app"

- Cada app tiene **un** login propio: **el método que esa app elija** (por
  ejemplo, electrolineras solo Google; otra app correo+contraseña). Es decisión
  interna de cada app, no un framework compartido que haya que configurar.
- **No** se comparten usuarios ni sesión entre apps. Entrar en una no entra en
  otra. Cada quien maneja su propia gente.

## 3. Qué trae cada app (todo dentro de la misma app)

1. **Su tabla de usuarios** (en su propio schema, ya lo tienes por app).
2. **Su cookie de sesión** propia, *host-only* en su dominio (aislada de las demás).
3. **Su pantalla de login** con el/los método(s) que use.
4. **Su secreto** (`AUTH_JWT_SECRET` propio) para firmar la sesión.

Nada de esto sale de la app. El patrón HMAC del `Identity` que ya existe en
electrolineras sirve de base y se copia/adapta por app.

## 4. El `admin` de hoy

Deja de ser "el login de todos".

- En **Spider (entorno de iteración)** puede seguir sirviendo para probar apps
  juntas mientras desarrollas.
- En **producción**, cada app **no depende del admin**: tiene su propio login.

No hay cookie compartida, ni redirect a un auth central, ni SSO.

## 5. Dominios (lo mínimo)

- **DNS wildcard** `*.muvatec.com` (o el dominio real de cada app) → se configura
  una sola vez.
- Enrutado **por host**: el gateway nginx (o Coolify/Traefik) manda cada dominio a
  su app. Certificado **wildcard** → cero trabajo de TLS por app.
- 1 app = 1 dominio. Puede ser subdominio (`gastos.muvatec.com`) o dominio de
  marca propio (`misgastos.com`).

## 6. Agregar una app (flujo final)

1. `scaffold-app miapp` → genera la app **con su login mínimo y su tabla de
   usuarios**.
2. Se elige el método de login de esa app (Google, o correo+contraseña) y sus
   secretos en Coolify.
3. Se apunta el dominio (una vez wildcard) y `deploy`.
4. `miapp.com` público, con **su** login. Sin tocar las demás apps.

## 7. Lo que se ELIMINA del plan anterior (por complejo)

- ❌ Módulo de auth *pluggable* multi-provider obligatorio.
- ❌ IdP / login central opcional.
- ❌ SSO y cookie compartida entre subdominios (`Domain=.muvatec.com`).
- ❌ Flag `AUTH_MODE=platform|standalone`.
- ❌ "Dos planos" conceptuales acoplados.

Queda solo: **una app, un dominio, un login, sus usuarios.**

---

## Anexo — Regla de persistencia

- **Datos del usuario → siempre en la BD** (por usuario de esa app). Ej.: vehículo,
  calificaciones, reportes.
- **`localStorage` → solo** preferencias de UI por dispositivo y caché de
  invitado/offline. **Nunca** como fuente de verdad.
