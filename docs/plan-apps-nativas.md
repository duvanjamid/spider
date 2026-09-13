# Plan: llevar las apps de Spider a móvil nativo

> Estado actual: cada app (`gastos`, `electrolineras`, `admin`) es un **frontend Angular 18
> standalone + PrimeNG 18**, servido como **PWA instalable** detrás del gateway, con backend
> Java + Ligero y sesión por cookie compartida (`spider_session`) que emite `admin`.
> Objetivo: publicarlas como **apps nativas** (Google Play / App Store) reutilizando el
> máximo del código Angular que ya existe.

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
| **Reescritura React Native/Expo o Flutter** | ❌ desde cero | ✅ | ✅ | Muy alto | No: tira el trabajo hecho |

### Sobre "algo más moderno que Ionic"
Lo que la gente llama "Ionic" en realidad son **dos cosas**: (a) el **framework de UI** (viejo,
opcional) y (b) **Capacitor**, el runtime nativo (moderno, activo). La forma moderna es
**Capacitor sin el UI de Ionic**. El único competidor verdaderamente "más nuevo" es
**Tauri 2** (shell en Rust, binario más liviano); es atractivo pero su soporte **móvil** es
reciente y con menos plugins/documentación que Capacitor, así que para producción hoy
Capacitor es la apuesta segura. Podemos revisar Tauri en 6–12 meses.

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
