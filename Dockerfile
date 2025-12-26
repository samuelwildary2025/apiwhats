FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Force rebuild on code changes (ARG is passed by EasyPanel)
ARG GIT_SHA=dev
RUN echo "Building commit: $GIT_SHA"

# Copy source and build
COPY . .
RUN npm run db:generate
RUN npm run build

# Production image
FROM node:20-alpine AS runner

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Create sessions directory
RUN mkdir -p sessions

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start server
CMD npx prisma db push --skip-generate && npm start
