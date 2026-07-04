# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* bun.lock* ./
COPY scripts/ ./scripts/

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy the rest of the application files
COPY . .

# Declare build-time arguments for Vite env injection
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Build the TanStack Start application
RUN npm run build

# Stage 2: Runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy build output from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the server port
EXPOSE 3000

# Start the Node.js production server
CMD ["node", "dist/server/index.mjs"]
