FROM node:22.23.3-alpine
WORKDIR /app
COPY package.json ./
RUN test "$(node --version)" = "v22.23.3" && test "$(npm --version)" = "10.9.9" && npm install --omit=dev
COPY . .
EXPOSE 8083
CMD ["npm", "start"]
