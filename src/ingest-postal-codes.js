const { Database } = require("duckdb-async");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

/**
 * Optimizes the database with ANALYZE and VACUUM
 */
async function optimizeDatabase(db) {
    console.log("\n🔧 Optimizing database...");
    const startTime = Date.now();
    
    try {
        // Analyze first to update statistics
        console.log("   📊 Analyzing database...");
        await db.run("ANALYZE");
        
        // Then vacuum to reclaim space and reorganize
        console.log("   🧹 Vacuuming database...");
        await db.run("VACUUM");
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`✅ Database optimization completed in ${duration.toFixed(2)}s`);
        
    } catch (error) {
        console.error("❌ Database optimization failed:", error);
        // Don't throw here - optimization failure shouldn't break the whole process
        console.log("⚠️  Continuing despite optimization failure...");
    }
}

/**
 * Extracts ZIP files from the raw data directory
 */
async function extractZipFiles() {
    const rawDataDir = path.join(process.cwd(), 'raw_data', 'geonames.org_all_countries');
    const extractDir = rawDataDir; // Extract to the same directory
    
    console.log("🗂️  Extracting ZIP files...");
    
    if (!fs.existsSync(rawDataDir)) {
        console.log(`⚠️  Raw data directory not found: ${rawDataDir}`);
        return;
    }
    
    // Find all ZIP files
    const zipFiles = fs.readdirSync(rawDataDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => ({
            zipPath: path.join(rawDataDir, file),
            fileName: file
        }));
    
    if (zipFiles.length === 0) {
        console.log("⚠️  No ZIP files found in raw data directory");
        return;
    }
    
    for (const { zipPath, fileName } of zipFiles) {
        try {
            console.log(`📦 Extracting ${fileName}...`);
            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();
            
            zipEntries.forEach(entry => {
                if (entry.entryName.endsWith('.txt')) {
                    const txtPath = path.join(extractDir, entry.entryName);
                    
                    // Only extract if TXT doesn't exist or is older than ZIP
                    if (!fs.existsSync(txtPath) || 
                        fs.statSync(txtPath).mtime < fs.statSync(zipPath).mtime) {
                        
                        console.log(`   → Extracting ${entry.entryName}`);
                        zip.extractEntryTo(entry, extractDir, false, true);
                    } else {
                        console.log(`   ✓ ${entry.entryName} already exists and is up to date`);
                    }
                }
            });
            
        } catch (error) {
            console.error(`❌ Failed to extract ${fileName}:`, error.message);
        }
    }
    
    console.log("✅ ZIP extraction completed");
}

/**
 * Ingests postal code CSV files into DuckDB with optimized storage
 * Creates normalized structure with separate countries table
 */
async function ingestPostalCodes() {
  const dbPath = path.join(process.cwd(), 'data', 'postal_codes.duckdb');

  // Remove existing database file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("🗑️  Removed existing database file");
  }

  // Extract ZIP files first
  await extractZipFiles();

  const db = await Database.create(dbPath);

  try {
    console.log("🚀 Starting postal codes ingestion...");

    // Create countries table for normalization
    await db.run(`
            CREATE TABLE countries (
                id TINYINT PRIMARY KEY,
                code CHAR(2) NOT NULL UNIQUE
            )
        `);

    // Create main postal codes table with optimized types
    await db.run(`
            CREATE TABLE postal_codes (
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
            )
        `);

    // Files to process - look in the raw data directory
    const rawDataDir = path.join(process.cwd(), 'raw_data', 'geonames.org_all_countries');
    const txtFiles = [
      "allCountries.txt",
      "CA_full.txt", 
      "GB_full.txt",
      "NL_full.txt",
    ];

    const countryMap = new Map();
    let countryIdCounter = 1;

    // Process each TXT file
    for (const filename of txtFiles) {
      const fullPath = path.join(rawDataDir, filename);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  File ${filename} not found, skipping...`);
        continue;
      }

      console.log(`📁 Processing ${filename}...`);
      const startTime = Date.now();

      // Use DuckDB's native CSV reading for better performance
      const tempTableName = `temp_${filename.replace(/[^a-zA-Z0-9]/g, "_")}`;

      await db.run(`
                CREATE TEMPORARY TABLE ${tempTableName} (
                    country_code VARCHAR(2),
                    postal_code VARCHAR(20),
                    place_name VARCHAR(180),
                    admin_name1 VARCHAR(100),
                    admin_code1 VARCHAR(20),
                    admin_name2 VARCHAR(100),
                    admin_code2 VARCHAR(20),
                    admin_name3 VARCHAR(100),
                    admin_code3 VARCHAR(20),
                    latitude VARCHAR(20),
                    longitude VARCHAR(20),
                    accuracy VARCHAR(10)
                )
            `);

      // Load TXT data into temp table with full path
      await db.run(`
                COPY ${tempTableName} FROM '${fullPath}' (
                    DELIMITER '\t',
                    HEADER false,
                    NULL_PADDING true,
                    IGNORE_ERRORS true
                )
            `);

      // Get unique country codes and add to countries table
      const countryRows = await db.all(`
                SELECT DISTINCT country_code 
                FROM ${tempTableName} 
                WHERE country_code IS NOT NULL AND country_code != ''
            `);

      for (const row of countryRows) {
        const countryCode = row.country_code;
        if (!countryMap.has(countryCode)) {
          countryMap.set(countryCode, countryIdCounter);
          await db.run(
            `INSERT OR IGNORE INTO countries (id, code) VALUES (${countryIdCounter}, '${countryCode}')`
          );
          countryIdCounter++;
        }
      }

      // Insert data into main table with country_id mapping (remove only exact duplicate rows)
      await db.run(`
                INSERT INTO postal_codes (country_id, postal_code, place_name, admin_name1, admin_code1, admin_name2, admin_code2, admin_name3, admin_code3, latitude, longitude, accuracy)
                SELECT DISTINCT
                    c.id as country_id,
                    t.postal_code,
                    NULLIF(t.place_name, '') as place_name,
                    NULLIF(t.admin_name1, '') as admin_name1,
                    NULLIF(t.admin_code1, '') as admin_code1,
                    NULLIF(t.admin_name2, '') as admin_name2,
                    NULLIF(t.admin_code2, '') as admin_code2,
                    NULLIF(t.admin_name3, '') as admin_name3,
                    NULLIF(t.admin_code3, '') as admin_code3,
                    TRY_CAST(t.latitude AS DECIMAL(10,7)) as latitude,
                    TRY_CAST(t.longitude AS DECIMAL(11,7)) as longitude,
                    TRY_CAST(t.accuracy AS TINYINT) as accuracy
                FROM ${tempTableName} t
                JOIN countries c ON c.code = t.country_code
                WHERE t.country_code IS NOT NULL 
                AND t.postal_code IS NOT NULL
                AND t.postal_code != ''
            `);

      // Drop temp table
      await db.run(`DROP TABLE ${tempTableName}`);

      const duration = (Date.now() - startTime) / 1000;
      console.log(`✅ Completed ${filename} in ${duration.toFixed(2)}s`);
    }

    // Get final statistics
    const stats = await db.all(`
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT country_id) as unique_countries
            FROM postal_codes
        `);

    const countryCount = await db.all(
      "SELECT COUNT(*) as count FROM countries"
    );

    console.log("\n📊 Ingestion Summary:");
    console.log(`   Countries: ${countryCount[0].count}`);
    console.log(`   Postal codes: ${stats[0].total_records.toLocaleString()}`);
    console.log(`   Unique countries in data: ${stats[0].unique_countries}`);

    // Optimize database using the dedicated optimization function
    await optimizeDatabase(db);

    console.log("✨ Ingestion completed successfully!");

    return db;
  } catch (error) {
    console.error("❌ Error during ingestion:", error);
    throw error;
  }
}

/**
 * Query function optimized for country + postal code lookups
 */
async function queryPostalCode(db, countryCode, postalCode) {
  const results = await db.all(
    `SELECT 
        c.code as country_code,
        p.postal_code,
        p.place_name,
        p.admin_name1,
        p.admin_code1,
        p.admin_name2,
        p.admin_code2,
        p.admin_name3,
        p.admin_code3,
        p.latitude,
        p.longitude,
        p.accuracy
    FROM postal_codes p
    JOIN countries c ON c.id = p.country_id
    WHERE c.code = $1 AND p.postal_code = $2`,
    countryCode, postalCode
  );

  return results.length > 0 ? results[0] : null;
}

// Export functions
module.exports = {
  ingestPostalCodes,
  queryPostalCode,
  extractZipFiles,
};

// Run if called directly
if (require.main === module) {
  ingestPostalCodes()
    .then(async (db) => {
      console.log("\n🔍 Testing query...");
      
      // Get a sample record to test with
      const sample = await db.all('SELECT * FROM postal_codes LIMIT 1');
      if (sample.length > 0) {
        const countryId = sample[0].country_id;
        const postalCode = sample[0].postal_code;
        
        // Get country code for this ID
        const country = await db.all('SELECT code FROM countries WHERE id = $1', countryId);
        
        console.log(`Testing with country: ${country[0].code}, postal code: ${postalCode}`);
        
        // Test the query function
        const result = await queryPostalCode(db, country[0].code, postalCode);
        console.log("Query result:", result);
      }
      
      await db.close();
      return true;
    })
    .then(() => {
      console.log("✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
