const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

// Import our custom modules
const PostalCodeDatabase = require('./database/schema');
const SearchService = require('./services/search-service');
// Removed configurable data processor - using direct ingest now

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'postal-code-api' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

class PostalCodeServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.database = null;
        this.searchService = null;
        // Removed dataProcessor - using direct ingest now
        // Removed refreshInProgress - using direct ingest now
        // Removed authToken - no longer needed without refresh endpoints
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await fs.ensureDir(path.join(__dirname, '../data'));
            await fs.ensureDir(path.join(__dirname, '../logs'));

            // Initialize database
            this.database = new PostalCodeDatabase();
            await this.database.connect();
            await this.database.createTables();

            // Initialize services
            this.searchService = new SearchService(this.database, logger);
            // Removed dataProcessor initialization - using direct ingest now

            logger.info('Server initialization completed');
        } catch (error) {
            logger.error('Server initialization failed:', error);
            throw error;
        }
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
        }));

        // Performance middleware
        this.app.use(compression());
        
        // Serve static files from public directory
        this.app.use(express.static('public'));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Rate limiting
        const generalLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // Limit each IP to 1000 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later',
                retryAfter: '15 minutes'
            }
        });

        const searchLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // Limit each IP to 100 searches per minute
            message: {
                error: 'Too many search requests, please try again later',
                retryAfter: '1 minute'
            }
        });

        // Removed refresh limiter - refresh endpoints removed

        this.app.use(generalLimiter);
        this.app.use('/lookup', searchLimiter);
        // Removed refresh route limiter

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
            });
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                if (!this.searchService) {
                    return res.status(503).json({
                        status: 'unhealthy',
                        error: 'Service not initialized'
                    });
                }

                const health = await this.searchService.healthCheck();
                
                res.status(health.healthy ? 200 : 503).json({
                    status: health.healthy ? 'healthy' : 'unhealthy',
                    timestamp: new Date().toISOString(),
                    refreshInProgress: false, // Always false - use 'npm run ingest' for updates
                    ...health
                });
            } catch (error) {
                logger.error('Health check error:', error);
                res.status(503).json({
                    status: 'unhealthy',
                    error: 'Health check failed'
                });
            }
        });

        // Main lookup endpoint
        this.app.get('/lookup', async (req, res) => {
            try {
                const { country, postalCode, fuzzy } = req.query;

                // Validate required parameters
                if (!country || !postalCode) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: country and postalCode',
                        example: '/lookup?country=US&postalCode=90210'
                    });
                }

                // Convert fuzzy parameter (default to true)
                const enableFuzzy = fuzzy !== 'false' && fuzzy !== '0';

                // Perform search
                const result = await this.searchService.searchPostalCode(
                    country, 
                    postalCode, 
                    enableFuzzy
                );

                // Set appropriate status code
                const statusCode = result.success ? 
                    (result.results.length > 0 ? 200 : 404) : 
                    500;

                res.status(statusCode).json(result);

            } catch (error) {
                logger.error('Lookup endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Batch lookup endpoint
        this.app.post('/lookup/batch', async (req, res) => {
            try {
                const { searches } = req.body;

                if (!Array.isArray(searches) || searches.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Request body must contain an array of searches',
                        example: {
                            searches: [
                                { country: 'US', postalCode: '90210' },
                                { country: 'CA', postalCode: 'M5V 3A8' }
                            ]
                        }
                    });
                }

                if (searches.length > 50) {
                    return res.status(400).json({
                        success: false,
                        error: 'Maximum 50 searches per batch request'
                    });
                }

                const results = await this.searchService.searchMultiple(searches);

                res.json({
                    success: true,
                    count: results.length,
                    results
                });

            } catch (error) {
                logger.error('Batch lookup endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Validation endpoint - Quick true/false check
        this.app.get('/validate', async (req, res) => {
            try {
                const { country, postalCode } = req.query;

                if (!country || !postalCode) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: country and postalCode',
                        example: '/validate?country=US&postalCode=90210'
                    });
                }

                // Perform exact match only for validation
                const result = await this.searchService.searchPostalCode(
                    country, 
                    postalCode, 
                    { fuzzy: false, limit: 1 }
                );

                // Return simple boolean based on exact match
                const isValid = result.success && 
                              result.matchType === 'exact' && 
                              result.results && 
                              result.results.length > 0;

                res.json(isValid);

            } catch (error) {
                logger.error('Validation endpoint error:', error);
                res.json(false); // Return false on any error
            }
        });

        // Suggestion endpoint
        this.app.get('/suggest', async (req, res) => {
            try {
                const { country, partial, limit } = req.query;

                if (!country || !partial) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: country and partial',
                        example: '/suggest?country=US&partial=902'
                    });
                }

                const result = await this.searchService.suggest(
                    country, 
                    partial, 
                    parseInt(limit) || 10
                );

                res.json(result);

            } catch (error) {
                logger.error('Suggestion endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Removed refresh endpoints - use 'npm run ingest' for data updates

        // Statistics endpoint
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = this.searchService.getStats();
                
                if (!stats) {
                    return res.status(503).json({
                        success: false,
                        error: 'Statistics unavailable'
                    });
                }

                res.json({
                    success: true,
                    stats,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Stats endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get statistics'
                });
            }
        });

        // API documentation endpoint
        this.app.get('/', (req, res) => {
            res.json({
                name: 'Postal Code Lookup API',
                version: '1.0.0',
                description: 'Fast postal code lookup with exact and fuzzy matching',
                endpoints: {
                    'GET /lookup': {
                        description: 'Search for postal code',
                        parameters: {
                            country: 'Country code (required)',
                            postalCode: 'Postal code to search (required)',
                            fuzzy: 'Enable fuzzy matching (optional, default: true)'
                        },
                        example: '/lookup?country=US&postalCode=90210'
                    },
                    'POST /lookup/batch': {
                        description: 'Batch postal code search',
                        body: {
                            searches: 'Array of search objects'
                        }
                    },
                    'GET /suggest': {
                        description: 'Get postal code suggestions',
                        parameters: {
                            country: 'Country code (required)',
                            partial: 'Partial postal code (required)',
                            limit: 'Maximum suggestions (optional, default: 10)'
                        }
                    },
                    'GET /health': 'Health check endpoint',
                    'GET /stats': 'Database statistics',
                                    // Removed refresh endpoints - use 'npm run ingest' for data updates
                },
                authentication: {
                    header: 'x-auth-token',
                    required_for: [] // Removed refresh endpoints
                }
            });
        });
    }

    authMiddleware(req, res, next) {
        const token = req.headers['x-auth-token'] || req.headers['authorization'];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please provide x-auth-token header.'
            });
        }

        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace(/^Bearer\s+/, '');

        if (cleanToken !== this.authToken) {
            return res.status(403).json({
                success: false,
                error: 'Invalid authentication token'
            });
        }

        next();
    }

    // Removed startBackgroundRefresh method - using direct ingest now

    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                availableEndpoints: ['/lookup', '/health', '/stats']
            });
        });

        // Error handler
        this.app.use((err, req, res, _next) => {
            logger.error('Unhandled error:', err);
            
            res.status(err.status || 500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' ? 
                    'Internal server error' : 
                    err.message,
                ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
            });
        });
    }

    async start() {
        try {
            await this.initialize();

            const server = this.app.listen(this.port, () => {
                logger.info(`🚀 Postal Code API server running on port ${this.port}`);
                logger.info(`📍 Lookup endpoint: http://localhost:${this.port}/lookup?country=US&postalCode=90210`);
                logger.info(`🔍 Health check: http://localhost:${this.port}/health`);
                logger.info(`📊 Statistics: http://localhost:${this.port}/stats`);
            });

            // Graceful shutdown
            process.on('SIGTERM', async () => {
                logger.info('SIGTERM received, shutting down gracefully');
                server.close(async () => {
                    if (this.database) {
                        await this.database.close();
                    }
                    process.exit(0);
                });
            });

            process.on('SIGINT', async () => {
                logger.info('SIGINT received, shutting down gracefully');
                server.close(async () => {
                    if (this.database) {
                        await this.database.close();
                    }
                    process.exit(0);
                });
            });

            return server;
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new PostalCodeServer();
    server.start();
}

module.exports = PostalCodeServer; 