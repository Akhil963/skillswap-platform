const Conversation = require('../models/Conversation');
const Exchange = require('../models/Exchange');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');

// Get base URL for emails
const getBaseUrl = () => {
  return process.env.CLIENT_URL || 'http://localhost:5000';
};

// @desc    Get all conversations for current user
// @route   GET /api/conversations
// @access  Private
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true
    })
      .populate('participants', 'name avatar')
      .populate('exchange_id', 'requested_skill offered_skill status')
      .populate('lastMessage.sender', 'name')
      .sort({ 'lastMessage.timestamp': -1 });

    res.status(200).json({
      success: true,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get conversation by ID
// @route   GET /api/conversations/:id
// @access  Private
exports.getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'name email avatar')
      .populate('exchange_id')
      .populate('lastMessage.sender', 'name');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is part of conversation
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this conversation'
      });
    }

    // Mark as read for current user
    await conversation.markAsRead(req.user._id);

    res.status(200).json({
      success: true,
      conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get messages from exchange
// @route   GET /api/conversations/exchange/:exchangeId
// @access  Private
exports.getMessagesByExchange = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.exchangeId)
      .populate('messages.user_id', 'name avatar');

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
        message: 'Not authorized to view these messages'
      });
    }

    res.status(200).json({
      success: true,
      messages: exchange.messages
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark conversation as read
// @route   PUT /api/conversations/:id/read
// @access  Private
exports.markAsRead = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    await conversation.markAsRead(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Conversation marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get unread count
// @route   GET /api/conversations/unread/count
// @access  Private
exports.getUnreadCount = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      const count = conv.unreadCount.get(req.user._id.toString()) || 0;
      totalUnread += count;
    });

    res.status(200).json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    next(error);
  }
};
