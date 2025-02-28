# Stage 1: Build stage
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Stage 2: Production stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy built node modules from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application code
COPY . .

# Set user to non-root for security
USER node

# Command to run the application
CMD ["node", "main.js"]
