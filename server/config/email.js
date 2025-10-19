const nodemailer = require('nodemailer');

// Email configuration
const sendEmail = async (options) => {
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_EMAIL || 'your-email@gmail.com',
      pass: process.env.SMTP_PASSWORD || 'your-app-password'
    }
  });

  // Email options
  const mailOptions = {
    from: `${process.env.FROM_NAME || 'SkillSwap'} <${process.env.FROM_EMAIL || process.env.SMTP_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.html || options.message
  };

  try {
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error:', error);
    throw new Error('Email could not be sent');
  }
};

// Password reset email template
const getResetPasswordEmail = (resetUrl, name) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #6366f1; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hi ${name || 'there'},</h2>
          <p>You requested to reset your password for your SkillSwap account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: white; padding: 10px; border-radius: 5px;">
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <div class="warning">
            <strong>⚠️ Important:</strong>
            <ul>
              <li>This link expires in <strong>15 minutes</strong></li>
              <li>If you didn't request this, please ignore this email</li>
              <li>Your password won't change until you access the link above</li>
            </ul>
          </div>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br><strong>The SkillSwap Team</strong></p>
        </div>
        <div class="footer">
          <p>© 2024 SkillSwap. All rights reserved.</p>
          <p>This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Welcome email template
const getWelcomeEmail = (name) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #6366f1; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to SkillSwap!</h1>
        </div>
        <div class="content">
          <h2>Hi ${name},</h2>
          <p>Welcome aboard! We're excited to have you join the SkillSwap community.</p>
          <p>Here's what you can do now:</p>
          <div class="feature">
            <strong>🎯 Add Your Skills</strong><br>
            Share what you can teach and what you want to learn
          </div>
          <div class="feature">
            <strong>🔍 Find Matches</strong><br>
            Discover people with complementary skills
          </div>
          <div class="feature">
            <strong>💬 Start Exchanging</strong><br>
            Connect with others and start learning!
          </div>
          <div class="feature">
            <strong>🪙 Earn Tokens</strong><br>
            Complete exchanges and earn rewards
          </div>
          <p>Start by adding your first skill to your profile!</p>
          <p>Happy learning,<br><strong>The SkillSwap Team</strong></p>
        </div>
        <div class="footer">
          <p>© 2024 SkillSwap. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { 
  sendEmail, 
  getResetPasswordEmail,
  getWelcomeEmail 
};
