const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  getAllSkills,
  getCategories,
  getMatches,
  updateUserStats,
  getTokenHistory,
  updateEmailPreferences
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Public routes
router.get('/', getAllUsers);
router.get('/skills/all', getAllSkills);
router.get('/categories', getCategories);
router.get('/:id', getUserById);

// Protected routes
router.get('/matches/recommendations', protect, getMatches);
router.get('/:id/tokens', protect, getTokenHistory);
router.put('/:id/stats', protect, updateUserStats);
router.put('/:id/email-preferences', protect, updateEmailPreferences);

module.exports = router;
