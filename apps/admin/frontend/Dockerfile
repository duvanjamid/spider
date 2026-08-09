# ══════════════════════════════════════════════════════════════
#  Frontend admin (Angular) · build estático servido por nginx.
#  Escucha en $PORT (Render) o 80 (local, por defecto).
# ══════════════════════════════════════════════════════════════

# ── Etapa 1: build ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# package-lock.json es opcional en el primer scaffold.
RUN npm install
COPY . .
RUN npm run build

# ── Etapa 2: runtime (nginx) ──
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
# El application builder de Angular 18 emite a dist/browser.
COPY --from=builder /app/dist/browser /usr/share/nginx/html
ENV PORT=80
EXPOSE 80
# Sustituye el puerto y arranca nginx en foreground.
CMD ["/bin/sh", "-c", "sed -i \"s/__PORT__/${PORT}/\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
