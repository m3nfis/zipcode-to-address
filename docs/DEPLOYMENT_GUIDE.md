# 🚀 Deployment Guide

This guide covers deploying the Postal Code Lookup API to various environments. The DuckDB-based implementation is much simpler to deploy than the previous SQLite version.

## 📋 Table of Contents

- [Quick Start (Docker)](#quick-start-docker)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Performance Tuning](#performance-tuning)
- [Monitoring & Maintenance](#monitoring--maintenance)

## 🐳 Quick Start (Docker)

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- 1GB+ available disk space

### Deploy with Docker Compose

```bash
# Clone the repository
git clone <your-repo-url>
cd zipcode-to-address

# Build and start the services
docker-compose up -d

# The API will be available at http://localhost:3000
```

## 🔧 Production Deployment

### System Requirements
- **OS**: Linux, macOS, or Windows
- **Node.js**: 22.0.0 or higher
- **Memory**: 1GB+ RAM recommended
- **Storage**: 1GB+ free space
- **CPU**: 1+ cores

### Installation Steps

```bash
# Install Node.js 22+
curl -fsSL https://fnm.vercel.app/install | bash
fnm use 22

# Clone and setup
git clone <your-repo-url>
cd zipcode-to-address
npm install

# Initialize database (includes data refresh)
npm run setup

# Start the server
npm start
```

### Manual Database Setup

If you need to manually setup or refresh the database:

```bash
# Setup fresh database
npm run setup

# Or refresh data only
npm run refresh

# Check database status
npm run status
```

## ⚙️ Environment Configuration

### Basic Configuration

Create a `.env` file:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DB_PATH=./data/postal_codes.duckdb

# API Configuration
MAX_RESULTS=50
DEFAULT_LIMIT=20

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/api.log
```

### Advanced Configuration

```bash
# Performance Tuning
DUCKDB_MEMORY_LIMIT=1GB
DUCKDB_THREADS=4

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Health Checks
HEALTH_CHECK_INTERVAL=30000
```

## 🚀 Performance Tuning

### DuckDB Optimization

The DuckDB implementation is already highly optimized:

- **Vectorized Execution**: Automatic SIMD optimization
- **Compression**: Built-in columnar compression
- **Memory Management**: Efficient memory usage
- **Parallel Processing**: Multi-threaded query execution

### System-Level Optimizations

```bash
# For high-traffic deployments, increase Node.js memory
NODE_OPTIONS="--max-old-space-size=2048" npm start

# For better performance on multi-core systems
DUCKDB_THREADS=8 npm start
```

### Container Optimization

```dockerfile
# Use multi-stage build for smaller images
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 3000
CMD ["dumb-init", "node", "src/server.js"]
```

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# Check API health
curl http://localhost:3000/health

# Check database status
curl http://localhost:3000/status
```

### Performance Monitoring

```bash
# View real-time logs
tail -f logs/api.log

# Monitor memory usage
htop

# Check disk usage
df -h
```

### Regular Maintenance

```bash
# Monthly data refresh (recommended)
npm run refresh

# Weekly status check
npm run status

# Database optimization (if needed)
# DuckDB automatically optimizes, but you can force:
npm run vacuum
```

## 🔧 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   lsof -i :3000
   
   # Use different port
   PORT=3001 npm start
   ```

2. **Memory Issues During Data Refresh**
   ```bash
   # Increase Node.js memory limit
   NODE_OPTIONS="--max-old-space-size=4096" npm run refresh
   ```

3. **Database Corruption (rare)**
   ```bash
   # Re-setup database
   rm -f data/postal_codes.duckdb*
   npm run setup
   ```

### Docker Issues

```bash
# View container logs
docker-compose logs postal-api

# Enter container for debugging
docker-compose exec postal-api sh

# Rebuild if needed
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Performance Issues

```bash
# Check database file size
ls -lh data/postal_codes.duckdb

# Monitor query performance
curl -w "@curl-format.txt" http://localhost:3000/api/postal-codes/US/90210

# Enable debug logging
LOG_LEVEL=debug npm start
```

## 📚 Additional Resources

- **[Main README](../README.md)** - Project overview and setup
- **[API Documentation](../README.md#api-endpoints)** - Endpoint reference
- **[Simple Setup Guide](SIMPLE_SETUP.md)** - Quick start in under 5 minutes
- **[Modernization Guide](MODERNIZATION_GUIDE.md)** - Node.js 22+ features

---

**🎯 Ready for Production!** Your postal code API is now optimized with DuckDB's high-performance analytics engine. 