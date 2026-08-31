package com.spider.gastos.session;

import com.ligero.http.Context;
import com.ligero.middleware.Middleware;

import java.util.Map;

/**
 * Exige una sesión válida de la plataforma para toda la API de gastos.
 *
 * <p>Ya no se admiten invitados: sin la cookie {@code spider_session} verificada,
 * la petición se corta con {@code 401} (salvo {@code /health}, que sirve para los
 * health checks del contenedor). El frontend redirige al login del admin al ver
 * un 401.
 */
public final class AuthGuard implements Middleware {

    private final Identity identity;

    public AuthGuard(Identity identity) {
        this.identity = identity;
    }

    @Override
    public void handle(Context ctx, Chain chain) throws Exception {
        if ("/health".equals(ctx.path()) || "OPTIONS".equalsIgnoreCase(ctx.method())) {
            chain.proceed();
            return;
        }
        if (identity.emailFromCookie(ctx.header("Cookie")) == null) {
            ctx.status(401).json(Map.of("error", "unauthorized"));
            return;
        }
        chain.proceed();
    }
}
