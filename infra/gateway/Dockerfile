FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Valores por defecto para local (docker-compose). Render los sobrescribe.
ENV PORT=80 \
    ADMIN_FRONTEND=http://admin-frontend:80 \
    ADMIN_BACKEND=http://admin-backend:8080 \
    GASTOS_FRONTEND=http://gastos-frontend:80 \
    GASTOS_BACKEND=http://gastos-backend:8080
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
