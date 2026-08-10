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

    /** Crea una categoría para el usuario. Devuelve su id. */
    public long create(String email, String name, String color, String icon) {
        String slug = slugify(name);
        String sql = """
                INSERT INTO category (slug, name, color, icon, owner_email)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (owner_email, slug) DO UPDATE SET name = EXCLUDED.name,
                    color = EXCLUDED.color, icon = EXCLUDED.icon
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, slug);
            ps.setString(2, name.trim());
            ps.setString(3, blank(color) ? "#6c8cff" : color);
            ps.setString(4, blank(icon) ? "pi-wallet" : icon);
            ps.setString(5, email);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error creando categoría", e); }
    }

    /** Actualiza una categoría del usuario (nombre/color/icono). */
    public void update(String email, long id, String name, String color, String icon) {
        String sql = """
                UPDATE category SET name = COALESCE(?, name), color = COALESCE(?, color),
                    icon = COALESCE(?, icon)
                WHERE id = ? AND owner_email = ?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, blank(name) ? null : name.trim());
            ps.setString(2, blank(color) ? null : color);
            ps.setString(3, blank(icon) ? null : icon);
            ps.setLong(4, id);
            ps.setString(5, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error actualizando categoría", e); }
    }

    /** Borra una categoría del usuario (los gastos quedan sin categoría). */
    public void delete(String email, long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM category WHERE id = ? AND owner_email = ?")) {
            ps.setLong(1, id);
            ps.setString(2, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando categoría", e); }
    }

    private static String slugify(String name) {
        String s = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase().trim()
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return s.isBlank() ? "cat-" + System.currentTimeMillis() : s;
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

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
