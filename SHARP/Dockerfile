FROM oven/bun:1

WORKDIR /app

COPY . .

RUN bun install

EXPOSE 5000
EXPOSE 5001

CMD ["bun", "main.js"]