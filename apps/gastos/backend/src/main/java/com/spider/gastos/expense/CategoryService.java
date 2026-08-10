package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Categorías POR USUARIO (aisladas). Las filas con {@code owner_email IS NULL}
 * de la V1 son plantillas base; al primer acceso de un usuario se copian a su
 * propia lista, así cada quien tiene sus categorías sin interferir con otros.
 */
public class CategoryService {

    private final DataSource ds;

    public CategoryService(DataSource ds) {
        this.ds = ds;
    }

    /** Garantiza las categorías base del usuario y devuelve su lista. */
    public List<Map<String, Object>> ensureAndList(String email) {
        seedIfEmpty(email);
        String sql = "SELECT id, slug, name, color, icon FROM category WHERE owner_email = ? ORDER BY name";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(Map.of("id", rs.getLong("id"), "slug", rs.getString("slug"),
                            "name", rs.getString("name"), "color", rs.getString("color"),
                            "icon", rs.getString("icon")));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando categorías", e); }
        return out;
    }

    /** Copia las plantillas base a este usuario si aún no tiene categorías. */
    private void seedIfEmpty(String email) {
        String copy = """
                INSERT INTO category (slug, name, color, icon, owner_email)
                SELECT slug, name, color, icon, ?
                FROM category WHERE owner_email IS NULL
                ON CONFLICT (owner_email, slug) DO NOTHING
                """;
        try (Connection c = ds.getConnection()) {
            boolean has;
            try (PreparedStatement q = c.prepareStatement(
                    "SELECT 1 FROM category WHERE owner_email = ? LIMIT 1")) {
                q.setString(1, email);
                try (ResultSet rs = q.executeQuery()) { has = rs.next(); }
            }
            if (!has) {
                try (PreparedStatement ps = c.prepareStatement(copy)) {
                    ps.setString(1, email);
                    ps.executeUpdate();
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error sembrando categorías", e); }
    }

    /** Valida que la categoría pertenezca al usuario; devuelve su id o null. */
    public Long resolveCategoryId(String email, Long categoryId, String slug) {
        String sql = "SELECT id FROM category WHERE owner_email = ? AND (id = ? OR slug = ?) LIMIT 1";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setObject(2, categoryId);
            ps.setString(3, slug);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getLong(1) : null; }
        } catch (Exception e) { throw new RuntimeException("Error resolviendo categoría", e); }
    }
}
