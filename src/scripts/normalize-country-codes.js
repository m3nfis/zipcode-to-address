/**
 * Normalize country codes in existing database
 * Updates any non-standard country codes to ISO 3166-1 alpha-2 format
 */

const { Database } = require('duckdb-async');
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, '../../data/postal_codes.duckdb');

// Country code mappings (add more as needed)
const COUNTRY_CODE_MAPPINGS = {
    // Common variations that need normalization
    'UK': 'GB',    // United Kingdom
    'USA': 'US',   // United States
    'CAN': 'CA',   // Canada
    // Add more mappings as needed
};

async function normalizeCountryCodes() {
    console.log('🔄 Starting country code normalization...');
    
    let db;
    try {
        // Connect to database
        db = await Database.create(DB_PATH);
        console.log(`📁 Connected to database: ${DB_PATH}`);

        // Get all unique country codes
        const currentCodes = await db.all(`
            SELECT DISTINCT code FROM countries ORDER BY code
        `);

        console.log(`📊 Found ${currentCodes.length} unique country codes`);

        let normalizedCount = 0;

        // Check each code for normalization needs
        for (const { code } of currentCodes) {
            const normalizedCode = COUNTRY_CODE_MAPPINGS[code];
            
            if (normalizedCode) {
                console.log(`🔄 Normalizing ${code} → ${normalizedCode}`);
                
                try {
                    // Begin transaction-like operations
                    
                    // Check if target code already exists
                    const existingTarget = await db.all(`
                        SELECT id FROM countries WHERE code = $1
                    `, normalizedCode);
                    
                    if (existingTarget.length > 0) {
                        // Target exists, need to merge
                        const targetId = existingTarget[0].id;
                        const sourceResult = await db.all(`
                            SELECT id FROM countries WHERE code = $1
                        `, code);
                        
                        if (sourceResult.length > 0) {
                            const sourceId = sourceResult[0].id;
                            
                            // Update postal codes to use target country ID
                            await db.run(`
                                UPDATE postal_codes 
                                SET country_id = $1 
                                WHERE country_id = $2
                            `, targetId, sourceId);
                            
                            // Remove the old country record
                            await db.run(`
                                DELETE FROM countries WHERE id = $1
                            `, sourceId);
                            
                            console.log(`  ✅ Merged ${code} into existing ${normalizedCode}`);
                            normalizedCount++;
                        }
                    } else {
                        // Target doesn't exist, just update the code
                        await db.run(`
                            UPDATE countries 
                            SET code = $1 
                            WHERE code = $2
                        `, normalizedCode, code);
                        
                        console.log(`  ✅ Updated ${code} to ${normalizedCode}`);
                        normalizedCount++;
                    }
                    
                } catch (error) {
                    console.error(`  ❌ Failed to normalize ${code}:`, error.message);
                }
            }
        }

        // Show final statistics
        const finalCodes = await db.all(`
            SELECT DISTINCT code FROM countries ORDER BY code
        `);
        
        console.log('\n📈 Normalization Results:');
        console.log(`  • Codes normalized: ${normalizedCount}`);
        console.log(`  • Final unique codes: ${finalCodes.length}`);
        
        if (finalCodes.length <= 20) {
            console.log(`  • All codes: ${finalCodes.map(c => c.code).join(', ')}`);
        }

        console.log('\n✅ Country code normalization completed successfully!');

    } catch (error) {
        console.error('❌ Normalization failed:', error);
        process.exit(1);
    } finally {
        if (db) {
            await db.close();
        }
    }
}

// Run if called directly
if (require.main === module) {
    normalizeCountryCodes()
        .then(() => {
            console.log('🎉 Script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Script failed:', error);
            process.exit(1);
        });
}

module.exports = { normalizeCountryCodes }; 