package com.spider.admin.app;

import com.ligero.Ligero;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Registro de apps del ecosistema Spider (tabla {@code application}).
 * El frontend del admin usa este endpoint para pintar el "launcher".
 */
public final class AppRegistryController {

    private final DataSource ds;

    public AppRegistryController(DataSource ds) {
        this.ds = ds;
    }

    public void register(Ligero app) {
        app.get("/apps", ctx -> ctx.json(listApps()));
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
