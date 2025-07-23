#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Script
 * Tests exactly what was requested:
 * - 5 country+zip combinations
 * - 2 country + partial zip tests  
 * - 2 validation GETs (one true, one false)
 * - Performance metrics logging
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const RESULTS_FILE = path.join(__dirname, '../logs/comprehensive-test-results.json');

// Test cases as specified by the user
const TEST_CASES = {
    // 5 country+zip combinations
    country_zip_combos: [
        { country: 'US', postalCode: '90210', expectedPlace: 'Beverly Hills' },
        { country: 'CA', postalCode: 'M5V 3A8', expectedPlace: 'Toronto' },
        { country: 'GB', postalCode: 'SW1A 1AA', expectedPlace: 'Westminster' },
        { country: 'DE', postalCode: '10115', expectedPlace: 'Berlin' },
        { country: 'FR', postalCode: '75001', expectedPlace: 'Paris' }
    ],
    
    // 2 country + partial zip tests
    partial_zip_tests: [
        { country: 'US', partial: '902', expectedResults: '>= 3' },
        { country: 'CA', partial: 'M5V', expectedResults: '>= 5' }
    ],
    
    // 2 validation GETs (one true, one false)
    validation_tests: [
        { country: 'US', postalCode: '90210', expected: true },   // Should be true
        { country: 'US', postalCode: '99999', expected: false }   // Should be false
    ]
};

class ComprehensiveAPITester {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            test_summary: {
                total_tests: 0,
                passed_tests: 0,
                failed_tests: 0
            },
            performance_metrics: {
                country_zip_combos: [],
                partial_zip_tests: [],
                validation_tests: [],
                summary_stats: {}
            },
            detailed_results: [],
            errors: []
        };
    }

    async makeRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = `${BASE_URL}${path}`;
            const startTime = Date.now();
            
            const req = http.request(url, {
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

    async testCountryZipCombos() {
        console.log('🎯 Testing 5 Country+Zip combinations...');
        
        for (const testCase of TEST_CASES.country_zip_combos) {
            try {
                const path = `/lookup?country=${testCase.country}&postalCode=${encodeURIComponent(testCase.postalCode)}`;
                const result = await this.makeRequest(path);
                
                const testResult = {
                    test_type: 'country_zip_combo',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    matchType: result.data?.matchType,
                    resultsCount: result.data?.results?.length || 0,
                    firstResult: result.data?.results?.[0] || null
                };

                this.results.detailed_results.push(testResult);
                this.results.performance_metrics.country_zip_combos.push({
                    country: testCase.country,
                    postalCode: testCase.postalCode,
                    responseTime: result.responseTime,
                    matchType: result.data?.matchType
                });

                if (result.success && result.data?.results?.length > 0) {
                    const place = result.data.results[0].place_name;
                    console.log(`✅ ${testCase.country} ${testCase.postalCode} → ${place} (${result.responseTime}ms)`);
                    this.results.test_summary.passed_tests++;
                } else {
                    console.log(`❌ ${testCase.country} ${testCase.postalCode} → Failed (${result.responseTime}ms)`);
                    this.results.test_summary.failed_tests++;
                }
                
                this.results.test_summary.total_tests++;
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.postalCode} → Error: ${error.error}`);
                this.results.errors.push({ test: 'country_zip_combo', input: testCase, error: error.error });
                this.results.test_summary.total_tests++;
                this.results.test_summary.failed_tests++;
            }
        }
    }

    async testPartialZips() {
        console.log('\n🔍 Testing 2 Country+Partial zip tests...');
        
        for (const testCase of TEST_CASES.partial_zip_tests) {
            try {
                const path = `/suggest?country=${testCase.country}&partial=${encodeURIComponent(testCase.partial)}&limit=10`;
                const result = await this.makeRequest(path);
                
                const testResult = {
                    test_type: 'partial_zip_test',
                    input: testCase,
                    success: result.success,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    suggestionsCount: result.data?.suggestions?.length || 0
                };

                this.results.detailed_results.push(testResult);
                this.results.performance_metrics.partial_zip_tests.push({
                    country: testCase.country,
                    partial: testCase.partial,
                    responseTime: result.responseTime,
                    suggestionsCount: result.data?.suggestions?.length || 0
                });

                if (result.success) {
                    const count = result.data?.suggestions?.length || 0;
                    console.log(`✅ ${testCase.country} ${testCase.partial}* → ${count} suggestions (${result.responseTime}ms)`);
                    this.results.test_summary.passed_tests++;
                } else {
                    console.log(`❌ ${testCase.country} ${testCase.partial}* → Failed (${result.responseTime}ms)`);
                    this.results.test_summary.failed_tests++;
                }
                
                this.results.test_summary.total_tests++;
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.partial}* → Error: ${error.error}`);
                this.results.errors.push({ test: 'partial_zip_test', input: testCase, error: error.error });
                this.results.test_summary.total_tests++;
                this.results.test_summary.failed_tests++;
            }
        }
    }

    async testValidations() {
        console.log('\n✅ Testing 2 validation GETs (one true, one false)...');
        
        for (const testCase of TEST_CASES.validation_tests) {
            try {
                const path = `/validate?country=${testCase.country}&postalCode=${encodeURIComponent(testCase.postalCode)}`;
                const result = await this.makeRequest(path);
                
                // The validate endpoint returns a boolean directly
                const isValid = result.data === true;
                const testPassed = (isValid === testCase.expected);
                
                const testResult = {
                    test_type: 'validation_test',
                    input: testCase,
                    success: result.success && testPassed,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode,
                    validationResult: isValid,
                    expected: testCase.expected
                };

                this.results.detailed_results.push(testResult);
                this.results.performance_metrics.validation_tests.push({
                    country: testCase.country,
                    postalCode: testCase.postalCode,
                    responseTime: result.responseTime,
                    result: isValid,
                    expected: testCase.expected
                });

                if (testPassed) {
                    console.log(`✅ ${testCase.country} ${testCase.postalCode} → ${isValid} (expected ${testCase.expected}) (${result.responseTime}ms)`);
                    this.results.test_summary.passed_tests++;
                } else {
                    console.log(`❌ ${testCase.country} ${testCase.postalCode} → ${isValid} (expected ${testCase.expected}) (${result.responseTime}ms)`);
                    this.results.test_summary.failed_tests++;
                }
                
                this.results.test_summary.total_tests++;
            } catch (error) {
                console.log(`❌ ${testCase.country} ${testCase.postalCode} → Error: ${error.error}`);
                this.results.errors.push({ test: 'validation_test', input: testCase, error: error.error });
                this.results.test_summary.total_tests++;
                this.results.test_summary.failed_tests++;
            }
        }
    }

    calculatePerformanceStats() {
        // Calculate summary statistics for each test type
        const calculateStats = (times) => {
            if (times.length === 0) return null;
            times.sort((a, b) => a - b);
            return {
                min: times[0],
                max: times[times.length - 1],
                avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
                median: times[Math.floor(times.length / 2)],
                count: times.length
            };
        };

        // Extract response times
        const countryZipTimes = this.results.performance_metrics.country_zip_combos.map(t => t.responseTime);
        const partialZipTimes = this.results.performance_metrics.partial_zip_tests.map(t => t.responseTime);
        const validationTimes = this.results.performance_metrics.validation_tests.map(t => t.responseTime);

        this.results.performance_metrics.summary_stats = {
            country_zip_combos: calculateStats(countryZipTimes),
            partial_zip_tests: calculateStats(partialZipTimes),
            validation_tests: calculateStats(validationTimes),
            overall: calculateStats([...countryZipTimes, ...partialZipTimes, ...validationTimes])
        };
    }

    printSummary() {
        console.log('\n📊 COMPREHENSIVE TEST SUMMARY');
        console.log('================================');
        
        const { test_summary, performance_metrics } = this.results;
        
        console.log('📋 Test Results:');
        console.log(`   ✅ Passed: ${test_summary.passed_tests}/${test_summary.total_tests}`);
        console.log(`   ❌ Failed: ${test_summary.failed_tests}/${test_summary.total_tests}`);
        console.log(`   📊 Success Rate: ${Math.round((test_summary.passed_tests / test_summary.total_tests) * 100)}%`);
        
        console.log('\n⚡ Performance Metrics:');
        
        const stats = performance_metrics.summary_stats;
        Object.entries(stats).forEach(([test, data]) => {
            if (data) {
                const testName = test.replace(/_/g, ' ').toUpperCase();
                console.log(`   ${testName}:`);
                console.log(`     • Average: ${data.avg}ms`);
                console.log(`     • Range: ${data.min}ms - ${data.max}ms`);
                console.log(`     • Tests: ${data.count}`);
            }
        });

        if (this.results.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered: ${this.results.errors.length}`);
        }

        console.log(`\n📝 Detailed results saved to: ${RESULTS_FILE}`);
    }

    saveResults() {
        try {
            // Ensure logs directory exists
            const logsDir = path.dirname(RESULTS_FILE);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            fs.writeFileSync(RESULTS_FILE, JSON.stringify(this.results, null, 2));
            console.log(`✅ Results saved to ${RESULTS_FILE}`);
        } catch (error) {
            console.log(`❌ Failed to save results: ${error.message}`);
        }
    }

    async runComprehensiveTest() {
        console.log('🚀 Starting Comprehensive End-to-End API Test');
        console.log('==============================================');
        console.log('Testing 5M+ record DuckDB postal code database\n');
        
        // Run all test suites
        await this.testCountryZipCombos();
        await this.testPartialZips(); 
        await this.testValidations();
        
        // Calculate performance statistics
        this.calculatePerformanceStats();
        
        // Print summary
        this.printSummary();
        
        // Save results
        this.saveResults();
        
        return this.results.test_summary.failed_tests === 0;
    }
}

// Main execution
async function main() {
    const tester = new ComprehensiveAPITester();
    
    try {
        const success = await tester.runComprehensiveTest();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Comprehensive End-to-End API Test Script

Usage: node comprehensive-test.js [options]

Environment Variables:
  API_URL    Base URL for the API (default: http://localhost:3000)

Options:
  --help, -h    Show this help message

This script tests exactly what was requested:
  • 5 country+zip combinations
  • 2 country + partial zip tests
  • 2 validation GETs (one true, one false)
  • Comprehensive performance metrics logging
`);
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = ComprehensiveAPITester; 