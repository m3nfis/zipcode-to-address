# 🚀 Simple Setup Guide

This guide shows you how to get the Postal Code API running in under 5 minutes.

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup database
npm run setup

# 3. Load data (includes ZIP extraction and optimization)
npm run ingest

# 4. Start the API
npm start
```

That's it! Your API is now running on http://localhost:3000

## 🧪 Test It

```bash
# Test the API
curl "http://localhost:3000/lookup?country=US&postalCode=90210"
# → Returns Beverly Hills, California

# Check health
curl http://localhost:3000/health
# → Returns database statistics

# Run comprehensive tests
npm run test:comprehensive
# → Runs 9 tests with performance metrics
```

## 📊 What You Get

- **5,013,405 postal codes** across **121 countries**
- **421MB optimized DuckDB database** (59% smaller than SQLite)
- **~25ms average response time** with full address details
- **Automatic optimization** after data ingestion

## 🔧 Optional Commands

```bash
npm run optimize     # Manual database optimization
npm run health       # Quick health check
npm run stats        # View database statistics
npm run status       # Full project status report
```

## 📁 Data Sources

The system automatically downloads and processes data from:
- **Geonames.org** - Official postal code data for 121+ countries
- **Format**: Tab-separated values in ZIP files
- **Update frequency**: As needed with `npm run ingest`

## 💡 Pro Tips

- **First run**: `npm run ingest` takes ~8 seconds to process 5M+ records
- **Updates**: Re-run `npm run ingest` anytime to refresh data  
- **Optimization**: Happens automatically after ingestion
- **Memory**: Uses ~50MB RAM (vs 150MB+ with SQLite)

## 🆘 Need Help?

- **API not working?** → Run `npm run health`
- **Performance issues?** → Run `npm run optimize` 
- **Want to update data?** → Run `npm run ingest`
- **Full diagnostics?** → Run `npm run status`

**That's all you need to know!** The system is designed to be simple and self-managing. 