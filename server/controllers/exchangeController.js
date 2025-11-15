const Exchange = require('../models/Exchange');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');

// Get base URL for emails
const getBaseUrl = () => {
  return process.env.CLIENT_URL || 'http://localhost:5000';
};

// @desc    Create new exchange request
// @route   POST /api/exchanges
// @access  Private
exports.createExchange = async (req, res, next) => {
  try {
    const { provider_id, requested_skill, offered_skill } = req.body;

    // Validate input
    if (!provider_id || !requested_skill || !offered_skill) {
      return res.status(400).json({
        success: false,
        message: 'Please provide provider_id, requested_skill, and offered_skill'
      });
    }

    // Check if provider exists
    const provider = await User.findById(provider_id);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Create exchange
    const exchange = await Exchange.create({
      requester_id: req.user._id,
      provider_id,
      requested_skill,
      offered_skill,
      status: 'pending'
    });

    // Populate user data
    await exchange.populate('requester_id', 'name email avatar rating total_exchanges');
    await exchange.populate('provider_id', 'name email avatar rating total_exchanges');

    // Create conversation
    await Conversation.create({
      participants: [req.user._id, provider_id],
      exchange_id: exchange._id
    });

    // Send email notification to provider
    if (provider.emailNotifications && provider.emailNotifications.exchangeRequests) {
      await sendEmail(provider.email, 'exchangeRequest', {
        providerName: provider.name,
        requesterName: req.user.name,
        requestedSkill: requested_skill,
        offeredSkill: offered_skill,
        requesterExchanges: req.user.total_exchanges || 0,
        requesterRating: (req.user.rating || 0).toFixed(1),
        dashboardUrl: `${getBaseUrl()}/#exchanges`
      });
    }

    res.status(201).json({
      success: true,
      message: 'Exchange request created successfully',
      exchange
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all exchanges for current user
// @route   GET /api/exchanges
// @access  Private
exports.getUserExchanges = async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = {
      $or: [
        { requester_id: req.user._id },
        { provider_id: req.user._id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const exchanges = await Exchange.find(query)
      .populate('requester_id', 'name email avatar rating')
      .populate('provider_id', 'name email avatar rating')
      .sort({ created_date: -1 });

    // Filter out exchanges with deleted users
    const validExchanges = exchanges.filter(exchange => 
      exchange.requester_id && exchange.provider_id
    );

    res.status(200).json({
      success: true,
      count: validExchanges.length,
      exchanges: validExchanges
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get exchange by ID
// @route   GET /api/exchanges/:id
// @access  Private
exports.getExchangeById = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.id)
      .populate('requester_id', 'name email avatar rating')
      .populate('provider_id', 'name email avatar rating');

    if (!exchange) {
      return res.status(404).json({
        success: false,
        message: 'Exchange not found'
      });
    }

    // Check if user is part of the exchange
    if (
      exchange.requester_id._id.toString() !== req.user._id.toString() &&
      exchange.provider_id._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this exchange'
      });
    }

    res.status(200).json({
      success: true,
      exchange
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update exchange status
// @route   PUT /api/exchanges/:id/status
// @access  Private
exports.updateExchangeStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide status'
      });
    }

    const exchange = await Exchange.findById(req.params.id);

    if (!exchange) {
      return res.status(404).json({
        success: false,
        message: 'Exchange not found'
      });
    }

    // Check authorization
    if (
      exchange.requester_id.toString() !== req.user._id.toString() &&
      exchange.provider_id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this exchange'
      });
    }

    await exchange.updateStatus(status);

    // Populate user data for email notifications
    await exchange.populate('requester_id', 'name email avatar rating total_exchanges emailNotifications');
    await exchange.populate('provider_id', 'name email avatar rating total_exchanges emailNotifications');

    // Send email notifications based on status
    if (status === 'active') {
      // Exchange accepted - notify requester
      const requester = exchange.requester_id;
      if (requester.emailNotifications && requester.emailNotifications.exchangeAccepted) {
        await sendEmail(requester.email, 'exchangeAccepted', {
          requesterName: requester.name,
          providerName: exchange.provider_id.name,
          requestedSkill: exchange.requested_skill,
          offeredSkill: exchange.offered_skill,
          messagesUrl: `${getBaseUrl()}/#messages`
        });
      }
    }

    // Update user stats and tokens if completed
    if (status === 'completed') {
      const requester = await User.findById(exchange.requester_id);
      const provider = await User.findById(exchange.provider_id);

      // Calculate token rewards based on skill level
      const getTokenReward = (skill) => {
        const rewards = {
          'Beginner': 5,
          'Intermediate': 10,
          'Advanced': 15,
          'Expert': 20
        };
        return rewards[skill] || 10;
      };

      // Reward requester (learned a skill)
      const requesterReward = getTokenReward(exchange.requested_skill);
      await requester.addTokens(
        requesterReward, 
        'earned', 
        `Completed exchange: Learned ${exchange.requested_skill}`,
        exchange._id
      );
      requester.total_exchanges += 1;
      await requester.save();

      // Reward provider (taught a skill)
      const providerReward = getTokenReward(exchange.offered_skill);
      await provider.addTokens(
        providerReward, 
        'earned', 
        `Completed exchange: Taught ${exchange.offered_skill}`,
        exchange._id
      );
      provider.total_exchanges += 1;
      await provider.save();

      // Award badges for milestones
      if (requester.total_exchanges === 1 && !requester.badges.includes('First Exchange')) {
        requester.badges.push('First Exchange');
        await requester.save();
      }
      if (requester.total_exchanges === 5 && !requester.badges.includes('5 Exchanges')) {
        requester.badges.push('5 Exchanges');
        await requester.save();
      }
      if (requester.total_exchanges === 10 && !requester.badges.includes('Exchange Master')) {
        requester.badges.push('Exchange Master');
        await requester.save();
      }

      if (provider.total_exchanges === 1 && !provider.badges.includes('First Exchange')) {
        provider.badges.push('First Exchange');
        await provider.save();
      }
      if (provider.total_exchanges === 5 && !provider.badges.includes('5 Exchanges')) {
        provider.badges.push('5 Exchanges');
        await provider.save();
      }
      if (provider.total_exchanges === 10 && !provider.badges.includes('Exchange Master')) {
        provider.badges.push('Exchange Master');
        await provider.save();
      }

      // Send email notifications about completion
      if (requester.emailNotifications && requester.emailNotifications.exchangeCompleted) {
        await sendEmail(requester.email, 'exchangeCompleted', {
          userName: requester.name,
          otherUserName: provider.name,
          tokensEarned: requesterReward,
          requestedSkill: exchange.requested_skill,
          offeredSkill: exchange.offered_skill,
          badgeEarned: requester.badges[requester.badges.length - 1] !== 'First Exchange' ? null : 'First Exchange',
          ratingUrl: `${getBaseUrl()}/#exchanges`
        });
      }

      if (provider.emailNotifications && provider.emailNotifications.exchangeCompleted) {
        await sendEmail(provider.email, 'exchangeCompleted', {
          userName: provider.name,
          otherUserName: requester.name,
          tokensEarned: providerReward,
          requestedSkill: exchange.requested_skill,
          offeredSkill: exchange.offered_skill,
          badgeEarned: provider.badges[provider.badges.length - 1] !== 'First Exchange' ? null : 'First Exchange',
          ratingUrl: `${getBaseUrl()}/#exchanges`
        });
      }
    }

    await exchange.populate('requester_id', 'name email avatar rating');
    await exchange.populate('provider_id', 'name email avatar rating');

    res.status(200).json({
      success: true,
      message: `Exchange ${status}`,
      exchange
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add message to exchange
// @route   POST /api/exchanges/:id/messages
// @access  Private
exports.addMessage = async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message content'
      });
    }

    const exchange = await Exchange.findById(req.params.id);

    if (!exchange) {
      return res.status(404).json({
        success: false,
        message: 'Exchange not found'
      });
    }

    // Check authorization
    if (
      exchange.requester_id.toString() !== req.user._id.toString() &&
      exchange.provider_id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this exchange'
      });
    }

    await exchange.addMessage(req.user._id, message);

    // Update conversation
    const conversation = await Conversation.findOne({ exchange_id: exchange._id });
    if (conversation) {
      await conversation.updateLastMessage(req.user._id, message);
    }

    await exchange.populate('requester_id', 'name email avatar');
    await exchange.populate('provider_id', 'name email avatar');

    res.status(200).json({
      success: true,
      exchange
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add review to exchange
// @route   POST /api/exchanges/:id/review
// @access  Private
exports.addReview = async (req, res, next) => {
  try {
    const { rating, review } = req.body;

    if (!rating) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rating'
      });
    }

    const exchange = await Exchange.findById(req.params.id);

    if (!exchange) {
      return res.status(404).json({
        success: false,
        message: 'Exchange not found'
      });
    }

    if (exchange.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed exchanges'
      });
    }

    exchange.rating = rating;
    if (review) {
      exchange.review = review;
    }

    await exchange.save();

    // Update provider's rating
    const provider = await User.findById(exchange.provider_id);
    const providerExchanges = await Exchange.find({
      provider_id: exchange.provider_id,
      rating: { $exists: true }
    });

    const avgRating = providerExchanges.reduce((sum, ex) => sum + ex.rating, 0) / providerExchanges.length;
    provider.rating = Math.round(avgRating * 10) / 10;
    await provider.save();

    // Send email notification to provider about new rating
    if (provider.emailNotifications && provider.emailNotifications.newRatings) {
      const requester = await User.findById(exchange.requester_id);
      await sendEmail(provider.email, 'newRating', {
        providerName: provider.name,
        requesterName: requester.name,
        rating: rating,
        review: review || null,
        requestedSkill: exchange.requested_skill,
        offeredSkill: exchange.offered_skill,
        newAverageRating: provider.rating.toFixed(1),
        totalRatings: providerExchanges.length,
        profileUrl: `${getBaseUrl()}/#profile`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      exchange
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete exchange
// @route   DELETE /api/exchanges/:id
// @access  Private
exports.deleteExchange = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.id);

    if (!exchange) {
      return res.status(404).json({
        success: false,
        message: 'Exchange not found'
      });
    }

    // Only requester can delete if status is pending
    if (exchange.status !== 'pending' || exchange.requester_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this exchange'
      });
    }

    await exchange.deleteOne();

    // Delete associated conversation
    await Conversation.deleteOne({ exchange_id: exchange._id });

    res.status(200).json({
      success: true,
      message: 'Exchange deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get skills learned by user (completed exchanges where user was requester)
// @route   GET /api/exchanges/learned
// @access  Private
exports.getLearnedSkills = async (req, res, next) => {
  try {
    // Get all completed exchanges where current user was the requester (learner)
    const learnedExchanges = await Exchange.find({
      requester_id: req.user._id,
      status: 'completed'
    })
      .populate('provider_id', 'name email avatar rating total_exchanges')
      .sort({ completed_date: -1 });

    // Format the learned skills data (filter out exchanges with deleted users)
    const learnedSkills = learnedExchanges
      .filter(exchange => exchange.provider_id) // Skip if provider was deleted
      .map(exchange => ({
        skill: exchange.requested_skill,
        teacher: {
          id: exchange.provider_id._id,
          name: exchange.provider_id.name,
          avatar: exchange.provider_id.avatar,
          rating: exchange.provider_id.rating
        },
        completedDate: exchange.completed_date,
        rating: exchange.rating,
        review: exchange.review,
        sessionsCompleted: exchange.sessions_completed,
        totalHours: exchange.total_hours
      }));

    res.status(200).json({
      success: true,
      count: learnedSkills.length,
      learnedSkills
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get skills taught by user (completed exchanges where user was provider)
// @route   GET /api/exchanges/taught
// @access  Private
exports.getTaughtSkills = async (req, res, next) => {
  try {
    // Get all completed exchanges where current user was the provider (teacher)
    const taughtExchanges = await Exchange.find({
      provider_id: req.user._id,
      status: 'completed'
    })
      .populate('requester_id', 'name email avatar rating total_exchanges')
      .sort({ completed_date: -1 });

    // Format the taught skills data (filter out exchanges with deleted users)
    const taughtSkills = taughtExchanges
      .filter(exchange => exchange.requester_id) // Skip if requester was deleted
      .map(exchange => ({
        skill: exchange.offered_skill,
        student: {
          id: exchange.requester_id._id,
          name: exchange.requester_id.name,
          avatar: exchange.requester_id.avatar,
          rating: exchange.requester_id.rating
        },
        completedDate: exchange.completed_date,
        rating: exchange.rating,
        review: exchange.review,
        sessionsCompleted: exchange.sessions_completed,
        totalHours: exchange.total_hours
      }));

    res.status(200).json({
      success: true,
      count: taughtSkills.length,
      taughtSkills
    });
  } catch (error) {
    next(error);
  }
};

