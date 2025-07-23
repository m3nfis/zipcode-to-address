const levenshtein = require('fast-levenshtein');

class SearchService {
    constructor(database, logger) {
        this.database = database;
        this.logger = logger;
        this.statements = database.getStatements();
        this.maxFuzzyDistance = 3; // Maximum Levenshtein distance for fuzzy matching
        this.maxResults = 20; // Maximum results to return
    }

    async searchPostalCode(country, postalCode, fuzzy = true) {
        const startTime = Date.now();
        
        try {
            // Validate input
            if (!country || !postalCode) {
                return {
                    success: false,
                    error: 'Country and postal code are required',
                    results: []
                };
            }

            // Normalize inputs
            const normalizedCountry = country.trim().toUpperCase();
            const normalizedPostalCode = postalCode.trim();

            this.logger.info(`Searching for ${normalizedCountry}:${normalizedPostalCode}, fuzzy=${fuzzy}`);

            // Step 1: Try exact match first
            const exactResults = await this.findExactMatches(normalizedCountry, normalizedPostalCode);
            
            if (exactResults.length > 0) {
                const result = {
                    success: true,
                    matchType: 'exact',
                    query: { country: normalizedCountry, postalCode: normalizedPostalCode },
                    results: this.formatResults(exactResults),
                    searchTime: Date.now() - startTime
                };

                this.logger.info(`Found ${exactResults.length} exact matches in ${result.searchTime}ms`);
                return result;
            }

            // Step 2: If no exact matches and fuzzy is enabled, try fuzzy matching
            if (fuzzy) {
                const fuzzyResults = await this.findFuzzyMatches(normalizedCountry, normalizedPostalCode);
                
                if (fuzzyResults.length > 0) {
                    const result = {
                        success: true,
                        matchType: 'fuzzy',
                        query: { country: normalizedCountry, postalCode: normalizedPostalCode },
                        results: this.formatResults(fuzzyResults),
                        searchTime: Date.now() - startTime
                    };

                    this.logger.info(`Found ${fuzzyResults.length} fuzzy matches in ${result.searchTime}ms`);
                    return result;
                }
            }

            // Step 3: No matches found
            const result = {
                success: true,
                matchType: 'none',
                query: { country: normalizedCountry, postalCode: normalizedPostalCode },
                results: [],
                searchTime: Date.now() - startTime
            };

            this.logger.info(`No matches found in ${result.searchTime}ms`);
            return result;

        } catch (error) {
            this.logger.error('Search error:', error);
            return {
                success: false,
                error: 'Internal search error',
                results: [],
                searchTime: Date.now() - startTime
            };
        }
    }

    async findExactMatches(country, postalCode) {
        try {
            return await this.statements.findExact(country, postalCode);
        } catch (error) {
            this.logger.error('Exact match error:', error);
            return [];
        }
    }

    async findFuzzyMatches(country, postalCode) {
        try {
            // Multiple fuzzy search strategies
            const strategies = [
                () => this.fuzzyPostalCodeSearch(country, postalCode),
                () => this.partialPostalCodeSearch(country, postalCode),
                () => this.placeNameSearch(country, postalCode)
            ];

            const allResults = [];
            const seenRecords = new Set();

            for (const strategy of strategies) {
                const results = await strategy();
                
                for (const result of results) {
                    const key = `${result.country_code}:${result.postal_code}:${result.place_name}`;
                    if (!seenRecords.has(key)) {
                        seenRecords.add(key);
                        
                        // Calculate similarity score
                        const similarity = this.calculateSimilarity(postalCode, result.postal_code);
                        result.similarity_score = similarity;
                        
                        // Only include results above similarity threshold
                        if (similarity >= 0.5) {
                            allResults.push(result);
                        }
                    }
                }
            }

            // Sort by similarity score and limit results
            return allResults
                .sort((a, b) => {
                    // Primary sort: similarity score (higher is better)
                    if (Math.abs(a.similarity_score - b.similarity_score) > 0.01) {
                        return b.similarity_score - a.similarity_score;
                    }
                    // Secondary sort: accuracy (higher is better)
                    if (a.accuracy !== b.accuracy) {
                        return (b.accuracy || 0) - (a.accuracy || 0);
                    }
                    // Tertiary sort: by postal code for consistency
                    return a.postal_code.localeCompare(b.postal_code);
                })
                .slice(0, this.maxResults);

        } catch (error) {
            this.logger.error('Fuzzy match error:', error);
            return [];
        }
    }

    async fuzzyPostalCodeSearch(country, postalCode) {
        try {
            return await this.statements.findFuzzy(country, postalCode);
        } catch (error) {
            this.logger.error('Postal code fuzzy search error:', error);
            return [];
        }
    }

    async partialPostalCodeSearch(country, postalCode) {
        try {
            // Try progressively shorter prefixes
            const results = [];
            const minLength = Math.max(2, Math.floor(postalCode.length * 0.6));

            for (let len = postalCode.length - 1; len >= minLength; len--) {
                const prefix = postalCode.substring(0, len);
                const prefixResults = await this.statements.findFuzzy(country, prefix);
                
                results.push(...prefixResults);
                
                // Stop if we found enough results
                if (results.length >= this.maxResults) {
                    break;
                }
            }

            return results;
        } catch (error) {
            this.logger.error('Partial postal code search error:', error);
            return [];
        }
    }

    async placeNameSearch(country, postalCode) {
        try {
            // Sometimes users search by place name instead of postal code
            // This is a fallback for cases where postal code might be a place name
            return await this.statements.findByPlace(country, postalCode);
        } catch (error) {
            this.logger.error('Place name search error:', error);
            return [];
        }
    }

    calculateSimilarity(query, target) {
        try {
            if (query === target) return 1.0;
            
            const maxLength = Math.max(query.length, target.length);
            if (maxLength === 0) return 1.0;
            
            const distance = levenshtein.get(query, target);
            const similarity = 1 - (distance / maxLength);
            
            // Bonus for length similarity
            const lengthRatio = Math.min(query.length, target.length) / Math.max(query.length, target.length);
            const lengthBonus = lengthRatio * 0.1;
            
            // Bonus for common prefixes
            let prefixLength = 0;
            const minLength = Math.min(query.length, target.length);
            for (let i = 0; i < minLength; i++) {
                if (query[i].toLowerCase() === target[i].toLowerCase()) {
                    prefixLength++;
                } else {
                    break;
                }
            }
            const prefixBonus = (prefixLength / Math.max(query.length, target.length)) * 0.2;
            
            return Math.min(1.0, similarity + lengthBonus + prefixBonus);
        } catch (error) {
            this.logger.error('Similarity calculation error:', error);
            return 0;
        }
    }

    formatResults(results) {
        return results.map(result => ({
            country_code: result.country_code,
            postal_code: result.postal_code,
            place_name: result.place_name,
            admin_name1: result.admin_name1,
            admin_code1: result.admin_code1,
            admin_name2: result.admin_name2,
            admin_code2: result.admin_code2,
            admin_name3: result.admin_name3,
            admin_code3: result.admin_code3,
            latitude: result.latitude,
            longitude: result.longitude,
            accuracy: result.accuracy,

            similarity_score: result.similarity_score || 1.0,
            fullAddress: this.constructFullAddress(result)
        }));
    }

    constructFullAddress(result) {
        try {
            const parts = [];
            const country = result.country_code;

            // Add place name (city/locality) if available
            if (result.place_name) {
                parts.push(result.place_name);
            }

            // Country-specific address formatting
            switch (country) {
            case 'US':
                // US Format: "City, County, State Abbreviation PostalCode"
                if (result.admin_name2) {
                    // Add county if different from place name
                    if (!result.place_name || !result.admin_name2.toLowerCase().includes(result.place_name.toLowerCase())) {
                        parts.push(result.admin_name2);
                    }
                }
                if (result.admin_code1) {
                    parts.push(`${result.admin_code1} ${result.postal_code}`);
                } else if (result.admin_name1) {
                    parts.push(`${result.admin_name1} ${result.postal_code}`);
                }
                break;

            case 'CA':
                // Canada Format: "City, Province Abbreviation PostalCode"
                if (result.admin_code1) {
                    parts.push(`${result.admin_code1} ${result.postal_code}`);
                } else if (result.admin_name1) {
                    parts.push(`${result.admin_name1} ${result.postal_code}`);
                }
                break;

            case 'GB':
            case 'UK':
                // UK Format: "City, County, Country PostalCode"
                if (result.admin_name2 && result.admin_name2 !== result.place_name) {
                    parts.push(result.admin_name2);
                }
                if (result.admin_name1 && result.admin_name1 !== result.place_name) {
                    parts.push(result.admin_name1);
                }
                parts.push(result.postal_code);
                break;

            case 'DE':
            case 'FR':
            case 'IT':
            case 'ES':
                // European Format: "PostalCode City, Region"
                if (result.place_name) {
                    // Remove place_name from parts and reconstruct
                    parts.pop();
                    parts.push(`${result.postal_code} ${result.place_name}`);
                }
                if (result.admin_name1 && result.admin_name1 !== result.place_name) {
                    parts.push(result.admin_name1);
                }
                break;

            case 'AU':
                // Australia Format: "City State PostalCode"
                if (result.admin_code1) {
                    parts.push(`${result.admin_code1} ${result.postal_code}`);
                } else if (result.admin_name1) {
                    parts.push(`${result.admin_name1} ${result.postal_code}`);
                }
                break;

            default:
                // Default international format: "City, Region, Country PostalCode"
                if (result.admin_name2 && result.admin_name2 !== result.place_name) {
                    parts.push(result.admin_name2);
                }
                if (result.admin_name1 && result.admin_name1 !== result.place_name) {
                    parts.push(result.admin_name1);
                }
                if (result.postal_code) {
                    parts.push(result.postal_code);
                }
                break;
            }

            // Clean up and join parts
            const cleanParts = parts
                .filter(part => part && part.trim().length > 0)
                .map(part => part.trim())
                .filter((part, index, array) => {
                    // Remove duplicates (case-insensitive)
                    return array.findIndex(p => p.toLowerCase() === part.toLowerCase()) === index;
                });

            return cleanParts.length > 0 ? cleanParts.join(', ') : result.postal_code || 'Address not available';

        } catch (error) {
            this.logger.warn('Error constructing full address:', error.message);
            return result.postal_code || 'Address not available';
        }
    }

    async searchMultiple(searches) {
        const results = [];
        
        for (const search of searches) {
            const result = await this.searchPostalCode(
                search.country, 
                search.postalCode, 
                search.fuzzy !== false
            );
            results.push({
                query: search,
                ...result
            });
        }
        
        return results;
    }

    async suggest(country, partialPostalCode, limit = 10) {
        try {
            if (!country || !partialPostalCode || partialPostalCode.length < 2) {
                return {
                    success: false,
                    error: 'Country and at least 2 characters of postal code required',
                    suggestions: []
                };
            }

            const normalizedCountry = country.trim().toUpperCase();
            const normalizedPartial = partialPostalCode.trim();

            // Get suggestions using prefix search
            const suggestions = await this.statements.findFuzzy(
                normalizedCountry,
                normalizedPartial
            );

            // Format and deduplicate suggestions
            const seen = new Set();
            const uniqueSuggestions = [];

            for (const suggestion of suggestions) {
                const key = `${suggestion.postal_code}:${suggestion.place_name}`;
                if (!seen.has(key) && uniqueSuggestions.length < limit) {
                    seen.add(key);
                    uniqueSuggestions.push({
                        postal_code: suggestion.postal_code,
                        place_name: suggestion.place_name,
                        admin_name1: suggestion.admin_name1
                    });
                }
            }

            return {
                success: true,
                query: { country: normalizedCountry, partial: normalizedPartial },
                suggestions: uniqueSuggestions
            };

        } catch (error) {
            this.logger.error('Suggestion error:', error);
            return {
                success: false,
                error: 'Internal suggestion error',
                suggestions: []
            };
        }
    }

    // Get database statistics for monitoring
    async getStats() {
        try {
            return await this.database.getStats();
        } catch (error) {
            this.logger.error('Stats error:', error);
            return null;
        }
    }

    // Health check
    async healthCheck() {
        try {
            const start = Date.now();
            const stats = await this.getStats();
            const responseTime = Date.now() - start;

            return {
                healthy: stats && stats.total_records > 0,
                stats,
                responseTime
            };
        } catch (error) {
            this.logger.error('Health check error:', error);
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

module.exports = SearchService; 