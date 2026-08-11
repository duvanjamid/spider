FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
# Página de carga (se sirve cuando un frontend está dormido/reiniciando).
COPY loading.html /usr/share/nginx/spider/__spider_loading.html
# Respuesta estática del keep-alive (dispara los mirrors que despiertan todo).
RUN printf 'waking spider services\n' > /usr/share/nginx/spider/keepalive.txt
RUN chmod +x /entrypoint.sh
# Valores por defecto para local (docker-compose). Render los sobrescribe.
ENV PORT=80 \
    ADMIN_FRONTEND=http://admin-frontend:80 \
    ADMIN_BACKEND=http://admin-backend:8080 \
    GASTOS_FRONTEND=http://gastos-frontend:80 \
    GASTOS_BACKEND=http://gastos-backend:8080
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
