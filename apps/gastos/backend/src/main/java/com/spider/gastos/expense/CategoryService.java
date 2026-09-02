package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

    /**
     * Lista las categorías del usuario. Ya NO auto-siembra: el usuario elige
     * sus categorías en el onboarding (ver {@link #templates()} y
     * {@link #adopt}). Los usuarios previos a V4 ya tienen las suyas.
     */
    public List<Map<String, Object>> ensureAndList(String email) {
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

    /**
     * Categorías de miembros del hogar que están compartidas conmigo (solo lectura).
     * Cada una trae su dueño; el usuario no puede editarlas (no son suyas).
     */
    public List<Map<String, Object>> sharedInList(String email) {
        String sql = """
                SELECT c.id, c.slug, c.name, c.color, c.icon, c.owner_email AS owner
                FROM category c
                WHERE c.owner_email IN (
                        SELECT CASE WHEN requester_email = ? THEN addressee_email ELSE requester_email END
                        FROM connection WHERE status = 'accepted' AND (requester_email = ? OR addressee_email = ?))
                  AND EXISTS (SELECT 1 FROM category_share cs WHERE cs.slug = c.slug
                              AND ( (cs.owner_email = c.owner_email AND cs.shared_with = ?)
                                 OR (cs.owner_email = ? AND cs.shared_with = c.owner_email) ))
                ORDER BY c.name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 1; i <= 5; i++) ps.setString(i, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("slug", rs.getString("slug"));
                    m.put("name", rs.getString("name"));
                    m.put("color", rs.getString("color"));
                    m.put("icon", rs.getString("icon"));
                    m.put("owner", rs.getString("owner"));
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando categorías compartidas", e); }
        return out;
    }

    /** Set base de categorías (plantillas, owner_email IS NULL) para elegir en el onboarding. */
    public List<Map<String, Object>> templates() {
        String sql = "SELECT slug, name, color, icon FROM category WHERE owner_email IS NULL ORDER BY name";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                out.add(Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                        "color", rs.getString("color"), "icon", rs.getString("icon")));
            }
        } catch (Exception e) { throw new RuntimeException("Error listando plantillas", e); }
        return out;
    }

    /** ¿El usuario ya completó el onboarding (o es previo a V4 con categorías/gastos)? */
    public boolean isOnboarded(String email) {
        String sql = """
                SELECT EXISTS(SELECT 1 FROM user_setup WHERE owner_email = ?)
                    OR EXISTS(SELECT 1 FROM category   WHERE owner_email = ?)
                    OR EXISTS(SELECT 1 FROM expense    WHERE owner_email = ?)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, email); ps.setString(3, email);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() && rs.getBoolean(1); }
        } catch (Exception e) { throw new RuntimeException("Error consultando onboarding", e); }
    }

    /** Marca el onboarding como completado (idempotente). */
    public void markOnboarded(String email) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO user_setup (owner_email) VALUES (?) ON CONFLICT (owner_email) DO NOTHING")) {
            ps.setString(1, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error marcando onboarding", e); }
    }

    /**
     * Adopta para el usuario las plantillas indicadas por slug y marca el
     * onboarding como completado. Devuelve cuántas categorías tiene tras esto.
     */
    public int adopt(String email, List<String> slugs) {
        String copyOne = """
                INSERT INTO category (slug, name, color, icon, owner_email)
                SELECT slug, name, color, icon, ?
                FROM category WHERE owner_email IS NULL AND slug = ?
                ON CONFLICT (owner_email, slug) DO NOTHING
                """;
        try (Connection c = ds.getConnection()) {
            if (slugs != null) {
                try (PreparedStatement ps = c.prepareStatement(copyOne)) {
                    for (String slug : slugs) {
                        if (slug == null || slug.isBlank()) continue;
                        ps.setString(1, email);
                        ps.setString(2, slug.trim());
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error adoptando categorías", e); }
        markOnboarded(email);
        return ensureAndList(email).size();
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
            ps.setString(4, blank(icon) ? "fa-solid fa-wallet" : icon);
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

    /** Devuelve [slug, name] de una categoría del usuario (por id o slug); null si no existe. */
    public String[] slugAndName(String email, Long id, String slug) {
        String sql = "SELECT slug, name FROM category WHERE owner_email = ? AND (id = ? OR slug = ?) LIMIT 1";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setObject(2, id);
            ps.setString(3, slug);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new String[]{ rs.getString("slug"), rs.getString("name") } : null;
            }
        } catch (Exception e) { throw new RuntimeException("Error resolviendo categoría", e); }
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
