FROM node:20-alpine

# Install build tools and dependencies for sharp and ffmpeg
RUN apk add --no-cache vips-dev ffmpeg build-base python3 py3-pip g++ make libc-dev

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
