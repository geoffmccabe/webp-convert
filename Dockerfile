FROM node:20-alpine

RUN apk add --no-cache vips-dev ffmpeg build-base python3 py3-pip g++ make libc-dev

WORKDIR /app
COPY package*.json ./
RUN npm cache clean --force && npm install --verbose
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
