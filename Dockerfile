# Stage 1: Install dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with optimizations
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Runtime image
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY --chown=node:node server ./server
COPY --chown=node:node public/app.js ./public/app.js
COPY --chown=node:node public/defaults.json ./public/defaults.json
COPY --chown=node:node public/favicon.svg ./public/favicon.svg
COPY --chown=node:node public/index.html ./public/index.html
COPY --chown=node:node public/style.css ./public/style.css

# Expose port
EXPOSE 3000

# Run as non-root user
USER node

# Start the server
CMD ["node", "server/index.js"]