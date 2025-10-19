const User = require('../models/User');

// @desc    Get all users (for marketplace/discovery)
// @route   GET /api/users
// @access  Public
exports.getAllUsers = async (req, res, next) => {
  try {
    const { search, category, level, page = 1, limit = 20 } = req.query;

    let query = { isActive: true };

    // Search by name or skills
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'skills_offered.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by category
    if (category) {
      query['skills_offered.category'] = category;
    }

    // Filter by experience level
    if (level) {
      query['skills_offered.experience_level'] = level;
    }

    const users = await User.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ rating: -1, total_exchanges: -1 });

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Public
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all skills from all users
// @route   GET /api/users/skills/all
// @access  Public
exports.getAllSkills = async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).select('name avatar skills_offered rating');

    const skills = [];
    users.forEach(user => {
      user.skills_offered.forEach(skill => {
        skills.push({
          ...skill.toObject(),
          user: {
            _id: user._id,
            name: user.name,
            avatar: user.avatar,
            rating: user.rating
          }
        });
      });
    });

    res.status(200).json({
      success: true,
      count: skills.length,
      skills
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get skill categories
// @route   GET /api/users/categories
// @access  Public
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await User.distinct('skills_offered.category');

    res.status(200).json({
      success: true,
      categories: categories.sort()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get recommended matches for a user
// @route   GET /api/users/matches
// @access  Private
exports.getMatches = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user._id);

    if (!currentUser.skills_wanted || currentUser.skills_wanted.length === 0) {
      return res.status(200).json({
        success: true,
        matches: [],
        message: 'Add skills you want to learn to get recommendations'
      });
    }

    // Find users who offer what current user wants
    const wantedSkillNames = currentUser.skills_wanted.map(s => s.name);
    
    const potentialMatches = await User.find({
      _id: { $ne: currentUser._id },
      isActive: true,
      'skills_offered.name': { $in: wantedSkillNames }
    }).select('-password');

    // Calculate match scores
    const matches = potentialMatches.map(user => {
      let score = 0;
      const matchedSkills = [];

      user.skills_offered.forEach(offeredSkill => {
        const wantedSkill = currentUser.skills_wanted.find(
          ws => ws.name.toLowerCase() === offeredSkill.name.toLowerCase()
        );

        if (wantedSkill) {
          score += 50; // Base match score
          
          // Bonus for category match
          if (wantedSkill.category === offeredSkill.category) {
            score += 20;
          }

          // Bonus for experience level match
          if (wantedSkill.experience_level === offeredSkill.experience_level) {
            score += 15;
          }

          // Bonus for user rating
          score += user.rating * 3;

          matchedSkills.push({
            skill: offeredSkill,
            wantedLevel: wantedSkill.experience_level
          });
        }
      });

      return {
        user: user.toObject(),
        score,
        matchedSkills
      };
    });

    // Sort by score and return top matches
    matches.sort((a, b) => b.score - a.score);

    res.status(200).json({
      success: true,
      matches: matches.slice(0, 10)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user stats
// @route   PUT /api/users/:id/stats
// @access  Private (Admin or self)
exports.updateUserStats = async (req, res, next) => {
  try {
    const { total_exchanges, tokens_earned, rating, badges } = req.body;

    const updateFields = {};
    if (total_exchanges !== undefined) updateFields.total_exchanges = total_exchanges;
    if (tokens_earned !== undefined) updateFields.tokens_earned = tokens_earned;
    if (rating !== undefined) updateFields.rating = rating;
    if (badges) updateFields.badges = badges;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user token history
// @route   GET /api/users/:id/tokens
// @access  Private (self only)
exports.getTokenHistory = async (req, res, next) => {
  try {
    // Check if user is requesting their own token history
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this token history'
      });
    }

    const user = await User.findById(req.params.id)
      .select('token_history tokens_earned tokens_spent name')
      .populate('token_history.exchange_id', 'requested_skill offered_skill');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Sort token history by date (most recent first)
    const sortedHistory = user.token_history.sort((a, b) => b.date - a.date);

    res.status(200).json({
      success: true,
      tokens: {
        current: user.tokens_earned,
        spent: user.tokens_spent || 0,
        total_earned: user.tokens_earned + (user.tokens_spent || 0),
        history: sortedHistory
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update email notification preferences
// @route   PUT /api/users/:id/email-preferences
// @access  Private (self only)
exports.updateEmailPreferences = async (req, res, next) => {
  try {
    // Check if user is updating their own preferences
    if (req.params.id !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update these preferences'
      });
    }

    const { emailNotifications } = req.body;

    if (!emailNotifications) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email notification preferences'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { emailNotifications },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email preferences updated successfully',
      emailNotifications: user.emailNotifications
    });
  } catch (error) {
    next(error);
  }
};
