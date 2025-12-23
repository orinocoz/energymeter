FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public

# Expose port
EXPOSE 3000

# Run as non-root user
USER node

# Start the server
CMD ["node", "server/index.js"]
