# Use official Node.js 20 image
FROM node:20-alpine

# Install system dependencies (required for Sharp & FFmpeg)
RUN apk add --no-cache vips-dev ffmpeg

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install npm dependencies
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
