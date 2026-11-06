# ---- build ----
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run ----
FROM node:22-alpine

RUN apk add --no-cache ffmpeg tzdata

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

ENV HOST=0.0.0.0 \
    PORT=5000 \
    TZ=America/Los_Angeles \
    CLIPS_DIR=/clips \
    MEDIA_ROOTS=/data

EXPOSE 5000
CMD ["node", "build/index.js"]
