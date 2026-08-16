FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/browser /usr/share/nginx/html
ENV PORT=80
EXPOSE 80
CMD ["/bin/sh", "-c", "sed -i \"s/__PORT__/${PORT}/\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
