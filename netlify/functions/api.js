/**
 * ===================================
 * NETLIFY SERVERLESS FUNCTION - API
 * ===================================
 * This wraps your Express server as a Netlify serverless function
 * All /api/* requests will be handled by this function
 */

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import database connection
const connectDB = require('../../server/config/database');

// Import routes
const authRoutes = require('../../server/routes/authRoutes');
const userRoutes = require('../../server/routes/userRoutes');
const exchangeRoutes = require('../../server/routes/exchangeRoutes');
const conversationRoutes = require('../../server/routes/conversationRoutes');
const contactRoutes = require('../../server/routes/contactRoutes');
const adminRoutes = require('../../server/routes/adminRoutes');
const adminAuthRoutes = require('../../server/routes/adminAuthRoutes');

// Initialize express app
const app = express();

// Connect to MongoDB (only once per cold start)
let dbConnected = false;
const initDB = async () => {
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));

// Rate limiting - Increased limits for better UX
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 requests per window
  message: JSON.stringify({
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  skipFailedRequests: false
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-auth', adminAuthRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Netlify serverless function is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Platform stats route
app.get('/api/stats', async (req, res) => {
  try {
    const User = require('../../server/models/User');
    const Exchange = require('../../server/models/Exchange');

    const totalUsers = await User.countDocuments({ isActive: true });
    const totalExchanges = await Exchange.countDocuments();
    const completedExchanges = await Exchange.countDocuments({ status: 'completed' });
    const activeExchanges = await Exchange.countDocuments({ status: 'active' });

    const successRate = totalExchanges > 0
      ? Math.round((completedExchanges / totalExchanges) * 100)
      : 0;

    const avgRatingResult = await User.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    const avgRating = avgRatingResult.length > 0
      ? Math.round(avgRatingResult[0].avgRating * 10) / 10
      : 0;

    res.status(200).json({
      success: true,
      stats: {
        total_users: totalUsers,
        total_exchanges: totalExchanges,
        active_exchanges: activeExchanges,
        completed_exchanges: completedExchanges,
        success_rate: successRate,
        average_rating: avgRating
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stats'
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database connection before handling requests
const handler = async (event, context) => {
  // Prevent function timeout from waiting for DB connection pool
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Connect to database
  await initDB();
  
  // Handle the request
  return serverless(app)(event, context);
};

module.exports.handler = handler;
