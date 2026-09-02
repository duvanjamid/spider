package com.spider.alertas.alert;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Matriz de tipos de desastre con su radio de acción (km) y severidad.
 * (Derrumbe en vía = 5 km; Sismo = 50 km, etc.)
 */
public final class Categories {

    public record Cat(String slug, String label, String icon, String color, double radiusKm, int severity, int ttlHours) {}

    private static final Map<String, Cat> MAP = new LinkedHashMap<>();
    static {
        add(new Cat("sismo",       "Sismo / Terremoto",    "fa-house-crack",         "#ef4444", 50, 3, 6));
        add(new Cat("inundacion",  "Inundación",            "fa-water",               "#3b82f6", 12, 3, 12));
        add(new Cat("derrumbe",    "Derrumbe / Deslizamiento","fa-mountain",          "#a16207",  5, 3, 12));
        add(new Cat("incendio",    "Incendio",              "fa-fire",                "#f97316",  5, 3, 6));
        add(new Cat("accidente",   "Accidente",             "fa-car-burst",           "#eab308",  2, 2, 4));
        add(new Cat("bloqueo",     "Bloqueo / Cierre vía",  "fa-road-barrier",        "#f59e0b",  3, 2, 8));
        add(new Cat("bache",       "Bache grave",           "fa-triangle-exclamation","#84cc16",  1, 1, 24));
        add(new Cat("otro",        "Otro peligro",          "fa-circle-exclamation",  "#8b5cf6",  3, 2, 6));
    }
    private static void add(Cat c) { MAP.put(c.slug(), c); }

    public static Cat get(String slug) { return MAP.getOrDefault(slug, MAP.get("otro")); }
    public static List<Cat> all() { return List.copyOf(MAP.values()); }

    private Categories() {}
}
