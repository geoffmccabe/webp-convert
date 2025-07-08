FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    vips-dev \
    ffmpeg \
    make \
    g++ \
    python3

# Create app directory
WORKDIR /app

# Install npm packages
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Clean up build dependencies
RUN apk del make g++ python3

EXPOSE 3000
CMD ["node", "index.js"]
