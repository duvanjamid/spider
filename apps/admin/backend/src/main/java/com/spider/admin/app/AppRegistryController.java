package com.spider.admin.app;

import com.ligero.Ligero;
import com.spider.admin.config.Env;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Registro de apps del ecosistema Spider (tabla {@code application}).
 *
 * <ul>
 *   <li>{@code GET  /apps}     → listado público (para el launcher).</li>
 *   <li>{@code POST /registry} → auto-registro de una app (servicio-a-servicio,
 *       protegido por {@code REGISTRY_TOKEN}). Cada app lo llama al arrancar.</li>
 * </ul>
 *
 * <p>Así una app nueva se da a conocer al admin SIN tocar su schema: el
 * aislamiento se mantiene (la app llama a la API, no a la BD del admin).
 */
public final class AppRegistryController {

    private final DataSource ds;

    public AppRegistryController(DataSource ds) {
        this.ds = ds;
    }

    public void register(Ligero app) {
        app.get("/apps", ctx -> ctx.json(listApps()));

        app.post("/registry", ctx -> {
            String token = Env.registryToken();
            if (token.isBlank() || !token.equals(ctx.header("X-Registry-Token"))) {
                ctx.status(401).json(Map.of("error", "unauthorized"));
                return;
            }
            String slug = ctx.queryParam("slug");
            String name = ctx.queryParam("name");
            String description = ctx.queryParam("description");
            if (slug == null || slug.isBlank() || name == null || name.isBlank()) {
                ctx.status(400).json(Map.of("error", "slug y name son obligatorios"));
                return;
            }
            upsertApp(slug.trim(), name.trim(), description == null ? "" : description.trim());
            ctx.json(Map.of("status", "registered", "slug", slug));
        });
    }

    /** Upsert idempotente por slug: reactiva y actualiza nombre/descripción. */
    private void upsertApp(String slug, String name, String description) {
        String sql = """
                INSERT INTO application (slug, name, description, is_active)
                VALUES (?, ?, ?, TRUE)
                ON CONFLICT (slug) DO UPDATE
                  SET name = EXCLUDED.name,
                      description = EXCLUDED.description,
                      is_active = TRUE
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, slug);
            ps.setString(2, name);
            ps.setString(3, description);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("Error registrando app", e);
        }
    }

    private List<Map<String, Object>> listApps() {
        String sql = """
                SELECT slug, name, description, is_active
                FROM application
                WHERE is_active = TRUE
                ORDER BY name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                out.add(Map.of(
                        "slug", rs.getString("slug"),
                        "name", rs.getString("name"),
                        "description", rs.getString("description") == null ? "" : rs.getString("description"),
                        "active", rs.getBoolean("is_active")
                ));
            }
        } catch (Exception e) {
            throw new RuntimeException("Error listando apps", e);
        }
        return out;
    }
}
