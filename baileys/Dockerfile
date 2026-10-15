FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json index.js .
RUN npm install --no-audit --no-fund --legacy-peer-deps
CMD ["node", "index.js"]
