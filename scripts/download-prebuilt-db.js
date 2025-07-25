#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Downloads a pre-built database file from a URL
 * This is much faster than rebuilding the database on each deployment
 */

const DATABASE_URL = process.env.DATABASE_URL || 'https://github.com/YOUR_USERNAME/zipcode-to-address/releases/download/v1.0.0/postal_codes.duckdb.xz';
const DATABASE_PATH = path.join(__dirname, '../data/postal_codes.duckdb');
const COMPRESSED_PATH = DATABASE_PATH + '.xz';

async function downloadDatabase() {
    console.log('🌐 Downloading pre-built database...');
    console.log(`📍 URL: ${DATABASE_URL}`);
    console.log(`💾 Target: ${DATABASE_PATH}`);
    
    // Ensure data directory exists
    const dataDir = path.dirname(DATABASE_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
        const isCompressed = DATABASE_URL.endsWith('.xz');
        const downloadPath = isCompressed ? COMPRESSED_PATH : DATABASE_PATH;
        const file = fs.createWriteStream(downloadPath);
        
        https.get(DATABASE_URL, (response) => {
            if (response.statusCode === 200) {
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;
                
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r📥 Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB)`);
                });
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log('\n✅ Database download completed!');
                    
                    if (isCompressed) {
                        console.log('🗜️  Decompressing database...');
                        const startTime = Date.now();
                        
                        const xz = spawn('xz', ['-d', '--keep', downloadPath], {
                            stdio: ['inherit', 'inherit', 'inherit']
                        });
                        
                        xz.on('close', (code) => {
                            if (code === 0) {
                                const duration = (Date.now() - startTime) / 1000;
                                console.log(`✅ Decompression completed in ${duration.toFixed(1)}s`);
                                
                                // Clean up compressed file
                                fs.unlink(downloadPath, () => {});
                                
                                // Verify final file size
                                const stats = fs.statSync(DATABASE_PATH);
                                console.log(`📊 Database size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                                resolve();
                            } else {
                                reject(new Error(`Decompression failed with exit code ${code}`));
                            }
                        });
                        
                        xz.on('error', (err) => {
                            reject(new Error(`Decompression error: ${err.message}`));
                        });
                    } else {
                        // Not compressed, verify file size directly
                        const stats = fs.statSync(DATABASE_PATH);
                        console.log(`📊 Database size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                        resolve();
                    }
                });
                
                file.on('error', (err) => {
                    fs.unlink(downloadPath, () => {}); // Clean up on error
                    reject(err);
                });
            } else {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Handle command line usage
if (require.main === module) {
    downloadDatabase()
        .then(() => {
            console.log('🎉 Ready to start server!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Database download failed:', error.message);
            console.log('🔄 Falling back to building database from scratch...');
            process.exit(1);
        });
}

module.exports = { downloadDatabase }; 