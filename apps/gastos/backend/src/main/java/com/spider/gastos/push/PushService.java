package com.spider.gastos.push;

import com.spider.gastos.config.Env;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Web Push por usuario: guarda las suscripciones del navegador (una por
 * dispositivo) y envía notificaciones cifradas (aes128gcm + VAPID). El envío
 * es best-effort: si VAPID no está configurado o un push falla, se registra y
 * se continúa — nunca rompe el flujo que lo dispara (p.ej. crear un gasto).
 */
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private final DataSource ds;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public PushService(DataSource ds) { this.ds = ds; }

    /** Hay claves VAPID configuradas (si no, el push queda deshabilitado). */
    public boolean enabled() {
        return !Env.vapidPublic().isBlank() && !Env.vapidPrivate().isBlank();
    }

    /** Clave pública VAPID (applicationServerKey) para que el frontend se suscriba. */
    public String publicKey() { return Env.vapidPublic(); }

    // ── Suscripciones ──────────────────────────────────────────

    public void subscribe(String email, String endpoint, String p256dh, String auth) {
        if (endpoint == null || endpoint.isBlank() || p256dh == null || auth == null) return;
        String sql = """
                INSERT INTO push_subscription (owner_email, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
                ON CONFLICT (endpoint) DO UPDATE SET owner_email = EXCLUDED.owner_email,
                    p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, endpoint); ps.setString(3, p256dh); ps.setString(4, auth);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error guardando suscripción push", e); }
    }

    public void unsubscribe(String email, String endpoint) {
        if (endpoint == null || endpoint.isBlank()) return;
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM push_subscription WHERE owner_email = ? AND endpoint = ?")) {
            ps.setString(1, email); ps.setString(2, endpoint);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando suscripción push", e); }
    }

    /** ¿El usuario tiene al menos una suscripción activa? (para el toggle del perfil). */
    public boolean hasSubscription(String email) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT 1 FROM push_subscription WHERE owner_email = ? LIMIT 1")) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        } catch (Exception e) { return false; }
    }

    // ── Envío ──────────────────────────────────────────────────

    private record Sub(String endpoint, String p256dh, String auth) {}

    private List<Sub> subscriptions(String email) {
        List<Sub> out = new ArrayList<>();
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT endpoint, p256dh, auth FROM push_subscription WHERE owner_email = ?")) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(new Sub(rs.getString(1), rs.getString(2), rs.getString(3)));
            }
        } catch (Exception e) { log.warn("No se pudieron leer suscripciones push: {}", e.getMessage()); }
        return out;
    }

    private void deleteByEndpoint(String endpoint) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM push_subscription WHERE endpoint = ?")) {
            ps.setString(1, endpoint); ps.executeUpdate();
        } catch (Exception ignore) { /* limpieza best-effort */ }
    }

    /** Envía una notificación a todos los dispositivos del usuario (best-effort). */
    public void sendToUser(String email, String title, String body, String url) {
        if (!enabled()) return;
        List<Sub> subs = subscriptions(email);
        if (subs.isEmpty()) return;
        String payload = "{\"title\":" + json(title) + ",\"body\":" + json(body)
                + ",\"url\":" + json(url == null ? "" : url) + "}";
        byte[] plaintext = payload.getBytes(StandardCharsets.UTF_8);
        for (Sub s : subs) {
            try {
                byte[] enc = WebPushCrypto.encrypt(plaintext, s.p256dh(), s.auth());
                String authz = WebPushCrypto.vapidAuthorization(s.endpoint(), Env.vapidPublic(),
                        Env.vapidPrivate(), Env.vapidSubject());
                HttpRequest req = HttpRequest.newBuilder(URI.create(s.endpoint()))
                        .timeout(Duration.ofSeconds(15))
                        .header("Authorization", authz)
                        .header("Content-Encoding", "aes128gcm")
                        .header("Content-Type", "application/octet-stream")
                        .header("TTL", "86400")
                        .header("Urgency", "normal")
                        .POST(HttpRequest.BodyPublishers.ofByteArray(enc))
                        .build();
                HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
                int code = res.statusCode();
                if (code == 404 || code == 410) deleteByEndpoint(s.endpoint());   // suscripción caducada
                else if (code >= 400) log.warn("Push {} devolvió {}", host(s.endpoint()), code);
            } catch (Exception e) {
                log.warn("Fallo enviando push a {}: {}", host(s.endpoint()), e.getMessage());
            }
        }
    }

    private static String host(String endpoint) {
        try { return URI.create(endpoint).getHost(); } catch (Exception e) { return "push"; }
    }

    /** Escapa una cadena para incrustarla en el JSON del payload. */
    private static String json(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> { if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch)); else b.append(ch); }
            }
        }
        return b.append('"').toString();
    }
}
