FROM node:20-alpine

RUN apk add --no-cache vips-dev ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install --production --force
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
