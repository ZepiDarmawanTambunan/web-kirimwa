FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY index.js ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps
RUN mkdir -p /app/auth_info && chown -R node:node /app
USER node
CMD ["node", "index.js"]
