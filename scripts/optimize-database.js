#!/usr/bin/env node

const PostalCodeDatabase = require('../src/database/schema');
const path = require('path');

/**
 * Standalone database optimization script
 * Runs ANALYZE and VACUUM operations on the postal codes database
 */
async function optimizeDatabase() {
    const database = new PostalCodeDatabase();
    
    try {
        console.log('🚀 Starting database optimization...');
        
        await database.connect();
        
        // Use the optimize method from the database class
        await database.optimize();
        
        console.log('✨ Database optimization completed successfully!');
        
    } catch (error) {
        console.error('❌ Database optimization failed:', error);
        process.exit(1);
    } finally {
        await database.close();
    }
}

// Run if called directly
if (require.main === module) {
    optimizeDatabase()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { optimizeDatabase }; 