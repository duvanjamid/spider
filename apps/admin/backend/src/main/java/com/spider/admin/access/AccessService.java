package com.spider.admin.access;

import com.spider.admin.config.Env;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Control de acceso a las apps por correo de Google.
 *
 * <p>La identidad la da Google (correo verificado). El permiso por app lo da
 * la tabla {@code access_grant} (concesiones por email) más los super-admins
 * definidos en la variable {@code ADMIN_EMAILS}. El servicio no conoce Ligero.
 */
public class AccessService {

    private final DataSource ds;

    public AccessService(DataSource ds) {
        this.ds = ds;
    }

    /** Un super-admin ve todo y puede conceder accesos. */
    public boolean isAdmin(String email) {
        if (email == null) return false;
        if (Env.adminEmails().contains(email.toLowerCase())) return true;
        return hasRole(email, "admin", "ADMIN");
    }

    /** Apps activas a las que el correo tiene acceso (o todas si es admin). */
    public List<Map<String, Object>> appsForEmail(String email) {
        if (isAdmin(email)) return listAllApps();
        String sql = """
                SELECT a.slug, a.name, a.description, a.icon, a.color
                FROM access_grant g
                JOIN application a ON a.id = g.application_id
                WHERE lower(g.email) = lower(?) AND a.is_active = TRUE
                ORDER BY a.name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(appRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("Error consultando apps del usuario", e);
        }
        return out;
    }

    public List<Map<String, Object>> listAllApps() {
        String sql = "SELECT slug, name, description, icon, color FROM application WHERE is_active = TRUE ORDER BY name";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) out.add(appRow(rs));
        } catch (Exception e) {
            throw new RuntimeException("Error listando apps", e);
        }
        return out;
    }

    /** TODAS las apps (incluidas inactivas) con su estado, para el panel admin. */
    public List<Map<String, Object>> listAppsAdmin() {
        String sql = "SELECT slug, name, description, icon, color, is_active FROM application ORDER BY name";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("slug", rs.getString("slug"));
                m.put("name", rs.getString("name"));
                m.put("description", rs.getString("description") == null ? "" : rs.getString("description"));
                m.put("icon", rs.getString("icon") == null ? "fa-solid fa-cube" : rs.getString("icon"));
                m.put("color", rs.getString("color") == null ? "#6c8cff" : rs.getString("color"));
                m.put("active", rs.getBoolean("is_active"));
                out.add(m);
            }
        } catch (Exception e) { throw new RuntimeException("Error listando apps (admin)", e); }
        return out;
    }

    /** Activa o desactiva una app por slug. */
    public void setAppActive(String slug, boolean active) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE application SET is_active = ? WHERE slug = ?")) {
            ps.setBoolean(1, active);
            ps.setString(2, slug);
            if (ps.executeUpdate() == 0) throw new IllegalArgumentException("App inexistente: " + slug);
        } catch (Exception e) { throw new RuntimeException("Error cambiando estado de app", e); }
    }

    /** Usuarios agregados: correo, nombre, súper-admin, apps y último acceso. */
    public List<Map<String, Object>> listUsers() {
        Map<String, List<String>> appsByEmail = new LinkedHashMap<>();
        String gq = """
                SELECT lower(g.email) AS email, a.slug
                FROM access_grant g JOIN application a ON a.id = g.application_id
                WHERE a.is_active = TRUE ORDER BY 1, 2
                """;
        Map<String, String[]> info = new LinkedHashMap<>(); // email -> [displayName, lastLogin]
        try (Connection c = ds.getConnection()) {
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(gq)) {
                while (rs.next()) {
                    appsByEmail.computeIfAbsent(rs.getString("email"), k -> new ArrayList<>()).add(rs.getString("slug"));
                }
            }
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT lower(email) AS email, display_name, last_login_at FROM app_user")) {
                while (rs.next()) {
                    info.put(rs.getString("email"), new String[]{ rs.getString("display_name"),
                            String.valueOf(rs.getObject("last_login_at")) });
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando usuarios", e); }

        Set<String> supers = Env.adminEmails();
        Set<String> all = new TreeSet<>();
        all.addAll(appsByEmail.keySet());
        all.addAll(info.keySet());
        all.addAll(supers);

        List<Map<String, Object>> out = new ArrayList<>();
        for (String email : all) {
            List<String> apps = appsByEmail.getOrDefault(email, List.of());
            String[] i = info.get(email);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("email", email);
            m.put("displayName", i != null && i[0] != null ? i[0] : "");
            m.put("apps", apps);
            m.put("appCount", apps.size());
            m.put("superAdmin", supers.contains(email));
            m.put("lastLoginAt", i != null && i[1] != null && !"null".equals(i[1]) ? i[1] : null);
            out.add(m);
        }
        return out;
    }

    /** Apps concedidas a un correo (para ver el detalle de un usuario). */
    public List<Map<String, Object>> appsForUser(String email) {
        String sql = """
                SELECT a.slug, a.name, a.icon, a.color, g.role
                FROM access_grant g JOIN application a ON a.id = g.application_id
                WHERE lower(g.email) = lower(?) ORDER BY a.name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                            "icon", rs.getString("icon") == null ? "fa-solid fa-cube" : rs.getString("icon"),
                            "color", rs.getString("color") == null ? "#6c8cff" : rs.getString("color"),
                            "role", rs.getString("role")));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error consultando apps del usuario", e); }
        return out;
    }

    /** Correos con acceso a una app (para ver quién usa una app). */
    public List<Map<String, Object>> usersForApp(String slug) {
        String sql = """
                SELECT lower(g.email) AS email, g.role
                FROM access_grant g JOIN application a ON a.id = g.application_id
                WHERE a.slug = ? ORDER BY 1
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, slug);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(Map.of("email", rs.getString("email"), "role", rs.getString("role")));
            }
        } catch (Exception e) { throw new RuntimeException("Error consultando usuarios de app", e); }
        return out;
    }

    /** Revoca TODOS los accesos de un correo (quitar usuario). */
    public void revokeAll(String email) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM access_grant WHERE lower(email) = lower(?)")) {
            ps.setString(1, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error quitando usuario", e); }
    }

    /** Todas las concesiones (para el panel de admin). */
    public List<Map<String, Object>> listGrants() {
        String sql = """
                SELECT g.email, a.slug, g.role
                FROM access_grant g
                JOIN application a ON a.id = g.application_id
                ORDER BY g.email, a.slug
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                out.add(Map.of("email", rs.getString("email"),
                        "app", rs.getString("slug"), "role", rs.getString("role")));
            }
        } catch (Exception e) {
            throw new RuntimeException("Error listando concesiones", e);
        }
        return out;
    }

    /** Concede (o actualiza) acceso de un correo a una app. */
    public void grant(String email, String appSlug, String role) {
        String sql = """
                INSERT INTO access_grant (email, application_id, role)
                VALUES (?, (SELECT id FROM application WHERE slug = ?), ?)
                ON CONFLICT (email, application_id) DO UPDATE SET role = EXCLUDED.role
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email.toLowerCase());
            ps.setString(2, appSlug);
            ps.setString(3, role == null || role.isBlank() ? "USER" : role);
            if (ps.executeUpdate() == 0) throw new IllegalArgumentException("App inexistente: " + appSlug);
        } catch (Exception e) {
            throw new RuntimeException("Error concediendo acceso", e);
        }
    }

    /** Revoca el acceso de un correo a una app. */
    public void revoke(String email, String appSlug) {
        String sql = """
                DELETE FROM access_grant
                WHERE lower(email) = lower(?)
                  AND application_id = (SELECT id FROM application WHERE slug = ?)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, appSlug);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("Error revocando acceso", e);
        }
    }

    private boolean hasRole(String email, String appSlug, String role) {
        String sql = """
                SELECT 1 FROM access_grant g
                JOIN application a ON a.id = g.application_id
                WHERE lower(g.email) = lower(?) AND a.slug = ? AND g.role = ?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, appSlug);
            ps.setString(3, role);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            throw new RuntimeException("Error verificando rol", e);
        }
    }

    private static Map<String, Object> appRow(ResultSet rs) throws java.sql.SQLException {
        String desc = rs.getString("description");
        String icon = rs.getString("icon");
        String color = rs.getString("color");
        return Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                "description", desc == null ? "" : desc,
                "icon", icon == null ? "fa-solid fa-cube" : icon,
                "color", color == null ? "#6c8cff" : color);
    }
}
