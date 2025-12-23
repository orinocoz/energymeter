FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY server ./server
COPY public ./public

# Expose port
EXPOSE 3000

# Run as non-root user
USER node

# Start the server
CMD ["node", "server/index.js"]
