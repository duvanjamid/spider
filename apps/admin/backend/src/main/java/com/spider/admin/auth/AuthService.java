package com.spider.admin.auth;

import com.spider.admin.db.DbConfig;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Map;

/**
 * Lógica de autenticación y sesión.
 *
 * <p>Contiene el "cascarón" del flujo OAuth de Google con puntos de
 * extensión claros (TODO). La identidad se persiste en {@code app_user}
 * y la sesión se representa como un JWT firmado con {@code AUTH_JWT_SECRET}.
 *
 * <p>Diseño: este servicio NO conoce Ligero (separación de capas). Recibe
 * datos crudos (code, cookies) y devuelve modelos de dominio.
 */
public class AuthService {

    /** Sesión emitida tras un login correcto. */
    public record Session(String token, long userId, String email) {}

    private final DataSource ds;
    private final String jwtSecret;

    public AuthService(DataSource ds, String jwtSecret) {
        this.ds = ds;
        this.jwtSecret = jwtSecret;
    }

    /**
     * Canjea el authorization code por tokens, valida el id_token de Google
     * y hace upsert del usuario. Devuelve la sesión.
     *
     * TODO(auth): implementar el POST a https://oauth2.googleapis.com/token,
     * verificar la firma del id_token con las JWKS de Google
     * (https://www.googleapis.com/oauth2/v3/certs) y extraer sub/email/name.
     * Módulo sugerido: `ligero-json` para parsear y una lib JWT (p.ej. nimbus).
     */
    public Session completeLogin(String authorizationCode) {
        // Placeholder verificable end-to-end una vez configuradas las claves.
        throw new UnsupportedOperationException(
                "Configura GOOGLE_CLIENT_ID/SECRET e implementa el canje de tokens en AuthService.completeLogin");
    }

    /** Upsert de usuario por su "sub" de Google. Reusable desde completeLogin. */
    public long upsertUser(String googleSub, String email, String name, String picture) {
        String sql = """
                INSERT INTO app_user (google_sub, email, display_name, picture_url, last_login_at)
                VALUES (?, ?, ?, ?, now())
                ON CONFLICT (google_sub) DO UPDATE
                  SET email = EXCLUDED.email,
                      display_name = EXCLUDED.display_name,
                      picture_url = EXCLUDED.picture_url,
                      last_login_at = now()
                RETURNING id
                """;
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, googleSub);
            ps.setString(2, email);
            ps.setString(3, name);
            ps.setString(4, picture);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (Exception e) {
            throw new RuntimeException("Error en upsert de usuario", e);
        }
    }

    /** Resuelve el usuario a partir de la cookie de sesión. */
    public Map<String, Object> currentUser(String cookieHeader) {
        // TODO(auth): parsear cookie spider_session, verificar JWT con jwtSecret
        // y cargar el usuario desde app_user. Por ahora, no autenticado.
        return null;
    }
}
