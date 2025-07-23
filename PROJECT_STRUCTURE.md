# Project Structure

## Overview
Fast postal code lookup API built with **DuckDB** for optimal performance and storage efficiency. Currently serving **5,013,405 postal codes** across **121 countries**.

## Directory Structure

```
zipcode-to-address/
├── 📁 src/                             # Source code
│   ├── 🚀 server.js                    # Express server & API endpoints
│   ├── 📁 database/
│   │   └── schema.js                   # DuckDB schema & connection management
│   ├── 📁 services/
│   │   └── search-service.js           # Search logic & fuzzy matching
│   ├── 📁 processors/
│   │   └── (processors moved to direct ingest)
│   └── 📁 scripts/
│       ├── setup-database.js           # Database initialization
│       ├── normalize-country-codes.js  # Country code standardization
│       └── ingest-postal-codes.js      # DuckDB data ingestion
├── 📁 data/                            # Database files
│   └── postal_codes.duckdb             # Main DuckDB database (421MB)
├── 📁 raw_data/                        # Source data files
│   └── 📁 geonames.org_all_countries/  # GeoNames.org ZIP files
├── 📁 scripts/                        # Utility scripts
│   ├── optimize-database.js            # Database optimization
│   ├── comprehensive-test.js           # API test suite
│   ├── test-api-performance.js         # Performance benchmarking
│   └── project-status.sh               # System status check
├── 📁 docs/                           # Documentation
│   ├── README.md                       # Documentation index
│   ├── SIMPLE_SETUP.md                # Quick start guide
│   ├── DEPLOYMENT_GUIDE.md            # Deployment instructions
│   └── MODERNIZATION_GUIDE.md         # Node.js 22+ upgrade guide
├── 📁 logs/                           # Application logs
├── 🐳 docker-compose.yml              # Docker deployment
├── 🐳 Dockerfile                      # Container definition
└── 📦 package.json                    # Dependencies & scripts
```

## Key Components

### Core API (`src/server.js`)
- **Express.js** server with rate limiting
- RESTful endpoints for postal code lookup
- Health checks and monitoring
- Graceful shutdown handling

### Database Layer (`src/database/schema.js`)
- **DuckDB** connection management
- Optimized schema with normalized countries table
- Async query methods for high performance
- Built-in backup and maintenance operations

### Search Service (`src/services/search-service.js`)
- Exact and fuzzy postal code matching
- Multi-strategy search algorithms
- Similarity scoring and ranking
- Batch processing capabilities

### Data Processing (`src/ingest-postal-codes.js`)
- **Direct ZIP file ingestion** with automatic extraction
- **CSV parsing** with error handling
- **Data normalization** and validation
- **Automatic optimization** after ingestion

## Database Schema

### Countries Table (Normalized)
```sql
CREATE TABLE countries (
    id TINYINT PRIMARY KEY,
    code CHAR(2) NOT NULL UNIQUE  -- ISO 3166-1 alpha-2
);
```

### Postal Codes Table (Optimized)
```sql
CREATE TABLE postal_codes (
    country_id TINYINT NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    place_name VARCHAR(180),
    admin_name1 VARCHAR(100),    -- State/Province
    admin_code1 VARCHAR(20),
    admin_name2 VARCHAR(100),    -- County/Region
    admin_code2 VARCHAR(20),
    admin_name3 VARCHAR(100),    -- Community/District
    admin_code3 VARCHAR(20),
    latitude DECIMAL(10,7),
    longitude DECIMAL(11,7),
    accuracy TINYINT,
    FOREIGN KEY (country_id) REFERENCES countries(id)
);
```

### Indexes (Performance Optimized)
```sql
-- Primary search index
CREATE INDEX idx_country_postal ON postal_codes(country_id, postal_code);

-- Country lookup index
CREATE INDEX idx_country_code ON countries(code);
```

## Performance Characteristics

- **Database Size**: 421MB (59% smaller than equivalent SQLite)
- **Records**: 5,013,405 postal codes across 121 countries
- **Search Speed**: 10-40ms typical response times
- **Memory Usage**: ~50MB base + query processing
- **Test Success**: 100% success rate (9/9 comprehensive tests)

## Data Sources

### GeoNames.org (Primary)
- **Files**: ZIP files with automatic extraction
  - `allCountries.zip` (global coverage)
  - `CA_full.csv.zip` (Canada detailed)
  - `GB_full.csv.zip` (United Kingdom detailed) 
  - `NL_full.csv.zip` (Netherlands detailed)
- **Records**: 5,013,405 postal codes
- **Countries**: 121 countries
- **Format**: Tab-separated values in ZIP files

## NPM Scripts

```bash
# Database Operations
npm run setup      # Initialize DuckDB database
npm run ingest     # Load postal code data (includes ZIP extraction + optimization)
npm run optimize   # Manual database optimization

# Server Operations
npm start          # Start production server

# Testing & Monitoring
npm run test:comprehensive  # Run 9-test comprehensive suite
npm run health     # Quick health check
npm run stats      # Database statistics
npm run status     # Full system status

# Maintenance
npm run clean      # Clean temp files
```

## API Endpoints

- `GET /lookup` - Postal code search (exact & fuzzy)
- `POST /lookup/batch` - Batch processing (multiple lookups)
- `GET /suggest` - Autocomplete suggestions
- `GET /validate` - Quick postal code validation
- `GET /health` - Health check with database stats
- `GET /stats` - Detailed database statistics

## Performance Proven

Based on comprehensive testing with real production data:

| Test Type | Average Time | Success Rate |
|-----------|-------------|-------------|
| **Exact Lookups** | 24ms | 100% (5/5) |
| **Partial Suggestions** | 32ms | 100% (2/2) |
| **Validation** | 90ms | 100% (2/2) |
| **Overall** | 40ms | 100% (9/9) |

**Example Results:**
- US 90210 → Beverly Hills (32ms)
- CA M5V 3A8 → Toronto (25ms)
- GB SW1A 1AA → St James's (28ms) 