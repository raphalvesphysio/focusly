FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY server ./server
COPY client ./client
COPY legacy ./legacy
COPY cloud ./cloud

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3847

EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3847/health || exit 1

CMD ["node", "server/serve.js"]
