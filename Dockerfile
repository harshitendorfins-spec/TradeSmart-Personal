# Multi-stage production Dockerfile for TradeSmart (Web & Cloud Edition)
# Stage 1: Build React/Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Python 3.11 FastAPI Backend & Static Server
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application backend code
COPY . .

# Copy compiled frontend from Stage 1 into production dist/
COPY --from=frontend-builder /app/dist ./dist

# Default Port
ENV PORT=8000
ENV DB_PATH=personal_trading.db
EXPOSE 8000

# Start Uvicorn Web Server
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
