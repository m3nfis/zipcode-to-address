#!/bin/bash

# Project Status Check Script
# Checks DuckDB database and API server status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Postal Code API - Project Status${NC}"
echo "=================================="

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
echo -e "Node.js Version: ${GREEN}$NODE_VERSION${NC}"

# Check if required Node.js 22+
REQUIRED_VERSION="v22"
if [[ $NODE_VERSION == v22* ]] || [[ $NODE_VERSION == v23* ]] || [[ $NODE_VERSION == v24* ]]; then
    echo -e "Node.js Version: ${GREEN}✅ Compatible${NC}"
else
    echo -e "Node.js Version: ${YELLOW}⚠️  Requires Node.js 22+ (current: $NODE_VERSION)${NC}"
fi

# Check package.json exists
if [ -f "package.json" ]; then
    echo -e "Package.json: ${GREEN}✅ Found${NC}"
else
    echo -e "Package.json: ${RED}❌ Missing${NC}"
fi

# Check DuckDB database
if [ -f "data/postal_codes.duckdb" ]; then
    DB_SIZE=$(du -h data/postal_codes.duckdb 2>/dev/null | cut -f1 | head -1)
    echo -e "DuckDB Database: ${GREEN}✅ Found (${DB_SIZE})${NC}"
    
    # Try to connect to DuckDB and get record count
    if command -v duckdb >/dev/null 2>&1; then
        RECORD_COUNT=$(duckdb data/postal_codes.duckdb "SELECT COUNT(*) FROM postal_codes;" 2>/dev/null || echo "unknown")
        COUNTRY_COUNT=$(duckdb data/postal_codes.duckdb "SELECT COUNT(*) FROM countries;" 2>/dev/null || echo "unknown")
        echo -e "  Records: ${GREEN}$RECORD_COUNT${NC}"
        echo -e "  Countries: ${GREEN}$COUNTRY_COUNT${NC}"
    else
        echo -e "  Status: ${YELLOW}⚠️  DuckDB CLI not available for detailed stats${NC}"
    fi
else
    echo -e "DuckDB Database: ${RED}❌ Missing${NC}"
    echo -e "  Run: ${YELLOW}npm run setup && npm run ingest${NC}"
fi

# Check dependencies
if [ -d "node_modules" ]; then
    echo -e "Dependencies: ${GREEN}✅ Installed${NC}"
else
    echo -e "Dependencies: ${RED}❌ Missing${NC}"
    echo -e "  Run: ${YELLOW}npm install${NC}"
fi

# Check if server is running
if curl -s http://localhost:3000/lookup?country=US&postalCode=90210 >/dev/null 2>&1; then
    echo -e "API Server: ${GREEN}✅ Running (port 3000)${NC}"
    
    # Get server stats
    RESPONSE=$(curl -s http://localhost:3000/stats 2>/dev/null || echo '{}')
    if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
        echo -e "API Status: ${GREEN}✅ Healthy${NC}"
    else
        echo -e "API Status: ${YELLOW}⚠️  Limited response${NC}"
    fi
else
    echo -e "API Server: ${RED}❌ Not running${NC}"
    echo -e "  Run: ${YELLOW}npm start${NC}"
fi

# Check logs directory
if [ -d "logs" ]; then
    LOG_COUNT=$(find logs -name "*.log" -type f 2>/dev/null | wc -l)
    echo -e "Logs Directory: ${GREEN}✅ Found ($LOG_COUNT files)${NC}"
else
    echo -e "Logs Directory: ${YELLOW}⚠️  Missing${NC}"
fi

# Check raw data
if [ -d "raw_data" ]; then
    RAW_DATA_SIZE=$(du -sh raw_data 2>/dev/null | cut -f1 | head -1)
    echo -e "Raw Data: ${GREEN}✅ Found (${RAW_DATA_SIZE})${NC}"
else
    echo -e "Raw Data: ${YELLOW}⚠️  Missing${NC}"
fi

echo ""
echo -e "${BLUE}📊 Quick Setup Commands:${NC}"
echo "  npm install           # Install dependencies"
echo "  npm run setup         # Initialize DuckDB database"
echo "  npm run ingest        # Load postal code data"
echo "  npm start             # Start API server"
echo "  npm run status        # Run this status check"

echo ""
echo -e "${BLUE}🔗 Useful Endpoints:${NC}"
echo "  http://localhost:3000/lookup?country=US&postalCode=90210"
echo "  http://localhost:3000/health"
echo "  http://localhost:3000/stats" 