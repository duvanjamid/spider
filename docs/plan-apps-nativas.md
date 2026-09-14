# Plan: llevar las apps de Spider a móvil nativo

> Estado actual: cada app (`gastos`, `electrolineras`, `admin`) es un **frontend Angular 18
> standalone + PrimeNG 18**, servido como **PWA instalable** detrás del gateway, con backend
> Java + Ligero y sesión por cookie compartida (`spider_session`) que emite `admin`.
> Objetivo: publicarlas como **apps nativas** (Google Play / App Store) reutilizando el
> máximo del código Angular que ya existe.

---

## 0. Spider como incubadora (modelo de ciclo de vida)

Spider **no** es el destino final de cada app: es una **incubadora**. El valor de Spider es
poder **crear e iterar apps muy rápido** —con Claude Code en la nube, sin fricción de setup— y
**validarlas en la web/PWA** con usuarios reales, barato y en minutos por cambio. Cuando una
app **madura** (se estabiliza, tiene tracción y merece estar en las tiendas), **"se gradúa"** y
sale a **nativa** por la vía de este documento (Capacitor). Ese salto a nativo es el **final**
del proceso, no el principio.

```
   ┌─────────────────────── SPIDER (incubadora) ───────────────────────┐
   │  scaffold-app → iterar rápido (cloud) → PWA en spider.muvatec.com  │
   │  validar con usuarios → pulir  ── (repetir barato) ──              │
   └───────────────────────────────┬───────────────────────────────────┘
                                    │  la app "está bien" (madura)
                                    ▼
                    GRADUACIÓN A NATIVO (Capacitor, este plan)
                        Android + iOS en las tiendas
```

**Implicaciones para este plan:**
- La fase de **incubación (web/PWA) se mantiene siempre**: es donde se desarrolla y se prueba.
  Lo nativo es un **empaque adicional** del mismo código, no un reemplazo. Por eso Capacitor
  (mismo código Angular → web + Android + iOS) encaja con el modelo; reescribir en Flutter lo
  rompería (partiría la web de lo móvil).
- Ir a nativo **por app y cuando esté lista**, no todas a la vez. Cada app se gradúa por su
  cuenta cuando cumple el checklist de abajo.
- El **backend en la nube (Coolify) sigue siendo el mismo** en web y en nativo; solo cambia el
  empaque del frontend y la autenticación por token (§5).

### Checklist de graduación (¿la app ya está lista para salir a nativo?)
- [ ] Funcionalidad estable: pocos cambios de UI/flujo semana a semana.
- [ ] Validada con usuarios reales en la PWA (uso recurrente, feedback incorporado).
- [ ] Sin bugs bloqueantes abiertos; sesión/permisos sólidos.
- [ ] Necesita algo que solo lo nativo aporta (mejor cámara/GPS, push nativo, estar en tiendas).
- [ ] Hay quién sostenga el ciclo de tiendas (revisiones, versiones, firmas).

Mientras una app **no** cumpla esto, se queda incubando en la web —que es precisamente para lo
que Spider es bueno—.

---

## 1. Conclusión primero (recomendación)

**Usar [Capacitor](https://capacitorjs.com) para envolver cada app Angular tal cual.**

Capacitor es la evolución moderna de lo que era Cordova/PhoneGap y es del mismo equipo de
**Ionic** — pero **no obliga a usar los componentes de Ionic**: envuelve *cualquier* web app
(Angular + PrimeNG incluidos) en un contenedor nativo (WebView) y te da un puente a las APIs
nativas (cámara, GPS, push, archivos, biometría…). Es hoy el estándar de facto para
"web app → app nativa" y el camino de **menor reescritura**: reutilizamos ~100% del Angular
que ya tenemos.

- **No** hace falta migrar a Ionic Framework (los componentes UI). Seguimos con **PrimeNG**.
- **No** hace falta reescribir en React Native / Flutter (eso sería empezar de cero).
- Publicamos en **ambas tiendas** desde el mismo código.
- El backend Java **no cambia** (salvo el ajuste de autenticación de la sección 5).

Alternativa rápida solo-Android: **TWA / PWABuilder** (sección 3), útil si la urgencia es
"estar en Play ya" sin APIs nativas todavía.

---

## 2. Opciones evaluadas

| Opción | Reutiliza Angular+PrimeNG | iOS + Android | APIs nativas reales | Esfuerzo | Veredicto |
|---|---|---|---|---|---|
| **Capacitor** (web en WebView + plugins) | ✅ 100% | ✅ ambas | ✅ (cámara, GPS, push, files…) | **Bajo–medio** | **Recomendado** |
| **Ionic Framework** (UI) + Capacitor | ⚠️ reescribir UI a componentes Ionic | ✅ | ✅ | Alto | No: ya tenemos PrimeNG |
| **PWA → TWA / PWABuilder** | ✅ 100% | Android sólido; iOS limitado | ❌ (solo APIs web) | Muy bajo | Atajo Android |
| **Tauri 2** (Rust + WebView, con soporte móvil) | ✅ el web; shell en Rust | ✅ (móvil aún más joven) | ✅ vía plugins | Medio–alto | "Más moderno" pero ecosistema móvil menos maduro |
| **NativeScript-Angular** | ⚠️ comparte TS, reescribe UI | ✅ | ✅ | Alto | No aporta vs Capacitor |
| **Flutter** (reescribir en Dart) | ❌ 0% de UI (solo backend) | ✅ | ✅ | Muy alto | Mejor rendimiento/feel, pero reescritura total → ver **§2.1** |
| **Reescritura React Native/Expo** | ❌ desde cero | ✅ | ✅ | Muy alto | No: tira el trabajo hecho |

### Sobre "algo más moderno que Ionic"
Lo que la gente llama "Ionic" en realidad son **dos cosas**: (a) el **framework de UI** (viejo,
opcional) y (b) **Capacitor**, el runtime nativo (moderno, activo). La forma moderna es
**Capacitor sin el UI de Ionic**. El único competidor verdaderamente "más nuevo" es
**Tauri 2** (shell en Rust, binario más liviano); es atractivo pero su soporte **móvil** es
reciente y con menos plugins/documentación que Capacitor, así que para producción hoy
Capacitor es la apuesta segura. Podemos revisar Tauri en 6–12 meses.

---

## 2.1 Benchmarking: Capacitor vs Flutter

Flutter (Google, lenguaje **Dart**, motor de render propio **Impeller/Skia**) es el rival
"serio" a considerar cuando se quiere el máximo rendimiento/UX nativa. Es una **reescritura
completa**: no reutiliza nada del Angular/PrimeNG actual — se rehace la UI en Dart. Comparado
de frente para **este** proyecto:

| Criterio | **Capacitor** (envolver lo actual) | **Flutter** (reescribir en Dart) |
|---|---|---|
| Reutilización del código actual | ✅ ~100% (Angular + PrimeNG + lógica) | ❌ 0% de UI; solo se conserva el backend Java |
| Esfuerzo inicial (3 apps) | Bajo–medio (envolver + auth token) | **Muy alto** (rehacer 3 UIs completas + estado + mapas + gráficas) |
| Lenguaje/skills del equipo | TypeScript/Angular (ya lo dominan) | **Dart** (curva de aprendizaje nueva) |
| Rendimiento de UI / animaciones | Bueno (WebView; suficiente para estas apps) | **Excelente** (60–120 fps, render propio) |
| Feel "100% nativo" (scroll, gestos, transiciones) | Muy bueno con pulido | **El mejor**, de fábrica |
| Arranque en frío | Ligeramente mayor (arranca WebView) | Más rápido |
| Tamaño del binario | Pequeño (comparte WebView del SO) | Mayor (~8–15 MB de motor Flutter) |
| Cámara / GPS / push | Plugins Capacitor (los que ya necesitamos) | Plugins pub.dev (equivalentes, muy maduros) |
| Mapas | Leaflet actual reutilizado (0 trabajo) | `google_maps_flutter` / `flutter_map` (rehacer) |
| Gráficas (dashboards de gastos) | PrimeNG/Chart.js actuales reutilizados | `fl_chart`/`syncfusion` (rehacer) |
| Web + PWA desde el mismo código | ✅ (un código → web + Android + iOS) | ⚠️ Flutter Web existe pero pesa y el SEO/PWA es flojo; en la práctica la web actual quedaría aparte |
| Escaneo IA / lógica de negocio | En el backend Java (**igual en ambos**) | Igual (no cambia) |
| Madurez / soporte largo plazo | Alta (Ionic) | **Alta** (Google, gran comunidad) |
| Time-to-market para ESTE repo | **Semanas** | **Meses** |

**Lectura del benchmark.** Flutter *gana* en rendimiento puro, fluidez de animaciones y en la
sensación nativa "de fábrica" — es la mejor opción **si empezaras de cero** o si la app fuera
muy intensiva en gráficos/animación (juegos, editores, transiciones complejas). Pero para
**Spider**, donde las apps son formularios, listas, mapas y dashboards —cargas donde un WebView
bien hecho rinde de sobra— esas ventajas **no compensan** tirar el Angular/PrimeNG ya
construido y pulido, aprender Dart y mantener la web por separado. El costo (meses de
reescritura × 3 apps, más romper el "un código → web+móvil") es desproporcionado frente a la
ganancia real percibida por el usuario en este tipo de app.

**Cuándo reconsiderar Flutter:** si a futuro una app nueva necesita rendimiento/animación
extremos, o si se decide abandonar la web y vivir solo en móvil, Flutter sería la vía a evaluar
para *esa* app puntual — no para migrar lo que ya funciona.

**Veredicto:** para este proyecto, **Capacitor**. Flutter queda documentado como la alternativa
premium-pero-cara, a reconsiderar caso por caso.

---

## 3. Atajo opcional (solo si urge Android): TWA / PWABuilder
Como ya son PWAs, [PWABuilder](https://www.pwabuilder.com) genera un **TWA** (Trusted Web
Activity) que publica la PWA en Google Play en horas, sin tocar código. Limitaciones: iOS casi
no soporta este modelo, y no da APIs nativas (la cámara/GPS siguen siendo las del navegador).
Sirve como paso 0 para Android mientras hacemos Capacitor bien; **no** reemplaza el plan.

---

## 4. Arquitectura propuesta en el monorepo

Cada app sigue siendo **independiente** (su propio bundle id, ícono y ficha de tienda), igual
que hoy son apps web independientes. Capacitor vive **dentro de cada frontend**:

```
apps/
  gastos/frontend/
    src/ …                         (Angular, sin cambios)
    capacitor.config.ts            (appId: com.muvatec.gastos, webDir: dist/…)
    android/                       (proyecto Android generado por Capacitor)
    ios/                           (proyecto iOS generado por Capacitor)
  electrolineras/frontend/
    capacitor.config.ts            (appId: com.muvatec.electrolineras)
    android/  ios/
```

- El **build web** (`npm run build`) sigue produciendo `dist/…`; Capacitor copia ese `dist`
  al contenedor nativo con `npx cap sync`.
- La misma app Angular corre en **3 destinos**: web/PWA (Coolify), Android y iOS. Un solo
  código, tres empaques.
- En nativo, la app **no** se sirve desde `spider.muvatec.com`: el bundle va **empacado** y el
  WebView lo carga localmente (`https://localhost` en Android / `capacitor://localhost` en
  iOS). Las llamadas al API siguen yendo a `https://spider.muvatec.com/<app>-api/…` por HTTPS.
  → Esto es lo que obliga a ajustar la autenticación (sección 5).

---

## 5. El cambio técnico grande: autenticación

Hoy la sesión es una **cookie** `spider_session` (HttpOnly, SameSite=Lax, dominio
`spider.muvatec.com`) que emite `admin` tras el login de Google, y cada app la lee. **En un
WebView nativo esto se rompe**, porque:

1. El origen del WebView (`https://localhost` / `capacitor://localhost`) **≠** el dominio del
   API → la cookie es "de terceros" y no se envía de forma fiable (peor en iOS/WKWebView).
2. El flujo OAuth de Google por **redirección** no funciona igual dentro de un WebView (Google
   incluso bloquea logins en WebViews embebidos).

**Solución (una sola vez, sirve para las 3 apps):** pasar de *cookie implícita* a **token
explícito (Bearer)**, manteniendo la cookie para el modo web.

- **Login nativo:** usar **Google Sign-In nativo** (`@capacitor-community/generic-oauth2` o el
  plugin de Google) o abrir el login en el navegador del sistema con `@capacitor/browser` y un
  **deep link** de vuelta (`com.muvatec.gastos://auth`). El `admin` devuelve, además de setear
  la cookie, un **token** (el mismo string firmado que hoy va en la cookie).
- **Almacenamiento:** guardar el token con `@capacitor/preferences` (seguro y persistente en
  el dispositivo). Esto además da la "sesión que dura hasta cerrar sesión" de forma nativa.
- **Envío:** un `HttpInterceptor` en Angular añade `Authorization: Bearer <token>` cuando
  corre en nativo. El backend ya sabe validar ese string (hoy lo valida desde la cookie); solo
  hay que **aceptarlo también desde el header** en `Identity`/`AuthGuard` (cambio pequeño y
  compatible con web).
- **Logout:** borrar el token de Preferences + el POST de logout actual.

> Este es el punto de más trabajo/riesgo del plan. Conviene resolverlo en la **app piloto** y
> dejarlo como patrón reutilizable para las demás.

---

## 6. Reemplazos web → nativo por capacidad

| Hoy (web) | En nativo (Capacitor) | App que lo usa |
|---|---|---|
| `<input type=file capture>` para escanear factura | `@capacitor/camera` (cámara nativa, mejor UX) | gastos |
| `navigator.geolocation` | `@capacitor/geolocation` (permiso nativo, más preciso) | electrolineras |
| Web Push (VAPID) | `@capacitor/push-notifications` + **FCM** (Android) / **APNs** (iOS) | gastos |
| Leaflet en el WebView | Funciona igual; opcional migrar a mapa nativo más adelante | electrolineras |
| Cookie de sesión | Token en `@capacitor/preferences` (sección 5) | todas |
| Barra de estado / splash / ícono | `@capacitor/status-bar`, `@capacitor/splash-screen`, `assets` | todas |
| Botón atrás de Android | `@capacitor/app` (ya emulamos "atrás" en el router propio) | todas |
| Actualizar sin pasar por la tienda (opcional) | **OTA**: `@capgo/capacitor-updater` (self-host) o Ionic Appflow | todas |

El **push** cambia de proveedor: hoy es Web Push con VAPID; en nativo hay que registrar el
proyecto en **Firebase (FCM)** para Android y **APNs** para iOS, y el backend enviar por esos
canales (se puede unificar con FCM para ambos). Es trabajo aparte, se puede dejar para una
fase posterior (las apps funcionan sin push).

---

## 7. Roadmap por fases

**Fase 0 — Decisión y cuentas (0.5 sem)**
- Confirmar Capacitor + app piloto (sugiero **electrolineras**: usa GPS y es la más "de calle";
  o **gastos** si prefieres validar cámara y push primero).
- Abrir cuentas de tienda: **Google Play** (pago único US$25) y **Apple Developer**
  (US$99/año). Definir bundle ids `com.muvatec.<app>`.
- Definir cómo se compilan builds iOS (hace falta macOS: una Mac, o CI en la nube tipo
  **Codemagic / GitHub Actions macOS / EAS build**). Android compila en Linux/CI normal.

**Fase 1 — Piloto: 1 app corriendo en Android (1–2 sem)**
- Añadir Capacitor al frontend piloto (`@capacitor/core`, `cli`, `android`), `capacitor.config.ts`.
- `npm run build` → `npx cap sync` → abrir en Android Studio → correr en emulador/dispositivo.
- Resolver **autenticación por token** (sección 5) end-to-end en esta app.
- Ícono, splash, barra de estado, botón atrás.

**Fase 2 — Plugins nativos en el piloto (1 sem)**
- Cámara (si es gastos) / Geolocalización (si es electrolineras).
- `@capacitor/preferences` para el token.
- Deep links para el retorno del login.

**Fase 3 — iOS + publicación del piloto (1–2 sem)**
- `@capacitor/ios`, build en Mac/CI, firmas, TestFlight.
- Ficha de tienda, capturas, política de privacidad (obligatoria en ambas), revisión.
- Publicar el piloto en Play + App Store (o beta cerrada primero).

**Fase 4 — Push (opcional, 1 sem)**
- FCM/APNs + endpoint de envío nativo en el backend.

**Fase 5 — Industrializar y replicar (1 sem + repetición)**
- Extraer el patrón (config Capacitor, interceptor de token, login nativo, íconos) a algo
  reutilizable y **añadirlo al generador `scaffold-app`** para que toda app nueva nazca
  "native-ready".
- Repetir Fases 1–3 para las apps restantes (mucho más rápido con el patrón ya hecho).

**Estimado total**: ~6–9 semanas para tener el piloto en ambas tiendas + patrón listo; cada
app adicional ~1–2 semanas.

---

## 8. Costos y requisitos
- **Google Play**: US$25 (pago único).
- **Apple Developer**: US$99/año (obligatorio para App Store y TestFlight).
- **Build iOS**: macOS real o CI en la nube (Codemagic/EAS tienen plan gratis limitado).
- **Firebase** (si hacemos push nativo): gratis en el tier de FCM.
- **Política de privacidad** publicada (ambas tiendas la exigen; ya usamos login de Google y
  ubicación → hay que declararlo).

---

## 9. Riesgos y notas
- **Autenticación** es el mayor riesgo técnico → resolverlo en el piloto antes de escalar.
- **Revisión de Apple** puede pedir justificar permisos (cámara/ubicación) y que la app no sea
  "solo un sitio web envuelto": ayuda que ya usamos cámara/GPS nativos y que se siente como app.
- **Mantener 3 destinos** (web + Android + iOS) desde un código: disciplina de detectar
  `Capacitor.isNativePlatform()` para los caminos que difieren (auth, cámara, push).
- **OTA (Capgo)** permite actualizar el JS sin re-publicar en tiendas, pero cambios nativos
  (plugins nuevos) sí requieren nueva versión en tienda.
- No romper la **PWA**: todo lo nativo va detrás de checks de plataforma; la web sigue igual.

---

## 10. Primer paso concreto propuesto
Elegir la **app piloto** y, en su `frontend/`:
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Electrolineras" "com.muvatec.electrolineras" --web-dir=dist/electrolineras-frontend/browser
npm run build && npx cap add android && npx cap sync
npx cap open android   # correr en emulador
```
…y en paralelo implementar el **login por token** (sección 5), que es lo que desbloquea todo lo
demás. Cuando digas cuál app es el piloto, arranco por ahí.

---

## 11. Independizar una app del monorepo (front y back por separado en Coolify)

Parte del ciclo de graduación (§0): cuando una app madura, conviene **sacarla del monorepo
`spider`** a **su propio repositorio** con **su propio despliegue** (frontend y backend como
**servicios separados en Coolify**), su propia BD/esquema y su propio dominio. Así deja de
depender de la incubadora y puede evolucionar y publicarse (web + nativo) por su cuenta.

> Nota: esto se relaciona con `docs/plan-multidominio-y-auth.md`. La diferencia: allí cada app
> vivía en el mismo repo con su subdominio; aquí la app **se extrae a su propio repo** y su
> propio proyecto en Coolify. Es el grado máximo de aislamiento, previo (o paralelo) a nativo.

### 11.1 Qué se separa
| Recurso | Hoy (monorepo) | Independizada |
|---|---|---|
| Repositorio | `duvanjamid/spider` (todas las apps) | `duvanjamid/<app>` (solo esa app) |
| Coolify | 1 app `spider-prod` (docker-compose con todo) | 1 **proyecto** con 2 **recursos**: `<app>-front` y `<app>-back` |
| Dominio | `spider.muvatec.com/<app>` (por path) | `<app>.muvatec.com` (front) + API en `/api` o `api.<app>...` |
| Base de datos | 1 Postgres, **schema por app** | mismo Postgres con su schema **o** BD propia |
| Auth | cookie compartida que emite `admin` | **login propio** (su OAuth + su token) — ver §5 y §11.5 |
| CI/CD | deploy del monorepo a `main` | push a `main` de su repo → Coolify (front y back por separado) |

### 11.2 Extraer el código CON su historial (git)
No copiar a mano: preservar el historial de la app con `git subtree` (o `git filter-repo`).
```bash
# En un clon del monorepo, sacar el subárbol de la app a una rama nueva:
git subtree split -P apps/<app> -b split-<app>

# Crear el repo destino y traer ese subárbol como raíz:
mkdir ../<app> && cd ../<app> && git init
git pull ../spider split-<app>        # queda backend/ y frontend/ en la raíz
# Crear el repo remoto <app> y:
git remote add origin git@github.com:duvanjamid/<app>.git
git push -u origin main
```
Resultado: repo nuevo con `backend/` y `frontend/` en la raíz, conservando commits.
(`git filter-repo --path apps/<app>/ --path-rename apps/<app>/:` es la alternativa si se quiere
reescribir rutas con más control.)

### 11.3 Estructura del repo independiente
```
<app>/
  backend/            (Java + Ligero + Flyway; su Dockerfile ya existe)
  frontend/           (Angular + PrimeNG; su Dockerfile nginx ya existe)
  docker-compose.yml  (para correr local: db + back + front)
  README.md
```
El **Dockerfile de cada parte ya existe** en el monorepo; se reutiliza tal cual (el bloque de
bootstrap de Ligero sigue aplicando hasta que Ligero publique en Maven Central).

### 11.4 Coolify: dos servicios separados
Crear un **Proyecto** nuevo en Coolify (p. ej. `<app>`) con **dos recursos**:

1. **`<app>-back`** (Dockerfile app)
   - Build context: `backend/` · Dockerfile: `backend/Dockerfile`.
   - Env: `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (o `DATABASE_URL`), `DB_SCHEMA=<app>`,
     `AUTH_JWT_SECRET`, claves de APIs, `PUBLIC_BASE_URL`.
   - Health check: `/health`. Puerto interno el del backend.
   - Dominio: `api.<app>.muvatec.com` **o** sin dominio público y solo accesible por el front
     (ver 11.6).
2. **`<app>-front`** (Dockerfile → nginx)
   - Build context: `frontend/` · Dockerfile: `frontend/Dockerfile`.
   - Dominio público: `https://<app>.muvatec.com`.
   - El nginx del front **proxya** `/api` → servicio `<app>-back` (misma técnica que el gateway
     actual), así el front llama a `/<app>-api` o `/api` en su mismo origen y no hay problemas de
     CORS ni de cookies de terceros.

DNS: un registro (o wildcard `*.muvatec.com`) apuntando a Coolify; Coolify emite el TLS.

### 11.5 Autenticación al independizarse (importante)
Hoy la sesión la emite `admin` bajo `spider.muvatec.com`. En `<app>.muvatec.com` (otro origen)
**esa cookie ya no sirve**. Opciones:
- **A — Login propio (recomendado al independizar):** la app registra su **propio cliente de
  Google OAuth** y emite **su** sesión (el backend ya trae `Sessions`/HMAC; se copia el patrón
  de `admin`). Independencia total.
- **B — Seguir usando `admin` como identity central:** la app redirige el login a
  `admin.muvatec.com` y valida el token con el **mismo `AUTH_JWT_SECRET`**. Menos trabajo, pero
  mantiene un acople con Spider.

En ambos casos, conviene ya emitir **token Bearer** además de cookie (§5): así el mismo login
sirve para web y para la app nativa (Capacitor).

### 11.6 Datos
- **Opción simple:** apuntar `<app>-back` al **mismo Postgres** con su `DB_SCHEMA=<app>` (los
  datos ya viven ahí; no se migra nada).
- **Aislamiento total:** crear **BD propia** y migrar el schema con `pg_dump -n <app>` →
  `pg_restore`. Flyway del backend recrea el esquema; los datos se cargan del dump.

### 11.7 Checklist de independización
- [ ] `git subtree split` → repo `<app>` con historial, `backend/` + `frontend/` en la raíz.
- [ ] Proyecto en Coolify con recursos `<app>-back` y `<app>-front` (Dockerfiles reutilizados).
- [ ] Dominio `<app>.muvatec.com` + `/api` proxy al backend (TLS por Coolify).
- [ ] Env/secretos migrados; `DB_SCHEMA=<app>` (mismo Postgres) o BD propia con dump.
- [ ] Auth propia (o vía `admin`) emitiendo **token** además de cookie.
- [ ] Verificar `/health`, login, y flujos clave en el nuevo dominio.
- [ ] Apagar la app dentro del monorepo (quitar del docker-compose/gateway) cuando el nuevo
      dominio esté estable; dejar redirección si hace falta.
- [ ] (Después) añadir **Capacitor** sobre el `frontend/` ya independiente (§7).

### 11.8 Orden recomendado
Primero **independizar** (repo + Coolify + dominio + auth propia) y **después** hacer nativo.
Así el nativo se construye sobre una app que ya es autónoma, con su login por token listo — que
es justo lo que Capacitor necesita.

---

## 12. Nota de repos y ramas (estado a la fecha)
- **Dónde vive este plan:** rama `claude/project-structure-analysis-xh0e2q`, junto a
  `docs/plan-multidominio-y-auth.md`. No está en `main` (son documentos de planeación).
- **`develop` vs `main`:** **ya sincronizados** (back-port hecho: `develop` fast-forwardeado a
  `main`, divergencia 0/0). Antes `main` iba ~59 commits adelante porque todo el trabajo reciente
  se hizo y desplegó directo en `main` (que es lo que Coolify publica).
- **Implicación:** el gitflow descrito en `CLAUDE.md` (feature → develop → main) **no** se está
  siguiendo en la práctica; el flujo real es *trabajar y desplegar en `main`*. Recomendación:
  o **sincronizar `develop`** con `main` (`git checkout develop && git merge --ff-only main` si
  no diverge, o `git reset --hard origin/main` si se acepta descartar su estado viejo), o bien
  **oficializar que `main` es la rama de trabajo/deploy** y usar `develop` solo si se reactiva un
  entorno de test. Al **independizar** cada app (§11), este punto se simplifica: cada repo nuevo
  arranca con su propia estrategia de ramas limpia.

---

## 13. Plan de ejecución acordado — **Blaze** (electrolineras independizada)

La **primera app en graduarse** es **electrolineras**, que al salir del monorepo pasa a
llamarse **Blaze**. Este es el orden en firme:

### Orden
1. **Mejoras de diseño primero** — pulir la UI/UX de electrolineras **dentro de Spider**
   (sigue incubando), desplegando a `spider.muvatec.com/electrolineras` como hasta ahora.
   Cuando el diseño esté bien, recién se independiza.
2. **Migrar SOLO electrolineras a repos propios** (front y back separados) → ver §11.
3. **App Android con Capacitor** (§7) sobre `blaze-frontend`.
4. **App iOS con Capacitor** (§7) sobre `blaze-frontend`.

### Repositorios destino (ya creados, org `muvatec`)
| Repo | Contenido |
|---|---|
| `git@github.com:muvatec/blaze-frontend.git` | App Angular + PrimeNG (hoy `apps/electrolineras/frontend`) + luego Capacitor (android/ios) |
| `git@github.com:muvatec/blaze-backend.git` | Backend Java + Ligero + Flyway (hoy `apps/electrolineras/backend`) |
| `git@github.com:muvatec/blaze-landing.git` | Landing/marketing (sitio aparte, público) |

### Dominios
| Dominio | Sirve | Servicio Coolify |
|---|---|---|
| `blaze.muvatec.com` | La **app** (frontend Angular) | `blaze-frontend` |
| `blaze.muvatec.com/landing` | La **landing** (marketing) | `blaze-landing` (ruta `/landing`) |
| `blaze-api.muvatec.com` | El **backend** (API) | `blaze-backend` |

### Extracción con historial (git subtree)
```bash
# En un clon del monorepo:
git subtree split -P apps/electrolineras/frontend -b split-blaze-frontend
git subtree split -P apps/electrolineras/backend  -b split-blaze-backend
# Frontend:
mkdir ../blaze-frontend && cd ../blaze-frontend && git init
git pull ../spider split-blaze-frontend
git remote add origin git@github.com:muvatec/blaze-frontend.git && git push -u origin main
# Backend (análogo):
mkdir ../blaze-backend && cd ../blaze-backend && git init
git pull ../spider split-blaze-backend
git remote add origin git@github.com:muvatec/blaze-backend.git && git push -u origin main
```
`blaze-landing` se crea nuevo (no sale del monorepo).

### Coolify (3 servicios, en un proyecto `blaze`)
- **`blaze-backend`** → dominio `blaze-api.muvatec.com`. Env: `DB_SCHEMA=electrolineras`
  (mismo Postgres) o BD propia; `AUTH_JWT_SECRET`, claves de APIs (OCM/TomTom…), `PUBLIC_BASE_URL=https://blaze-api.muvatec.com`. Health `/health`.
- **`blaze-frontend`** → dominio `blaze.muvatec.com` (raíz). `environment.prod.apiBase =
  https://blaze-api.muvatec.com`.
- **`blaze-landing`** → mismo dominio `blaze.muvatec.com` en la ruta **`/landing`**.
  Se resuelve con el enrutado de Coolify por path (o un pequeño nginx en `blaze-frontend` que
  proxee `/landing` → `blaze-landing`). La app queda en `/`, la landing en `/landing`.

### Ojo con auth y CORS (backend en subdominio distinto)
El front (`blaze.muvatec.com`) llama al API en **otro origen** (`blaze-api.muvatec.com`), así que:
- La **cookie compartida de Spider ya no aplica** → Blaze usa **login propio** y **token
  Bearer** (§5 y §11.5). Esto además deja lista la auth para las apps nativas.
- Habilitar **CORS** en `blaze-backend` permitiendo `https://blaze.muvatec.com` (y los orígenes
  nativos de Capacitor: `capacitor://localhost` / `https://localhost`).
- OAuth de Google: registrar el cliente con redirect a `blaze-api.muvatec.com` y orígenes
  autorizados `blaze.muvatec.com`.

### Decisiones finales (2026-09) — orden actualizado
Tras revisar el prototipo de diseño (Claude Design, "Blaze"), se acordó:
1. **Migrar primero a Blaze** (repos propios) y aplicar el rediseño allá — NO en Spider.
2. **Estructura + visual idénticos al prototipo**: se adopta también su navegación
   (Bienvenida → Registro → Mi carro → Mapa; dock Mapa/Ruta/Añadir/Perfil) y el look por
   plataforma/tema (iOS/Android × claro/oscuro), con los tokens del prototipo.
3. **Auth: correo/contraseña + Google, con vinculación de cuentas.** Manejar todos los
   escenarios (p. ej. si el correo ya existe vía Google y se intenta registrar con contraseña,
   avisar "ya está vinculada con Google" y ofrecer iniciar con Google / establecer contraseña).

### Extracción ya realizada
La extracción con historial ya se hizo desde el monorepo (`git subtree split` de
`apps/electrolineras/frontend` y `/backend`) y se entregaron **git bundles**:
`blaze-frontend.bundle` (40 commits) y `blaze-backend.bundle` (22 commits), listos para subir a
`muvatec/blaze-frontend` y `muvatec/blaze-backend`.

### Nota de sesión (acceso a repos)
Esta sesión de Claude Code está acotada a la organización `duvanjamid` y **no puede empujar a
`muvatec/*`** (GitHub no permite mezclar organizaciones en una misma sesión). Para que Claude
haga el rediseño + auth **dentro de los repos Blaze**, hay que **abrir una nueva sesión sembrada
con `muvatec/blaze-frontend` (+ `blaze-backend`)** como fuentes. Alternativa: el rediseño se
construye en `apps/electrolineras` (Spider) y migra idéntico después — mismo código, distinto
orden.

### Prototipo de diseño (referencia)
El prototipo vive en el zip de handoff (`Electrolineras.dc.html`): pantallas bienvenida, registro,
mi carro, mapa, listado, detalle, ruta, añadir, perfil; 4 paletas (iOS/Android × claro/oscuro)
en el método `tokens()`; dock flotante (iOS) / barra Material con píldora (Android). Se valida
con capturas en el navegador (el prototipo arranca con React desde CDN; en entorno sin red se
inyecta React local para renderizarlo).
