## 📚 Documentation Index

Welcome to the Postal Code Lookup API documentation! This high-performance Node.js 22+ API provides fast postal code lookups across 121+ countries with 5M+ records.

### 📋 **Core Documentation**

- **[Main README](../README.md)** - Complete setup, API usage, and project overview
- **[Project Structure](../PROJECT_STRUCTURE.md)** - Detailed architecture and file organization

### 🚀 **Setup & Deployment**

- **[Simple Setup Guide](SIMPLE_SETUP.md)** - Quick start in under 5 minutes
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Production deployment with DuckDB optimization  
- **[Modernization Guide](MODERNIZATION_GUIDE.md)** - Node.js 22+ features and benefits

### 🗄️ **Database Management**

- **Database Optimization**: Automatic after ingest, or run `npm run optimize`
  - ANALYZE: Updates query statistics for optimal performance
  - VACUUM: Reclaims space and reorganizes data
  - Built-in: Always runs after data ingestion processes
  - Manual: `npm run optimize` for standalone optimization

### 📊 **Data Management**

- **Data Sources**: Geonames.org with 5,013,405+ records
- **Coverage**: 121+ countries with full address details
- **Format**: Tab-separated values with automatic ZIP extraction
- **Size**: 421MB DuckDB (59% space savings vs SQLite)

## 🔧 **Quick Commands**

```bash
# Essential commands
npm run setup        # Initialize database
npm run ingest       # Load data + optimize
npm run optimize     # Database optimization only
npm start            # Start API server

# Testing & monitoring
npm run test:comprehensive  # Full API test suite
npm run health             # Check API health
npm run stats              # View database statistics
```

### 📊 **Performance Metrics**

| Operation | DuckDB Implementation | Performance |
|-----------|----------------------|-------------|
| **Setup** | Automatic schema + indexes | ~2 seconds |
| **Ingest** | 5M+ records with optimization | ~8 seconds |
| **Optimization** | ANALYZE + VACUUM | <1 second |
| DuckDB Format | 0.421 GB | **59%** | Built-in vectorized compression |

## 🔗 **External Resources**

- [DuckDB Documentation](https://duckdb.org/docs/)
- [duckdb-async API](https://github.com/duckdb/duckdb-node)
- [Node.js 22 Documentation](https://nodejs.org/api/)

## 💡 **Need Help?**

- Check the specific guide for your task
- Review the main README for general setup
- Open an issue for bugs or feature requests 