FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache vips-dev ffmpeg

# Create app directory
WORKDIR /app

# Install npm packages
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
