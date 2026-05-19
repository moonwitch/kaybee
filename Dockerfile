FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY public ./public
EXPOSE 8080
CMD ["bun", "src/server/index.ts"]
