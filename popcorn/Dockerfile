# ---- build the Angular client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime: Node server + ffmpeg ----
FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist/client/browser /app/client/dist/client/browser
ENV NODE_ENV=production PORT=8080 CLIENT_DIST=/app/client/dist/client/browser
EXPOSE 8080
CMD ["node", "src/index.js"]
