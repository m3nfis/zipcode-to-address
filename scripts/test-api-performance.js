#!/usr/bin/env node

/**
 * Comprehensive API Performance Test Script
 * Tests all endpoints and measures performance metrics
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const OUTPUT_FILE = path.join(__dirname, '../logs/performance-test-results.json');

// Test configurations
const TEST_CASES = {
    exact_matches: [
        { country: 'US', postalCode: '90210', expectedPlace: 'Beverly Hills' },
        { country: 'DE', postalCode: '10115', expectedPlace: 'Berlin' },
        { country: 'GB', postalCode: 'SW1A', expectedPlace: 'Westminster' },
        { country: 'CA', postalCode: 'M5V', expectedPlace: 'Toronto' },
        { country: 'FR', postalCode: '75001', expectedPlace: 'Paris' },
    ],
    fuzzy_matches: [
        { country: 'US', postalCode: '9021', expectedResults: '>= 1' },
        { country: 'CA', postalCode: 'M5V3A8', expectedResults: '>= 5' },
        { country: 'GB', postalCode: 'SW1A1AA', expectedResults: '>= 3' },
        { country: 'DE', postalCode: '1011', expectedResults: '>= 1' },
    ],
    suggestions: [
        { country: 'US', partial: '902', expectedResults: '>= 3' },
        { country: 'CA', partial: 'M5V', expectedResults: '>= 5' },
        { country: 'GB', partial: 'SW1', expectedResults: '>= 3' },
    ],
    batch_requests: [
        {
            searches: [
                { country: 'US', postalCode: '90210' },
                { country: 'CA', postalCode: 'M5V 3A8' },
                { country: 'GB', postalCode: 'SW1A 1AA' }
            ]
        }
    ]
};

class APITester {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            summary: {},
            tests: [],
            errors: []
        };
    }

    async makeRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = `${BASE_URL}${path}`;
            const isHttps = url.startsWith('https');
            const lib = isHttps ? https : http;
            
            const startTime = Date.now();
            
            const req = lib.request(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    try {
                        const parsed = JSON.parse(data);
                        resolve({
                            statusCode: res.statusCode,
                            data: parsed,
                            responseTime,
                            success: res.statusCode >= 200 && res.statusCode < 300
                        });
                    } catch (error) {
                        resolve({
                            statusCode: res.statusCode,
                            data: data,
                            responseTime,
                            success: false,
                            error: 'JSON parse error'
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject({
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    success: false
                });
            });

            if (options.body) {
                req.write(JSON.stringify(options.body));
            }

            req.end();
        });
    }

    async testHealth() {
        console.log('🔍 Testing health endpoint...');
        try {
            const result = await this.makeRequest('/health');
            this.results.tests.push({
                test: 'health_check',
                success: result.success,
                responseTime: result.responseTime,
                statusCode: result.statusCode,
                data: result.data
            });
            
            if (result.success) {
                console.log(`✅ Health check passed (${result.responseTime}ms)`);
                return true;
            } else {
                console.log(`❌ Health check failed: ${result.statusCode}`);
                return false;
            }
        } catch (error) {
            console.log(`❌ Health check error: ${error.error}`);
            this.results.errors.push({ test: 'health_check', error: error.error });
            return false;
        }
    }

    async testStats() {
        console.log('📊 Testing stats endpoint...');
        try {
            const result = await this.makeRequest('/stats');
            this.results.tests.push({
                test: 'stats',
                success: result.success,
                responseTime: result.responseTime,
                statusCode: result.statusCode,
                data: result.data
            });
            
            if (result.success && result.data.stats) {
                const stats = result.data.stats;
                console.log(`✅ Stats retrieved (${result.responseTime}ms)`);
                console.log(`   📈 Total records: ${stats.total_records?.toLocaleString() || 'N/A'}`);
                console.log(`   🌍 Countries: ${stats.countries || 'N/A'}`);
                return stats;
            } else {
                console.log(`❌ Stats failed: ${result.statusCode}`);
                return null;
            }
        } catch (error) {
            console.log(`❌ Stats error: ${error.error}`);
            this.results.errors.push({ test: 'stats', error: error.error });
            return null;
        }
    }

    async testExactMatches() {
        console.log('🎯 Testing exact matches...');
        const times = [];
        
        for (const testCase of TEST_CASES.exact_matches) {
            try {
                const path = `/lookup?country=${testCase.country}&postalCode=${encodeURIComponent(testCase.postalCode)}`;
                const result = await this.makeRequest(path);
                
                times.push(result.responseTime);
                
                const testResult = {
                    test: 'exact_match',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    resultsCount: result.data?.results?.length || 0,
                    matchType: result.data?.matchType
                };
                
                this.results.tests.push(testResult);
                
                if (result.success && result.data?.results?.length > 0) {
                    const match = result.data.results[0];
                    console.log(`✅ ${testCase.country} ${testCase.postalCode} → ${match.place_name} (${result.responseTime}ms)`);
                } else {
                    console.log(`⚠️  ${testCase.country} ${testCase.postalCode} → No results (${result.responseTime}ms)`);
                }
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.postalCode} → Error: ${error.error}`);
                this.results.errors.push({ test: 'exact_match', input: testCase, error: error.error });
            }
        }
        
        return times;
    }

    async testFuzzyMatches() {
        console.log('🔍 Testing fuzzy matches...');
        const times = [];
        
        for (const testCase of TEST_CASES.fuzzy_matches) {
            try {
                const path = `/lookup?country=${testCase.country}&postalCode=${encodeURIComponent(testCase.postalCode)}&fuzzy=true`;
                const result = await this.makeRequest(path);
                
                times.push(result.responseTime);
                
                const testResult = {
                    test: 'fuzzy_match',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    resultsCount: result.data?.results?.length || 0,
                    matchType: result.data?.matchType
                };
                
                this.results.tests.push(testResult);
                
                if (result.success) {
                    const count = result.data?.results?.length || 0;
                    console.log(`✅ ${testCase.country} ${testCase.postalCode} → ${count} results (${result.responseTime}ms)`);
                } else {
                    console.log(`❌ ${testCase.country} ${testCase.postalCode} → Failed (${result.responseTime}ms)`);
                }
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.postalCode} → Error: ${error.error}`);
                this.results.errors.push({ test: 'fuzzy_match', input: testCase, error: error.error });
            }
        }
        
        return times;
    }

    async testSuggestions() {
        console.log('💡 Testing suggestions...');
        const times = [];
        
        for (const testCase of TEST_CASES.suggestions) {
            try {
                const path = `/suggest?country=${testCase.country}&partial=${encodeURIComponent(testCase.partial)}&limit=10`;
                const result = await this.makeRequest(path);
                
                times.push(result.responseTime);
                
                const testResult = {
                    test: 'suggestions',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    suggestionsCount: result.data?.suggestions?.length || 0
                };
                
                this.results.tests.push(testResult);
                
                if (result.success) {
                    const count = result.data?.suggestions?.length || 0;
                    console.log(`✅ ${testCase.country} ${testCase.partial}* → ${count} suggestions (${result.responseTime}ms)`);
                } else {
                    console.log(`❌ ${testCase.country} ${testCase.partial}* → Failed (${result.responseTime}ms)`);
                }
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.partial}* → Error: ${error.error}`);
                this.results.errors.push({ test: 'suggestions', input: testCase, error: error.error });
            }
        }
        
        return times;
    }

    async testBatchRequests() {
        console.log('📦 Testing batch requests...');
        const times = [];
        
        for (const testCase of TEST_CASES.batch_requests) {
            try {
                const result = await this.makeRequest('/lookup/batch', {
                    method: 'POST',
                    body: testCase
                });
                
                times.push(result.responseTime);
                
                const testResult = {
                    test: 'batch_request',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    batchSize: testCase.searches.length,
                    resultsCount: result.data?.results?.length || 0
                };
                
                this.results.tests.push(testResult);
                
                if (result.success) {
                    const count = result.data?.results?.length || 0;
                    console.log(`✅ Batch (${testCase.searches.length} requests) → ${count} results (${result.responseTime}ms)`);
                } else {
                    console.log(`❌ Batch request failed (${result.responseTime}ms)`);
                }
            } catch (error) {
                console.log(`❌ Batch request error: ${error.error}`);
                this.results.errors.push({ test: 'batch_request', input: testCase, error: error.error });
            }
        }
        
        return times;
    }

    calculateStats(times) {
        if (times.length === 0) return null;
        
        times.sort((a, b) => a - b);
        return {
            min: times[0],
            max: times[times.length - 1],
            avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            median: times[Math.floor(times.length / 2)],
            p95: times[Math.floor(times.length * 0.95)],
            count: times.length
        };
    }

    async runAllTests() {
        console.log('🚀 Starting comprehensive API performance tests...\n');
        
        // Test connectivity first
        const healthOk = await this.testHealth();
        if (!healthOk) {
            console.log('❌ Server health check failed. Aborting tests.');
            return false;
        }
        
        console.log('');
        
        // Get database stats
        const stats = await this.testStats();
        console.log('');
        
        // Run performance tests
        const exactTimes = await this.testExactMatches();
        console.log('');
        
        const fuzzyTimes = await this.testFuzzyMatches();
        console.log('');
        
        const suggestionTimes = await this.testSuggestions();
        console.log('');
        
        const batchTimes = await this.testBatchRequests();
        console.log('');
        
        // Calculate summary statistics
        this.results.summary = {
            database_stats: stats,
            performance: {
                exact_matches: this.calculateStats(exactTimes),
                fuzzy_matches: this.calculateStats(fuzzyTimes),
                suggestions: this.calculateStats(suggestionTimes),
                batch_requests: this.calculateStats(batchTimes)
            },
            test_counts: {
                total_tests: this.results.tests.length,
                successful_tests: this.results.tests.filter(t => t.success).length,
                failed_tests: this.results.tests.filter(t => !t.success).length,
                errors: this.results.errors.length
            }
        };
        
        // Print summary
        this.printSummary();
        
        // Save results
        this.saveResults();
        
        return true;
    }

    printSummary() {
        console.log('📊 PERFORMANCE TEST SUMMARY');
        console.log('============================');
        
        const { performance, test_counts, database_stats } = this.results.summary;
        
        if (database_stats) {
            console.log('🗄️  Database Statistics:');
            console.log(`   📈 Total Records: ${database_stats.total_records?.toLocaleString() || 'N/A'}`);
            console.log(`   🌍 Countries: ${database_stats.countries || 'N/A'}`);
            console.log('');
        }
        
        console.log('⚡ Performance Metrics:');
        
        Object.entries(performance).forEach(([test, stats]) => {
            if (stats) {
                const testName = test.replace('_', ' ').toUpperCase();
                console.log(`   ${testName}:`);
                console.log(`     • Average: ${stats.avg}ms`);
                console.log(`     • Median:  ${stats.median}ms`);
                console.log(`     • Min/Max: ${stats.min}ms - ${stats.max}ms`);
                console.log(`     • 95th percentile: ${stats.p95}ms`);
                console.log(`     • Tests: ${stats.count}`);
            }
        });
        
        console.log('');
        console.log('📋 Test Results:');
        console.log(`   ✅ Successful: ${test_counts.successful_tests}/${test_counts.total_tests}`);
        console.log(`   ❌ Failed: ${test_counts.failed_tests}/${test_counts.total_tests}`);
        console.log(`   🚨 Errors: ${test_counts.errors}`);
        
        if (test_counts.failed_tests > 0 || test_counts.errors > 0) {
            console.log('\n⚠️  Issues detected. Check detailed results for more information.');
        }
        
        console.log(`\n📝 Detailed results saved to: ${OUTPUT_FILE}`);
    }

    saveResults() {
        try {
            // Ensure logs directory exists
            const logsDir = path.dirname(OUTPUT_FILE);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(this.results, null, 2));
            console.log(`✅ Results saved to ${OUTPUT_FILE}`);
        } catch (error) {
            console.log(`❌ Failed to save results: ${error.message}`);
        }
    }
}

// Main execution
async function main() {
    const tester = new APITester();
    
    try {
        const success = await tester.runAllTests();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
API Performance Test Script

Usage: node test-api-performance.js [options]

Environment Variables:
  API_URL    Base URL for the API (default: http://localhost:3000)

Options:
  --help, -h    Show this help message

This script tests:
  • Health and stats endpoints
  • Exact postal code matches
  • Fuzzy matching performance
  • Autocomplete suggestions
  • Batch request processing
  • Response time analysis
`);
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = APITester; 