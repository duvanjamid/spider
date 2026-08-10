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
            String icon = ctx.queryParam("icon");
            String color = ctx.queryParam("color");
            if (slug == null || slug.isBlank() || name == null || name.isBlank()) {
                ctx.status(400).json(Map.of("error", "slug y name son obligatorios"));
                return;
            }
            upsertApp(slug.trim(), name.trim(), description == null ? "" : description.trim(),
                    blank(icon) ? null : icon.trim(), blank(color) ? null : color.trim());
            ctx.json(Map.of("status", "registered", "slug", slug));
        });
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    /**
     * Upsert idempotente por slug: reactiva y actualiza nombre/descripción y,
     * si la app los envía, su branding (icono/color). Si vienen null se
     * conserva el branding existente (COALESCE).
     */
    private void upsertApp(String slug, String name, String description, String icon, String color) {
        String sql = """
                INSERT INTO application (slug, name, description, icon, color, is_active)
                VALUES (?, ?, ?, COALESCE(?, '🧩'), COALESCE(?, '#6c8cff'), TRUE)
                ON CONFLICT (slug) DO UPDATE
                  SET name = EXCLUDED.name,
                      description = EXCLUDED.description,
                      icon = COALESCE(?, application.icon),
                      color = COALESCE(?, application.color),
                      is_active = TRUE
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, slug);
            ps.setString(2, name);
            ps.setString(3, description);
            ps.setString(4, icon);
            ps.setString(5, color);
            ps.setString(6, icon);
            ps.setString(7, color);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("Error registrando app", e);
        }
    }

    private List<Map<String, Object>> listApps() {
        String sql = """
                SELECT slug, name, description, icon, color, is_active
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
                        "icon", rs.getString("icon") == null ? "🧩" : rs.getString("icon"),
                        "color", rs.getString("color") == null ? "#6c8cff" : rs.getString("color"),
                        "active", rs.getBoolean("is_active")
                ));
            }
        } catch (Exception e) {
            throw new RuntimeException("Error listando apps", e);
        }
        return out;
    }
}
