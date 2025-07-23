#!/usr/bin/env node

const PostalCodeDatabase = require('../database/schema');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(process.cwd(), 'logs', 'setup.log') })
    ]
});

/**
 * Sets up the postal code database with tables and indexes
 */
async function setupDatabase() {
    const database = new PostalCodeDatabase();
    
    try {
        logger.info('🚀 Starting database setup');
        
        // Create required directories
        logger.info('📁 Creating required directories...');
        const dataDir = path.join(process.cwd(), 'data');
        const logsDir = path.join(process.cwd(), 'logs');
        
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info(`   Created: ${dataDir}`);
        }
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            logger.info(`   Created: ${logsDir}`);
        }
        
        // Connect to database and create tables
        logger.info('🗄️  Setting up database...');
        await database.connect();
        await database.createTables();
        await database.createIndexes();
        
        logger.info('   Database tables created');
        logger.info('   Indexes created for optimal performance');
        
        // Verify setup
        logger.info('🔍 Verifying database setup...');
        const stats = await database.getStats();
        logger.info(`   Database initialized with ${stats.total_records} records`);
        
        // Test basic operations
        const testCountry = 'TEST';
        const testPostal = '00000';
        
        // Insert a test country and record
        await database.db.run('INSERT INTO countries (id, code) VALUES (?, ?)', 99, testCountry);
        await database.db.run('INSERT INTO postal_codes (country_id, postal_code, place_name) VALUES (?, ?, ?)', 
            99, testPostal, 'Test Location');
        
        // Verify we can read it back using the statements
        const statements = database.getStatements();
        const testResults = await statements.findExact(testCountry, testPostal);
        if (testResults.length > 0) {
            logger.info('   Database operations verified');
        }
        
        // Clean up test data
        await database.db.run('DELETE FROM postal_codes WHERE country_id = ? AND postal_code = ?', 99, testPostal);
        await database.db.run('DELETE FROM countries WHERE code = ?', testCountry);
        
        // Optimize database after setup
        await database.optimize();
        
        logger.info(' ');
        logger.info('Next steps:');
        logger.info('1. Run "npm run ingest" to populate the database with data');
        logger.info('2. Run "npm start" to start the API server'); 
        logger.info('3. Test the API with: curl "http://localhost:3000/lookup?country=US&postalCode=90210"');
        
        logger.info('✅ Database setup completed successfully');
        
        return true;
        
    } catch (error) {
        logger.error('Failed to setup database:', error);
        logger.error('❌ Database setup failed:', error.message);
        throw error;
    } finally {
        await database.close();
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Postal Code API Database Setup

Usage: node setup-database.js [options]

Options:
  --help, -h     Show this help message

This script:
  • Creates required directories (data/, logs/)
  • Initializes DuckDB database with optimized schema
  • Creates indexes for fast postal code lookups
  • Verifies database functionality

After setup, run:
  npm run ingest     # Load postal code data
  npm start          # Start the API server
`);
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    setupDatabase()
        .then(() => {
            logger.info('Setup completed successfully');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupDatabase }; 