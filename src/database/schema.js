const { Database } = require('duckdb-async');
const path = require('path');

class PostalCodeDatabase {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../../data/postal_codes.duckdb');
        this.db = null;
    }

    async connect() {
        try {
            this.db = await Database.create(this.dbPath);
            console.log(`Connected to DuckDB database at ${this.dbPath}`);
            return this.db;
        } catch (error) {
            console.error('Failed to connect to database:', error);
            throw error;
        }
    }

    async createTables() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        try {
            // Countries lookup table (normalized)
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS countries (
                    id TINYINT PRIMARY KEY,
                    code CHAR(2) NOT NULL UNIQUE
                );
            `);

            // Main postal codes table (normalized with country_id foreign key)
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS postal_codes (
                    country_id TINYINT NOT NULL,
                    postal_code VARCHAR(20) NOT NULL,
                    place_name VARCHAR(180),
                    admin_name1 VARCHAR(100),
                    admin_code1 VARCHAR(20),
                    admin_name2 VARCHAR(100),
                    admin_code2 VARCHAR(20),
                    admin_name3 VARCHAR(100),
                    admin_code3 VARCHAR(20),
                    latitude DECIMAL(10,7),
                    longitude DECIMAL(11,7),
                    accuracy TINYINT,
                    FOREIGN KEY (country_id) REFERENCES countries(id)
                );
            `);

            // Data source metadata table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS data_sources (
                    id INTEGER PRIMARY KEY,
                    source_name VARCHAR(50) UNIQUE NOT NULL,
                    last_updated TIMESTAMP,
                    file_size INTEGER,
                    record_count INTEGER,
                    checksum VARCHAR(64),
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Refresh log table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS refresh_log (
                    id INTEGER PRIMARY KEY,
                    operation VARCHAR(50) NOT NULL,
                    source_name VARCHAR(50),
                    status VARCHAR(20) NOT NULL,
                    records_processed INTEGER DEFAULT 0,
                    duration_ms INTEGER,
                    error_message TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                );
            `);

            await this.createIndexes();
            
            console.log('Database tables created successfully');
        } catch (error) {
            console.error('Failed to create tables:', error);
            throw error;
        }
    }

    async createIndexes() {
        try {
            console.log('🔍 Creating optimized indexes for search operations...');

            // Primary search index: country_id + postal_code
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_country_postal 
                ON postal_codes(country_id, postal_code);
            `);

            // Index on countries table for reverse lookups
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_country_code 
                ON countries(code);
            `);

            console.log('✅ Search-optimized indexes created');
            console.log('📊 Index strategy:');
            console.log('  • idx_country_postal: Main search (country_id + postal_code)');
            console.log('  • idx_country_code: Country code lookups');

            console.log('Database indexes created successfully');
        } catch (error) {
            console.error('Failed to create indexes:', error);
            throw error;
        }
    }

    // Prepared statements for common operations (DuckDB style)
    getStatements() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        return {
            // Exact match lookup with JOIN to countries table
            findExact: async (countryCode, postalCode) => {
                return await this.db.all(`
                    SELECT pc.*, c.code as country_code FROM postal_codes pc
                    JOIN countries c ON pc.country_id = c.id
                    WHERE c.code = $1 AND pc.postal_code = $2
                    ORDER BY pc.accuracy DESC
                    LIMIT 10
                `, countryCode, postalCode);
            },

            // Fuzzy postal code search with JOIN
            findFuzzy: async (countryCode, postalCode) => {
                const searchPattern = `%${postalCode}%`;
                return await this.db.all(`
                    SELECT pc.*, c.code as country_code,
                           LENGTH(pc.postal_code) as postal_length,
                           LENGTH($2) as search_length
                    FROM postal_codes pc
                    JOIN countries c ON pc.country_id = c.id
                    WHERE c.code = $1 
                    AND (
                        pc.postal_code LIKE $3
                        OR pc.postal_code LIKE $4
                        OR $2 LIKE pc.postal_code || '%'
                    )
                    ORDER BY 
                        ABS(LENGTH(pc.postal_code) - LENGTH($2)) ASC,
                        pc.accuracy DESC
                    LIMIT 20
                `, countryCode, postalCode, searchPattern, `${postalCode}%`);
            },

            // Place name search with JOIN
            findByPlace: async (countryCode, placeName) => {
                const placePattern = `%${placeName}%`;
                return await this.db.all(`
                    SELECT pc.*, c.code as country_code FROM postal_codes pc
                    JOIN countries c ON pc.country_id = c.id
                    WHERE c.code = $1 
                    AND (
                        pc.place_name LIKE $2
                        OR pc.admin_name1 LIKE $2
                        OR pc.admin_name2 LIKE $2
                    )
                    ORDER BY pc.accuracy DESC
                    LIMIT 15
                `, countryCode, placePattern);
            },

            // Helper to get country ID by code
            getCountryId: async (countryCode) => {
                const result = await this.db.all(`
                    SELECT id FROM countries WHERE code = $1
                `, countryCode);
                return result.length > 0 ? result[0] : null;
            },

            // Count records
            countAll: async () => {
                const result = await this.db.all(`
                    SELECT COUNT(*) as count FROM postal_codes
                `);
                return result[0];
            },

            countBySource: async () => {
                return await this.db.all(`
                    SELECT 'all' as source, COUNT(*) as count 
                    FROM postal_codes
                `);
            }
        };
    }

    async close() {
        if (this.db) {
            await this.db.close();
            console.log('Database connection closed');
        }
    }

    // Database maintenance operations
    async vacuum() {
        if (this.db) {
            await this.db.run('VACUUM');
            console.log('Database vacuumed');
        }
    }

    async analyze() {
        if (this.db) {
            await this.db.run('ANALYZE');
            console.log('Database statistics updated');
        }
    }

    async optimize() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        console.log('🔧 Optimizing database...');
        const startTime = Date.now();

        try {
            // Analyze first to update statistics
            console.log('   📊 Analyzing database...');
            await this.db.run('ANALYZE');
            
            // Then vacuum to reclaim space and reorganize
            console.log('   🧹 Vacuuming database...');
            await this.db.run('VACUUM');
            
            const duration = (Date.now() - startTime) / 1000;
            console.log(`✅ Database optimization completed in ${duration.toFixed(2)}s`);
            
        } catch (error) {
            console.error('❌ Database optimization failed:', error);
            throw error;
        }
    }

    async getStats() {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        const stats = await this.db.all(`
            SELECT 
                (SELECT COUNT(*) FROM postal_codes) as total_records,
                (SELECT COUNT(*) FROM countries) as countries,
                1 as sources,
                (SELECT MAX(started_at) FROM refresh_log) as last_update
        `);

        const sourceStats = await this.db.all(`
            SELECT 'all' as source, COUNT(*) as count 
            FROM postal_codes
        `);

        // Convert BigInt values to Numbers for JSON serialization
        const convertBigInt = (obj) => {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj === 'bigint') return Number(obj);
            if (typeof obj === 'object') {
                const converted = {};
                for (const [key, value] of Object.entries(obj)) {
                    converted[key] = convertBigInt(value);
                }
                return converted;
            }
            return obj;
        };

        return {
            ...convertBigInt(stats[0]),
            by_source: sourceStats.map(convertBigInt)
        };
    }
}

module.exports = PostalCodeDatabase; 