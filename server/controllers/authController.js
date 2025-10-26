const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

// Get base URL for emails
const getBaseUrl = () => {
  return process.env.CLIENT_URL || 'http://localhost:5000';
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, location } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      location: location || '',
      badges: ['New Member']
    });

    // Generate token
    const token = generateToken(user._id);

    // Send welcome email
    await sendEmail(user.email, 'welcomeEmail', {
      userName: user.name,
      dashboardUrl: `${getBaseUrl()}/#dashboard`
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Get user with password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio, location, avatar, profilePicture, skills_offered, skills_wanted } = req.body;

    const updateFields = {};
    if (name) updateFields.name = name;
    if (bio) updateFields.bio = bio;
    if (location) updateFields.location = location;
    
    // Handle profile picture (uploaded file takes priority)
    if (profilePicture) {
      updateFields.profilePicture = profilePicture;
      updateFields.avatar = profilePicture; // Also update avatar field for backward compatibility
    } else if (avatar) {
      updateFields.avatar = avatar;
      updateFields.profilePicture = avatar;
    }
    
    if (skills_offered) updateFields.skills_offered = skills_offered;
    if (skills_wanted) updateFields.skills_wanted = skills_wanted;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password - Send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { identifier } = req.body; // Can be email, username, or phone

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email, username, or phone number'
      });
    }

    // Find user by email, username, or phone
    const user = await User.findByIdentifier(identifier);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with that information'
      });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    
    // For local development, also show the direct link
    const clientResetUrl = process.env.CLIENT_URL 
      ? `${process.env.CLIENT_URL}/reset-password/${resetToken}`
      : `http://localhost:5000?reset=${resetToken}`;

    // Determine contact method (prioritize email, then phone)
    let contactInfo = {
      method: 'email',
      value: user.email
    };
    
    if (!user.email && user.phone) {
      contactInfo = {
        method: 'phone',
        value: user.phone
      };
    }

    try {
      const { sendEmail, getResetPasswordEmail } = require('../config/email');
      
      if (contactInfo.method === 'email') {
        await sendEmail({
          email: user.email,
          subject: 'Password Reset Request - SkillSwap',
          html: getResetPasswordEmail(clientResetUrl, user.name)
        });
      }

      res.status(200).json({
        success: true,
        message: `Password reset link sent to your ${contactInfo.method === 'email' ? 'email' : 'phone'}`,
        contactMethod: contactInfo.method,
        maskedContact: contactInfo.method === 'email' 
          ? `${contactInfo.value.substring(0, 3)}***@${contactInfo.value.split('@')[1]}`
          : `***${contactInfo.value.slice(-4)}`,
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Clear reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      // For development, still return success with token
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({
          success: true,
          message: 'Email service not configured. Use this reset link:',
          resetUrl: clientResetUrl,
          resetToken: resetToken,
          note: 'In development mode - configure SMTP for production'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please contact support.'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { resetToken } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide new password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Find user by reset token
    const user = await User.findByResetToken(resetToken);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};
