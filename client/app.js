// SkillSwap Application - Frontend with API Integration

// API Base URL
const API_URL = window.location.origin + '/api';

// Application State
const AppState = {
  currentUser: null,
  token: localStorage.getItem('token') || null,
  currentPage: 'home',
  users: [],
  exchanges: [],
  skillCategories: [],
  experienceLevels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
  featuredSkills: [],
  platformStats: {},
  conversations: [],
  activeConversation: null,
  requestQueue: [],
  isProcessingQueue: false,
  rateLimitDelay: 100, // Delay between requests in ms
  cache: {}, // Cache for API responses
  cacheExpiry: 5 * 60 * 1000, // 5 minutes cache
  pendingRequests: {} // Track pending requests to avoid duplicates
};

// ======================
// API HELPER FUNCTIONS
// ======================

// Request queue to prevent rate limiting
async function processRequestQueue() {
  if (AppState.isProcessingQueue || AppState.requestQueue.length === 0) {
    return;
  }

  AppState.isProcessingQueue = true;

  while (AppState.requestQueue.length > 0) {
    const request = AppState.requestQueue.shift();
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, AppState.rateLimitDelay));
  }

  AppState.isProcessingQueue = false;
}

// Queue API requests
function queueRequest(executeFunction) {
  return new Promise((resolve, reject) => {
    AppState.requestQueue.push({
      execute: executeFunction,
      resolve,
      reject
    });
    processRequestQueue();
  });
}

// Make API request with authentication, caching, and retry logic
async function apiRequest(endpoint, options = {}) {
  // Create cache key
  const cacheKey = `${options.method || 'GET'}_${endpoint}_${JSON.stringify(options.body || '')}`;
  
  // Check if request is already pending
  if (AppState.pendingRequests[cacheKey]) {
    return AppState.pendingRequests[cacheKey];
  }
  
  // Check cache for GET requests
  if ((!options.method || options.method === 'GET') && AppState.cache[cacheKey]) {
    const cached = AppState.cache[cacheKey];
    if (Date.now() - cached.timestamp < AppState.cacheExpiry) {
      return cached.data;
    }
    // Clear expired cache
    delete AppState.cache[cacheKey];
  }

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(AppState.token && { 'Authorization': `Bearer ${AppState.token}` })
    },
    ...options
  };

  // Create the request promise
  const requestPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      
      // Handle rate limiting with retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        
        // If retry time is reasonable (less than 5 minutes), wait and retry
        if (retryAfter <= 300) {
          showNotification(`Rate limit reached. Retrying in ${retryAfter} seconds...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          
          // Retry the request
          delete AppState.pendingRequests[cacheKey];
          return apiRequest(endpoint, options);
        } else {
          throw new Error(`Too many requests. Please wait ${retryAfter} seconds and try again.`);
        }
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server returned an invalid response. Please try again.');
      }

      const data = await response.json();

      if (!response.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          throw new Error(data.errors.join(', '));
        }
        throw new Error(data.message || 'API request failed');
      }

      // Cache successful GET requests
      if (!options.method || options.method === 'GET') {
        AppState.cache[cacheKey] = {
          data: data,
          timestamp: Date.now()
        };
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      
      throw error;
    } finally {
      // Clear pending request
      delete AppState.pendingRequests[cacheKey];
    }
  })();

  // Store pending request
  AppState.pendingRequests[cacheKey] = requestPromise;

  return requestPromise;
}

// Clear cache function
function clearCache(pattern = null) {
  if (pattern) {
    // Clear specific cache entries matching pattern
    Object.keys(AppState.cache).forEach(key => {
      if (key.includes(pattern)) {
        delete AppState.cache[key];
      }
    });
  } else {
    // Clear all cache
    AppState.cache = {};
  }
}

// Check authentication status
async function checkAuth() {
  if (AppState.token) {
    try {
      const data = await apiRequest('/auth/me');
      AppState.currentUser = data.user;
      updateNavigation();
      return true;
    } catch (error) {
      localStorage.removeItem('token');
      AppState.token = null;
      AppState.currentUser = null;
      return false;
    }
  }
  return false;
}

// ======================
// INITIALIZE APP
// ======================

async function initializeApp() {
  try {
    // Check for password reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset');
    
    if (resetToken) {
      // Show reset password page if reset token present
      navigateToPage('resetPasswordPage');
      return;
    }

    // Check if user is logged in
    await checkAuth();

    // Load critical data in parallel with graceful error handling
    await Promise.allSettled([
      loadPlatformStats(),
      loadCategories()
    ]);

    // Set up event listeners
    setupEventListeners();

    // Render initial page
    renderPage();
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Error initializing app', 'error');
  }
}

// Load platform statistics
async function loadPlatformStats() {
  try {
    const data = await apiRequest('/stats');
    AppState.platformStats = data.stats;
  } catch (error) {
    console.error('Error loading stats:', error);
    // Set default stats if loading fails
    AppState.platformStats = {
      total_users: 0,
      total_exchanges: 0,
      active_exchanges: 0,
      success_rate: 0,
      average_rating: 0
    };
  }
}

// Load skill categories
async function loadCategories() {
  try {
    const data = await apiRequest('/users/categories');
    AppState.skillCategories = data.categories;

    // Populate category filter dropdown
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        AppState.skillCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading categories:', error);
    // Set default categories if loading fails
    AppState.skillCategories = [
      'Programming',
      'Design',
      'Languages',
      'Music',
      'Business',
      'Other'
    ];
    
    // Populate with defaults
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.innerHTML = '<option value="">All Categories</option>' +
        AppState.skillCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
  }
}

// ======================
// EVENT LISTENERS
// ======================

function setupEventListeners() {
  // Navigation links
  document.addEventListener('click', (e) => {
    if (e.target.dataset.page) {
      e.preventDefault();
      navigateToPage(e.target.dataset.page);
    }
  });

  // Mobile navigation toggle
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
  }

  // Forms
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  const resetPasswordForm = document.getElementById('resetPasswordForm');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', handleForgotPasswordSubmit);
  }

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', handleResetPasswordSubmit);
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Search and filters
  const skillSearch = document.getElementById('skillSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const levelFilter = document.getElementById('levelFilter');

  if (skillSearch) {
    skillSearch.addEventListener('input', debounce(filterSkills, 500));
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', filterSkills);
  }

  if (levelFilter) {
    levelFilter.addEventListener('change', filterSkills);
  }

  // Modal close
  const closeModal = document.getElementById('closeModal');
  if (closeModal) {
    closeModal.addEventListener('click', () => {
      document.getElementById('exchangeModal').classList.remove('show');
    });
  }

  // Chat input
  const messageInput = document.getElementById('messageInput');
  const sendMessageBtn = document.getElementById('sendMessageBtn');

  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (sendMessageBtn) {
    sendMessageBtn.addEventListener('click', sendMessage);
  }
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ======================
// AUTHENTICATION
// ======================

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('rememberMe').checked;

  // Frontend validation
  if (!email || !email.includes('@')) {
    showNotification('Please enter a valid email address', 'error');
    return;
  }

  if (!password) {
    showNotification('Please enter your password', 'error');
    return;
  }

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    AppState.token = data.token;
    AppState.currentUser = data.user;
    localStorage.setItem('token', data.token);
    
    // Remember email if checkbox is checked
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }

    updateNavigation();
    showNotification('Welcome back, ' + data.user.name + '!', 'success');
    navigateToPage('dashboard');
  } catch (error) {
    showNotification(error.message || 'Login failed', 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const location = document.getElementById('signupLocation').value.trim();

  // Frontend validation
  if (!name || name.length < 2) {
    showNotification('Name must be at least 2 characters long', 'error');
    return;
  }

  if (!email || !email.includes('@')) {
    showNotification('Please enter a valid email address', 'error');
    return;
  }

  if (!password || password.length < 6) {
    showNotification('Password must be at least 6 characters long', 'error');
    return;
  }

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, location })
    });

    AppState.token = data.token;
    AppState.currentUser = data.user;
    localStorage.setItem('token', data.token);

    updateNavigation();
    
    showNotification('Welcome to SkillSwap, ' + name + '! 🎉', 'success');
    navigateToPage('dashboard');
  } catch (error) {
    showNotification(error.message || 'Signup failed', 'error');
  }
}

function handleLogout() {
  AppState.currentUser = null;
  AppState.token = null;
  localStorage.removeItem('token');
  updateNavigation();
  showNotification('Logged out successfully!', 'success');
  navigateToPage('home');
}

// ======================
// NAVIGATION
// ======================

function navigateToPage(page, userId = null) {
  AppState.currentPage = page;

  // Update active nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.page === page) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Close mobile menu
  const navMenu = document.getElementById('navMenu');
  if (navMenu) {
    navMenu.classList.remove('active');
  }

  // Scroll to top of page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderPage(userId);
}

function renderPage(userId = null) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.style.display = 'none';
  });

  // Show current page
  const currentPageElement = document.getElementById(AppState.currentPage + 'Page');
  if (currentPageElement) {
    currentPageElement.style.display = 'block';
  }

  // Render page content
  switch (AppState.currentPage) {
    case 'home':
      renderHomePage();
      break;
    case 'login':
      loadRememberedEmail();
      break;
    case 'forgotPassword':
      renderForgotPassword();
      break;
    case 'dashboard':
      if (AppState.currentUser) {
        renderDashboard();
      } else {
        navigateToPage('login');
      }
      break;
    case 'marketplace':
      renderMarketplace();
      break;
    case 'profile':
      renderProfile(userId);
      break;
    case 'exchanges':
      if (AppState.currentUser) {
        renderExchanges();
      } else {
        navigateToPage('login');
      }
      break;
    case 'messages':
      if (AppState.currentUser) {
        renderMessages();
      } else {
        navigateToPage('login');
      }
      break;
    case 'settings':
      if (AppState.currentUser) {
        renderSettings();
      } else {
        navigateToPage('login');
      }
      break;
  }
}

function updateNavigation() {
  const navAuth = document.getElementById('navAuth');
  const navUser = document.getElementById('navUser');
  const dashboardLink = document.getElementById('dashboardLink');
  const exchangesLink = document.getElementById('exchangesLink');
  const messagesLink = document.getElementById('messagesLink');
  const profileLink = document.getElementById('profileLink');
  const settingsLink = document.getElementById('settingsLink');
  const userTokens = document.getElementById('userTokens');
  const userAvatar = document.getElementById('userAvatar');

  if (AppState.currentUser) {
    navAuth.style.display = 'none';
    navUser.style.display = 'flex';
    dashboardLink.style.display = 'block';
    exchangesLink.style.display = 'block';
    messagesLink.style.display = 'block';
    profileLink.style.display = 'block';
    settingsLink.style.display = 'block';
    userTokens.textContent = `${AppState.currentUser.tokens_earned} tokens`;
    userAvatar.style.backgroundImage = `url(${AppState.currentUser.avatar})`;
  } else {
    navAuth.style.display = 'flex';
    navUser.style.display = 'none';
    dashboardLink.style.display = 'none';
    exchangesLink.style.display = 'none';
    messagesLink.style.display = 'none';
    profileLink.style.display = 'none';
    settingsLink.style.display = 'none';
  }
}

// ======================
// HOME PAGE
// ======================

async function renderHomePage() {
  try {
    // Load all skills for featured section
    const data = await apiRequest('/users/skills/all');
    AppState.featuredSkills = data.skills.slice(0, 4);

    const featuredSkillsGrid = document.getElementById('featuredSkillsGrid');
    if (featuredSkillsGrid) {
      if (AppState.featuredSkills.length > 0) {
        featuredSkillsGrid.innerHTML = AppState.featuredSkills.map(skill => `
          <div class="skill-card">
            <div class="skill-image" style="background: linear-gradient(135deg, var(--color-primary), var(--color-teal-700));"></div>
            <div class="skill-info">
              <h3 class="skill-name">${skill.name}</h3>
              <p class="skill-provider">by ${skill.user.name}</p>
              <div class="skill-rating">⭐ ${skill.user.rating.toFixed(1)}</div>
            </div>
          </div>
        `).join('');
      } else {
        featuredSkillsGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-text-secondary);">
            <p>No skills available yet. Be the first to add your skills!</p>
          </div>
        `;
      }
    }

    // Update platform stats
    if (AppState.platformStats) {
      const statNumbers = document.querySelectorAll('.stat-number');
      if (statNumbers[0]) statNumbers[0].textContent = AppState.platformStats.total_users?.toLocaleString() || '0';
      if (statNumbers[1]) statNumbers[1].textContent = AppState.platformStats.total_exchanges?.toLocaleString() || '0';
      if (statNumbers[2]) statNumbers[2].textContent = AppState.platformStats.success_rate + '%' || '0%';
    }
  } catch (error) {
    console.error('Error rendering home page:', error);
    
    // Show error-friendly UI instead of crashing
    const featuredSkillsGrid = document.getElementById('featuredSkillsGrid');
    if (featuredSkillsGrid) {
      featuredSkillsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
          <p style="color: var(--color-error); margin-bottom: 10px;">⚠️ Unable to load featured skills</p>
          <p style="color: var(--color-text-secondary); font-size: 14px;">${error.message}</p>
          <button class="btn btn--primary" onclick="renderHomePage()" style="margin-top: 20px;">
            Try Again
          </button>
        </div>
      `;
    }
    
    // Set default stats
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statNumbers[0]) statNumbers[0].textContent = '0';
    if (statNumbers[1]) statNumbers[1].textContent = '0';
    if (statNumbers[2]) statNumbers[2].textContent = '0%';
  }
}

// ======================
// DASHBOARD
// ======================

async function renderDashboard() {
  if (!AppState.currentUser) {
    console.warn('No current user found, redirecting to login');
    navigateToPage('login');
    return;
  }

  const user = AppState.currentUser;

  // Update profile card
  const dashboardAvatar = document.getElementById('dashboardAvatar');
  const dashboardUserName = document.getElementById('dashboardUserName');
  const dashboardUserBio = document.getElementById('dashboardUserBio');
  const userTotalExchanges = document.getElementById('userTotalExchanges');
  const userTokenCount = document.getElementById('userTokenCount');
  const userRating = document.getElementById('userRating');

  if (dashboardAvatar) {
    dashboardAvatar.src = user.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
    dashboardAvatar.alt = user.name || 'User';
  }
  if (dashboardUserName) dashboardUserName.textContent = user.name || 'User';
  if (dashboardUserBio) dashboardUserBio.textContent = user.bio || 'New SkillSwap member';
  if (userTotalExchanges) userTotalExchanges.textContent = user.total_exchanges || 0;
  if (userTokenCount) {
    const tokens = user.tokens_earned || 0;
    userTokenCount.textContent = tokens;
    // Add tooltip showing token info
    userTokenCount.title = `Total Tokens: ${tokens}\nClick to view history`;
    userTokenCount.style.cursor = 'pointer';
    userTokenCount.onclick = () => showTokenHistory();
  }
  if (userRating) userRating.textContent = (user.rating || 0).toFixed(1);

  // Render sections
  renderDashboardSkills();
  await renderRecommendedMatches();
  await renderActiveExchanges();
  renderUserBadges();
  await renderRecentMessages();
  
  // Show profile completion widget for new users
  renderProfileCompletion();
}

// Render dashboard skills section
function renderDashboardSkills() {
  const dashboardSkills = document.getElementById('dashboardSkills');
  if (!dashboardSkills || !AppState.currentUser) return;

  const skills = AppState.currentUser.skills_offered || [];

  if (skills.length === 0) {
    dashboardSkills.innerHTML = `
      <div style="padding: 32px; text-align: center; background: var(--color-surface); border-radius: var(--radius-lg); border: 2px dashed var(--color-card-border);">
        <div style="font-size: 48px; margin-bottom: 12px;">🎯</div>
        <p style="color: var(--color-text-secondary); margin-bottom: 16px; font-weight: 500;">No skills added yet</p>
        <p style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 20px;">Add your first skill to start exchanging with others!</p>
        <button class="btn btn--primary" onclick="showAddSkillModal('offered')">+ Add Your First Skill</button>
      </div>
    `;
    return;
  }

  dashboardSkills.innerHTML = skills.map(skill => `
    <div class="dashboard-skill-item">
      <div class="dashboard-skill-info">
        <div class="dashboard-skill-name">${skill.name}</div>
        <div class="dashboard-skill-level">${skill.experience_level}</div>
        <span class="dashboard-skill-category">📚 ${skill.category}</span>
      </div>
    </div>
  `).join('');
}

// Render profile completion widget
function renderProfileCompletion() {
  if (!AppState.currentUser) return;

  const user = AppState.currentUser;
  const widget = document.getElementById('profileCompletionWidget');
  const tasksContainer = document.getElementById('completionTasks');
  const barFill = document.getElementById('completionBarFill');
  const percentage = document.getElementById('completionPercentage');

  // Calculate profile completion
  const tasks = [
    {
      id: 'avatar',
      icon: '📷',
      text: 'Add profile picture',
      completed: user.avatar && user.avatar !== 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      action: 'Edit Profile',
      onclick: 'showEditProfileModal()'
    },
    {
      id: 'bio',
      icon: '✍️',
      text: 'Write your bio',
      completed: user.bio && user.bio !== 'New SkillSwap member',
      action: 'Add Bio',
      onclick: 'showEditProfileModal()'
    },
    {
      id: 'skills',
      icon: '🎯',
      text: 'Add at least one skill',
      completed: user.skills_offered && user.skills_offered.length > 0,
      action: 'Add Skill',
      onclick: "showAddSkillModal('offered')"
    },
    {
      id: 'location',
      icon: '📍',
      text: 'Set your location',
      completed: user.location && user.location.trim() !== '',
      action: 'Set Location',
      onclick: 'showEditProfileModal()'
    }
  ];

  const completedTasks = tasks.filter(t => t.completed).length;
  const completionPercent = Math.round((completedTasks / tasks.length) * 100);

  // Hide widget if profile is 100% complete or user has dismissed it
  if (completionPercent === 100 || localStorage.getItem('hideProfileCompletion') === 'true') {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = 'block';

  // Update progress bar
  if (barFill) barFill.style.width = `${completionPercent}%`;
  if (percentage) percentage.textContent = `${completionPercent}%`;

  // Render tasks
  if (tasksContainer) {
    tasksContainer.innerHTML = tasks.map(task => `
      <div class="completion-task ${task.completed ? 'completed' : ''}">
        <div class="completion-task-info">
          <span class="completion-task-icon">${task.icon}</span>
          <span class="completion-task-text">${task.text}</span>
        </div>
        <button class="completion-task-action" onclick="${task.onclick}">
          ${task.completed ? '✓ Done' : task.action}
        </button>
      </div>
    `).join('');
  }
}

// Hide profile completion widget
function hideProfileCompletion() {
  localStorage.setItem('hideProfileCompletion', 'true');
  document.getElementById('profileCompletionWidget').style.display = 'none';
}

// Show token history modal
async function showTokenHistory() {
  try {
    const data = await apiRequest(`/users/${AppState.currentUser._id}/tokens`);
    const tokenData = data.tokens;

    const historyHTML = tokenData.history.length > 0
      ? tokenData.history.slice(0, 10).map(entry => `
          <div style="padding: 12px; border-bottom: 1px solid var(--color-card-border); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 500;">${entry.reason}</div>
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">
                ${new Date(entry.date).toLocaleDateString()} - ${entry.type}
              </div>
            </div>
            <div style="font-weight: 600; font-size: 18px; color: ${entry.amount > 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${entry.amount > 0 ? '+' : ''}${entry.amount}
            </div>
          </div>
        `).join('')
      : '<div style="padding: 24px; text-align: center; color: var(--color-text-secondary);">No token history yet</div>';

    showNotification(`Token Balance: ${tokenData.current} | Total Earned: ${tokenData.total_earned}`, 'success');
  } catch (error) {
    showNotification('Failed to load token history', 'error');
  }
}

async function renderRecommendedMatches() {
  const recommendedMatches = document.getElementById('recommendedMatches');
  if (!recommendedMatches || !AppState.currentUser) return;

  try {
    const data = await apiRequest('/users/matches/recommendations');
    const matches = data.matches;

    recommendedMatches.innerHTML = matches.length > 0
      ? matches.slice(0, 3).map(match => `
          <div class="match-card" style="background: var(--color-surface); padding: 16px; border-radius: var(--radius-lg); margin-bottom: 12px; border: 1px solid var(--color-card-border);">
            <div class="flex items-center gap-8 mb-8">
              <img src="${match.user.avatar}" alt="${match.user.name}"
                   style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
              <div>
                <div style="font-weight: 500;">${match.user.name}</div>
                <div style="font-size: 12px; color: var(--color-text-secondary);">
                  ${match.matchedSkills[0]?.skill.name} • ${match.matchedSkills[0]?.skill.experience_level}
                </div>
              </div>
            </div>
            <p style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 12px;">
              ${match.matchedSkills[0]?.skill.description}
            </p>
            <button class="btn btn--primary btn--sm" onclick="openExchangeModal('${match.user._id}', '${match.matchedSkills[0]?.skill.name}')">
              Send Request
            </button>
          </div>
        `).join('')
      : '<p style="color: var(--color-text-secondary);">No matches found. Update your wanted skills to get recommendations.</p>';
  } catch (error) {
    recommendedMatches.innerHTML = '<p style="color: var(--color-text-secondary);">Error loading matches</p>';
  }
}

async function renderActiveExchanges() {
  const activeExchanges = document.getElementById('activeExchanges');
  if (!activeExchanges || !AppState.currentUser) return;

  try {
    const data = await apiRequest('/exchanges?status=active');
    const exchanges = data.exchanges;

    activeExchanges.innerHTML = exchanges.length > 0
      ? exchanges.map(exchange => {
          const otherUser = exchange.requester_id._id === AppState.currentUser._id
            ? exchange.provider_id
            : exchange.requester_id;

          return `
            <div class="exchange-card" style="background: var(--color-surface); padding: 16px; border-radius: var(--radius-lg); margin-bottom: 12px; border: 1px solid var(--color-card-border);">
              <div class="flex items-center gap-8 mb-8">
                <img src="${otherUser.avatar}" alt="${otherUser.name}"
                     style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                <div>
                  <div style="font-weight: 500;">${otherUser.name}</div>
                  <div style="font-size: 12px; color: var(--color-text-secondary);">
                    Learning: ${exchange.requested_skill}
                  </div>
                </div>
              </div>
              <button class="btn btn--outline btn--sm" onclick="navigateToPage('messages')">
                View Messages
              </button>
            </div>
          `;
        }).join('')
      : '<p style="color: var(--color-text-secondary);">No active exchanges.</p>';
  } catch (error) {
    activeExchanges.innerHTML = '<p style="color: var(--color-text-secondary);">Error loading exchanges</p>';
  }
}

function renderUserBadges() {
  const userBadges = document.getElementById('userBadges');
  if (!userBadges || !AppState.currentUser) return;

  // Ensure badges array exists, default to ['New Member'] for new users
  const badges = AppState.currentUser.badges || ['New Member'];

  userBadges.innerHTML = badges.length > 0
    ? badges.map(badge => `
        <div class="badge" style="display: inline-block; background: var(--color-secondary); padding: 6px 12px; border-radius: var(--radius-full); font-size: 12px; margin-right: 8px; margin-bottom: 8px;">${badge}</div>
      `).join('')
    : '<p style="color: var(--color-text-secondary);">No badges earned yet.</p>';
}

async function renderRecentMessages() {
  const recentMessages = document.getElementById('recentMessages');
  if (!recentMessages || !AppState.currentUser) return;

  try {
    const data = await apiRequest('/conversations');
    const conversations = data.conversations.slice(0, 3);

    recentMessages.innerHTML = conversations.length > 0
      ? conversations.map(conv => {
          const otherUser = conv.participants.find(p => p._id !== AppState.currentUser._id);
          return `
            <div class="message-preview" style="background: var(--color-surface); padding: 12px; border-radius: var(--radius-lg); margin-bottom: 8px; cursor: pointer; border: 1px solid var(--color-card-border);" onclick="navigateToPage('messages')">
              <div class="flex items-center gap-8">
                <img src="${otherUser.avatar}" alt="${otherUser.name}"
                     style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <div style="flex: 1;">
                  <div style="font-size: 13px; font-weight: 500;">${otherUser.name}</div>
                  <div style="font-size: 11px; color: var(--color-text-secondary);">
                    ${conv.lastMessage?.content?.substring(0, 50) || 'No messages yet'}...
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')
      : '<p style="color: var(--color-text-secondary);">No recent messages</p>';
  } catch (error) {
    recentMessages.innerHTML = '<p style="color: var(--color-text-secondary);">Error loading messages</p>';
  }
}

// ======================
// MARKETPLACE
// ======================

async function renderMarketplace() {
  await loadCategories();
  await filterSkills();
}

async function filterSkills() {
  const skillSearch = document.getElementById('skillSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const levelFilter = document.getElementById('levelFilter');
  const skillsMarketplace = document.getElementById('skillsMarketplace');

  if (!skillsMarketplace) return;

  try {
    const params = new URLSearchParams();
    if (skillSearch?.value) params.append('search', skillSearch.value);
    if (categoryFilter?.value) params.append('category', categoryFilter.value);
    if (levelFilter?.value) params.append('level', levelFilter.value);

    const data = await apiRequest(`/users/skills/all?${params.toString()}`);
    let skills = data.skills;

    // Apply frontend filtering
    if (skillSearch?.value) {
      const searchTerm = skillSearch.value.toLowerCase();
      skills = skills.filter(skill =>
        skill.name.toLowerCase().includes(searchTerm) ||
        skill.description.toLowerCase().includes(searchTerm)
      );
    }

    if (categoryFilter?.value) {
      skills = skills.filter(skill => skill.category === categoryFilter.value);
    }

    if (levelFilter?.value) {
      skills = skills.filter(skill => skill.experience_level === levelFilter.value);
    }

    renderSkillsGrid(skills);
  } catch (error) {
    console.error('Error filtering skills:', error);
    skillsMarketplace.innerHTML = '<p style="color: var(--color-text-secondary);">Error loading skills</p>';
  }
}

function renderSkillsGrid(skills) {
  const skillsMarketplace = document.getElementById('skillsMarketplace');
  if (!skillsMarketplace) return;

  if (!skills || skills.length === 0) {
    skillsMarketplace.innerHTML = '<p style="color: var(--color-text-secondary); padding: 20px;">No skills found matching your criteria.</p>';
    return;
  }

  skillsMarketplace.innerHTML = skills.map(skill => `
    <div class="marketplace-skill-card">
      <div class="skill-header">
        <img src="${skill.user.avatar}" alt="${skill.user.name}" class="skill-avatar">
        <div class="skill-meta">
          <h3 class="skill-title">${skill.name}</h3>
          <p class="skill-user">by ${skill.user.name}</p>
        </div>
      </div>
      <div class="skill-category" style="background: var(--color-bg-1);">${skill.category}</div>
      <p class="skill-description">${skill.description}</p>
      <div class="skill-footer">
        <span class="skill-level">${skill.experience_level}</span>
        <span style="color: var(--color-warning);">⭐ ${skill.user.rating.toFixed(1)}</span>
      </div>
      <button class="btn btn--primary btn--sm" style="width: 100%; margin-top: 12px;" onclick="openExchangeModal('${skill.user._id}', '${skill.name}')">
        Request Exchange
      </button>
    </div>
  `).join('');
}

// ======================
// PROFILE
// ======================

async function renderProfile(userId) {
  const profileContainer = document.getElementById('profileContainer');
  if (!profileContainer) return;

  try {
    const data = await apiRequest(`/users/${userId || AppState.currentUser._id}`);
    const user = data.user;
    const isOwnProfile = !userId || userId === AppState.currentUser._id;

    // Use fallbacks for all user data to prevent undefined values
    const displayName = user.name || 'User';
    const displayBio = user.bio || 'No bio available';
    const displayAvatar = user.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
    const displayExchanges = user.total_exchanges || 0;
    const displayTokens = user.tokens_earned || 0;
    const displayRating = (user.rating || 0).toFixed(1);
    const displayBadges = user.badges || ['New Member'];
    const displaySkillsOffered = user.skills_offered || [];
    const displaySkillsWanted = user.skills_wanted || [];

    profileContainer.innerHTML = `
      <div class="profile-header">
        <img src="${displayAvatar}" alt="${displayName}" class="profile-avatar">
        <div class="profile-info">
          <h1 class="profile-name">${displayName}</h1>
          <p class="profile-bio">${displayBio}</p>
          ${isOwnProfile ? `<button class="btn btn--secondary btn--sm" onclick="showEditProfileModal()" style="margin-top: 12px;">Edit Profile</button>` : ''}
          <div class="profile-stats">
            <div class="profile-stat">
              <span class="profile-stat-number">${displayExchanges}</span>
              <span class="profile-stat-label">Exchanges</span>
            </div>
            <div class="profile-stat">
              <span class="profile-stat-number">${displayTokens}</span>
              <span class="profile-stat-label">Tokens</span>
            </div>
            <div class="profile-stat">
              <span class="profile-stat-number">${displayRating}</span>
              <span class="profile-stat-label">Rating</span>
            </div>
          </div>
        </div>
      </div>

      <div class="profile-content">
        <div class="profile-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>Skills Offered</h3>
            ${isOwnProfile ? `<button class="btn btn--primary btn--sm" onclick="showAddSkillModal('offered')">+ Add Skill</button>` : ''}
          </div>
          ${displaySkillsOffered.length > 0
            ? displaySkillsOffered.map(skill => `
                <div class="skill-item">
                  <div class="skill-item-header">
                    <span class="skill-item-name">${skill.name}</span>
                    <span class="skill-item-level">${skill.experience_level}</span>
                  </div>
                  <p class="skill-item-description">${skill.description}</p>
                  <p class="skill-item-category" style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">📚 ${skill.category}</p>
                </div>
              `).join('')
            : `<div style="padding: 24px; text-align: center; background: var(--color-surface); border-radius: var(--radius-lg); border: 2px dashed var(--color-card-border);">
                <p style="color: var(--color-text-secondary); margin-bottom: 12px;">🎯 No skills offered yet</p>
                ${isOwnProfile ? '<p style="font-size: 14px; color: var(--color-text-secondary);">Add your first skill to start exchanging with others!</p>' : ''}
              </div>`}
        </div>

        <div class="profile-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>Skills Wanted</h3>
            ${isOwnProfile ? `<button class="btn btn--primary btn--sm" onclick="showAddSkillModal('wanted')">+ Add Skill</button>` : ''}
          </div>
          ${displaySkillsWanted.length > 0
            ? displaySkillsWanted.map(skill => `
                <div class="skill-item">
                  <div class="skill-item-header">
                    <span class="skill-item-name">${skill.name}</span>
                    <span class="skill-item-level">${skill.experience_level}</span>
                  </div>
                  <p class="skill-item-description">${skill.description}</p>
                  <p class="skill-item-category" style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">📚 ${skill.category}</p>
                </div>
              `).join('')
            : `<div style="padding: 24px; text-align: center; background: var(--color-surface); border-radius: var(--radius-lg); border: 2px dashed var(--color-card-border);">
                <p style="color: var(--color-text-secondary); margin-bottom: 12px;">🎓 No skills wanted yet</p>
                ${isOwnProfile ? '<p style="font-size: 14px; color: var(--color-text-secondary);">Add skills you want to learn!</p>' : ''}
              </div>`}
        </div>

        <div class="profile-section">
          <h3>Badges</h3>
          <div class="badges-grid">
            ${displayBadges.length > 0
              ? displayBadges.map(badge => `<div class="badge">🏆 ${badge}</div>`).join('')
              : '<p style="color: var(--color-text-secondary);">No badges yet - complete exchanges to earn them!</p>'}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading profile:', error);
    profileContainer.innerHTML = '<p style="color: var(--color-error); padding: 20px;">Error loading profile</p>';
  }
}

// ======================
// EXCHANGES
// ======================

let currentExchangeFilter = 'all';

async function renderExchanges() {
  const exchangesList = document.getElementById('exchangesList');
  if (!exchangesList || !AppState.currentUser) return;

  try {
    // Fetch exchanges based on current filter
    const endpoint = currentExchangeFilter === 'all' 
      ? '/exchanges' 
      : `/exchanges?status=${currentExchangeFilter}`;
    
    const data = await apiRequest(endpoint);
    const exchanges = data.exchanges;

    if (exchanges.length === 0) {
      exchangesList.innerHTML = `
        <div class="exchanges-empty">
          <div class="exchanges-empty-icon">🤝</div>
          <h3>No ${currentExchangeFilter === 'all' ? '' : currentExchangeFilter} exchanges yet</h3>
          <p>Start exchanging skills with others in the marketplace!</p>
          <button class="btn btn--primary" onclick="navigateToPage('marketplace')">
            Browse Marketplace
          </button>
        </div>
      `;
      return;
    }

    exchangesList.innerHTML = exchanges.map(exchange => {
      const isRequester = exchange.requester_id._id === AppState.currentUser._id;
      const otherUser = isRequester ? exchange.provider_id : exchange.requester_id;
      const myRole = isRequester ? 'Learning' : 'Teaching';
      const mySkill = isRequester ? exchange.requested_skill : exchange.offered_skill;

      return `
        <div class="exchange-item">
          <div class="exchange-header">
            <div class="exchange-user-info">
              <img src="${otherUser.avatar}" alt="${otherUser.name}" class="exchange-avatar">
              <div class="exchange-user-details">
                <h3>${otherUser.name}</h3>
                <div class="exchange-user-rating">
                  ⭐ ${(otherUser.rating || 0).toFixed(1)} • ${otherUser.total_exchanges || 0} exchanges
                </div>
              </div>
            </div>
            <span class="exchange-status-badge exchange-status-${exchange.status}">
              ${exchange.status}
            </span>
          </div>

          <div class="exchange-body">
            <div class="exchange-skills">
              <div class="exchange-skill-box">
                <div class="exchange-skill-label">${isRequester ? 'You Learn' : 'You Teach'}</div>
                <div class="exchange-skill-name">${isRequester ? exchange.requested_skill : exchange.offered_skill}</div>
              </div>
              <div class="exchange-arrow">⇄</div>
              <div class="exchange-skill-box">
                <div class="exchange-skill-label">${isRequester ? 'They Teach' : 'They Learn'}</div>
                <div class="exchange-skill-name">${isRequester ? exchange.offered_skill : exchange.requested_skill}</div>
              </div>
            </div>

            <div class="exchange-meta">
              <div class="exchange-meta-item">
                <span>📅</span>
                <span>Created ${new Date(exchange.created_date).toLocaleDateString()}</span>
              </div>
              ${exchange.completed_date ? `
                <div class="exchange-meta-item">
                  <span>✅</span>
                  <span>Completed ${new Date(exchange.completed_date).toLocaleDateString()}</span>
                </div>
              ` : ''}
            </div>

            ${exchange.rating ? `
              <div class="exchange-rating-display">
                <div class="exchange-rating-stars">
                  ${'⭐'.repeat(exchange.rating)}${'☆'.repeat(5 - exchange.rating)}
                </div>
                ${exchange.review ? `
                  <div class="exchange-rating-review">"${exchange.review}"</div>
                ` : ''}
              </div>
            ` : ''}
          </div>

          <div class="exchange-actions">
            ${renderExchangeActions(exchange, isRequester)}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading exchanges:', error);
    exchangesList.innerHTML = '<p style="color: var(--color-error); text-align: center; padding: 40px;">Error loading exchanges</p>';
  }
}

function renderExchangeActions(exchange, isRequester) {
  const buttons = [];

  // Pending status - Provider can accept/reject, Requester can cancel
  if (exchange.status === 'pending') {
    if (!isRequester) {
      buttons.push(`
        <button class="btn btn--primary" onclick="updateExchangeStatus('${exchange._id}', 'active')">
          ✓ Accept Request
        </button>
        <button class="btn btn--outline" onclick="updateExchangeStatus('${exchange._id}', 'rejected')">
          ✗ Decline
        </button>
      `);
    } else {
      buttons.push(`
        <button class="btn btn--outline" onclick="cancelExchange('${exchange._id}')">
          Cancel Request
        </button>
      `);
    }
  }

  // Active status - Both can complete
  if (exchange.status === 'active') {
    buttons.push(`
      <button class="btn btn--primary" onclick="updateExchangeStatus('${exchange._id}', 'completed')">
        ✓ Mark as Complete
      </button>
      <button class="btn btn--outline" onclick="navigateToPage('messages')">
        💬 View Messages
      </button>
    `);
  }

  // Completed status - Can rate if not already rated
  if (exchange.status === 'completed' && !exchange.rating && isRequester) {
    buttons.push(`
      <button class="btn btn--primary" onclick="showRatingModal('${exchange._id}', '${exchange.provider_id.name}')">
        ⭐ Rate Exchange
      </button>
    `);
  }

  // All non-pending exchanges can be messaged
  if (exchange.status !== 'pending' && exchange.status !== 'cancelled') {
    if (buttons.length === 0) {
      buttons.push(`
        <button class="btn btn--outline" onclick="navigateToPage('messages')">
          💬 View Messages
        </button>
      `);
    }
  }

  return buttons.join('');
}

function switchExchangeTab(filter) {
  currentExchangeFilter = filter;
  
  // Update active tab
  document.querySelectorAll('.exchange-tab').forEach(tab => {
    if (tab.dataset.tab === filter) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Re-render exchanges
  renderExchanges();
}

async function updateExchangeStatus(exchangeId, status) {
  try {
    const data = await apiRequest(`/exchanges/${exchangeId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    // Refresh user data to get updated stats
    await checkAuth();

    // Show success notification with details
    if (status === 'completed') {
      showNotification('🎉 Exchange completed! Tokens and stats updated!', 'success');
      // Refresh dashboard stats
      if (AppState.currentPage === 'dashboard') {
        renderDashboard();
      }
    } else if (status === 'active') {
      showNotification('✅ Exchange accepted! You can now start exchanging skills.', 'success');
    } else {
      showNotification(`Exchange ${status} successfully!`, 'success');
    }

    // Re-render exchanges
    renderExchanges();
  } catch (error) {
    showNotification(error.message || 'Failed to update exchange', 'error');
  }
}

async function cancelExchange(exchangeId) {
  if (!confirm('Are you sure you want to cancel this exchange request?')) {
    return;
  }

  try {
    await apiRequest(`/exchanges/${exchangeId}`, {
      method: 'DELETE'
    });

    showNotification('Exchange request cancelled', 'success');
    renderExchanges();
  } catch (error) {
    showNotification(error.message || 'Failed to cancel exchange', 'error');
  }
}

// Rating Modal Functions
function showRatingModal(exchangeId, userName) {
  const modal = document.getElementById('ratingModal');
  const modalContent = document.getElementById('ratingModalContent');

  modalContent.innerHTML = `
    <div class="rating-form">
      <p style="text-align: center; margin-bottom: 20px;">
        How was your experience exchanging skills with <strong>${userName}</strong>?
      </p>

      <div class="rating-stars" id="ratingStars">
        ${[1, 2, 3, 4, 5].map(star => `
          <span class="rating-star" data-rating="${star}" onclick="selectRating(${star})">☆</span>
        `).join('')}
      </div>

      <div class="form-group">
        <label class="form-label">Review (Optional)</label>
        <textarea class="form-control" id="reviewText" rows="4" 
                  placeholder="Share your experience..."></textarea>
      </div>

      <div style="display: flex; gap: 12px;">
        <button class="btn btn--primary" style="flex: 1;" onclick="submitRating('${exchangeId}')">
          Submit Rating
        </button>
        <button class="btn btn--outline" onclick="closeRatingModal()">
          Cancel
        </button>
      </div>
    </div>
  `;

  modal.classList.add('show');
  AppState.selectedRating = 0;
}

function selectRating(rating) {
  AppState.selectedRating = rating;

  // Update star display
  document.querySelectorAll('.rating-star').forEach((star, index) => {
    if (index < rating) {
      star.classList.add('active');
      star.textContent = '⭐';
    } else {
      star.classList.remove('active');
      star.textContent = '☆';
    }
  });
}

async function submitRating(exchangeId) {
  if (!AppState.selectedRating || AppState.selectedRating === 0) {
    showNotification('Please select a rating', 'error');
    return;
  }

  const review = document.getElementById('reviewText').value.trim();

  try {
    await apiRequest(`/exchanges/${exchangeId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        rating: AppState.selectedRating,
        review: review || undefined
      })
    });

    closeRatingModal();
    showNotification('⭐ Rating submitted! Thank you for your feedback.', 'success');

    // Refresh exchanges
    renderExchanges();
  } catch (error) {
    showNotification(error.message || 'Failed to submit rating', 'error');
  }
}

function closeRatingModal() {
  document.getElementById('ratingModal').classList.remove('show');
  AppState.selectedRating = 0;
}

// ======================
// SETTINGS
// ======================

async function renderSettings() {
  if (!AppState.currentUser) return;

  // Load current email preferences
  const prefs = AppState.currentUser.emailNotifications || {};

  // Set toggle values
  document.getElementById('exchangeRequests').checked = prefs.exchangeRequests !== false;
  document.getElementById('exchangeAccepted').checked = prefs.exchangeAccepted !== false;
  document.getElementById('exchangeCompleted').checked = prefs.exchangeCompleted !== false;
  document.getElementById('newRatings').checked = prefs.newRatings !== false;
  document.getElementById('newMessages').checked = prefs.newMessages !== false;
  document.getElementById('marketingEmails').checked = prefs.marketingEmails === true;
}

async function saveEmailPreferences() {
  if (!AppState.currentUser) return;

  const emailNotifications = {
    exchangeRequests: document.getElementById('exchangeRequests').checked,
    exchangeAccepted: document.getElementById('exchangeAccepted').checked,
    exchangeCompleted: document.getElementById('exchangeCompleted').checked,
    newRatings: document.getElementById('newRatings').checked,
    newMessages: document.getElementById('newMessages').checked,
    marketingEmails: document.getElementById('marketingEmails').checked
  };

  try {
    await apiRequest(`/users/${AppState.currentUser._id}/email-preferences`, {
      method: 'PUT',
      body: JSON.stringify({ emailNotifications })
    });

    // Update current user state
    AppState.currentUser.emailNotifications = emailNotifications;

    showNotification('✅ Email preferences saved successfully!', 'success');
  } catch (error) {
    showNotification(error.message || 'Failed to save preferences', 'error');
  }
}

// ======================
// MESSAGES
// ======================

async function renderMessages() {
  if (!AppState.currentUser) return;

  await renderConversationsList();
}

async function renderConversationsList() {
  const conversationsList = document.getElementById('conversationsList');
  if (!conversationsList) return;

  try {
    const data = await apiRequest('/conversations');
    AppState.conversations = data.conversations;

    if (AppState.conversations.length === 0) {
      conversationsList.innerHTML = '<p style="padding: 16px; color: var(--color-text-secondary);">No conversations yet</p>';
      return;
    }

    conversationsList.innerHTML = AppState.conversations.map(conv => {
      const otherUser = conv.participants.find(p => p._id !== AppState.currentUser._id);
      return `
        <div class="conversation-item ${conv._id === AppState.activeConversation?._id ? 'active' : ''}"
             onclick="selectConversation('${conv._id}')">
          <img src="${otherUser.avatar}" alt="${otherUser.name}" class="conversation-avatar">
          <div class="conversation-info">
            <div class="conversation-name">${otherUser.name}</div>
            <div class="conversation-preview">${conv.lastMessage?.content?.substring(0, 40) || 'No messages'}...</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    conversationsList.innerHTML = '<p style="padding: 16px; color: var(--color-error);">Error loading conversations</p>';
  }
}

async function selectConversation(conversationId) {
  try {
    const data = await apiRequest(`/conversations/${conversationId}`);
    AppState.activeConversation = data.conversation;

    const exchangeData = await apiRequest(`/conversations/exchange/${AppState.activeConversation.exchange_id._id}`);

    // Update UI
    const chatHeader = document.getElementById('chatHeader');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatUserName = document.getElementById('chatUserName');

    const otherUser = AppState.activeConversation.participants.find(p => p._id !== AppState.currentUser._id);

    chatHeader.style.display = 'flex';
    chatInput.style.display = 'flex';
    chatAvatar.src = otherUser.avatar;
    chatUserName.textContent = otherUser.name;

    chatMessages.innerHTML = exchangeData.messages.map(msg => `
      <div class="message ${msg.user_id._id === AppState.currentUser._id ? 'own' : ''}">
        <img src="${msg.user_id.avatar}" alt="${msg.user_id.name}" class="message-avatar">
        <div class="message-content">
          <div class="message-bubble">${msg.message}</div>
          <div class="message-time">${new Date(msg.timestamp).toLocaleString()}</div>
        </div>
      </div>
    `).join('');

    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Update conversation list
    renderConversationsList();
  } catch (error) {
    showNotification('Error loading conversation', 'error');
  }
}

async function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  if (!messageInput || !messageInput.value.trim() || !AppState.activeConversation) return;

  try {
    await apiRequest(`/exchanges/${AppState.activeConversation.exchange_id._id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: messageInput.value.trim() })
    });

    messageInput.value = '';
    await selectConversation(AppState.activeConversation._id);
  } catch (error) {
    showNotification('Error sending message', 'error');
  }
}

// ======================
// EXCHANGE MODAL
// ======================

async function openExchangeModal(userId, skillName = '') {
  try {
    const data = await apiRequest(`/users/${userId}`);
    const user = data.user;

    const modalContent = document.getElementById('exchangeModalContent');
    modalContent.innerHTML = `
      <div class="flex items-center gap-16 mb-16">
        <img src="${user.avatar}" alt="${user.name}"
             style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover;">
        <div>
          <h4 style="margin: 0 0 4px 0;">${user.name}</h4>
          <p style="margin: 0; color: var(--color-text-secondary); font-size: 14px;">${user.location || 'Location not specified'}</p>
          <p style="margin: 4px 0 0 0; color: var(--color-warning);">⭐ ${user.rating.toFixed(1)} • ${user.total_exchanges} exchanges</p>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Skill you want to learn</label>
        <select class="form-control" id="modalRequestedSkill">
          <option value="">Select a skill</option>
          ${user.skills_offered.map(skill =>
            `<option value="${skill.name}" ${skill.name === skillName ? 'selected' : ''}>${skill.name} (${skill.experience_level})</option>`
          ).join('')}
        </select>
      </div>

      ${AppState.currentUser ? `
        <div class="form-group">
          <label class="form-label">Skill you can offer in exchange</label>
          <select class="form-control" id="modalOfferedSkill">
            <option value="">Select a skill</option>
            ${AppState.currentUser.skills_offered.map(skill =>
              `<option value="${skill.name}">${skill.name} (${skill.experience_level})</option>`
            ).join('')}
          </select>
        </div>

        <button class="btn btn--primary btn--full-width" onclick="sendExchangeRequest('${userId}')">
          Send Exchange Request
        </button>
      ` : `
        <p style="text-align: center; color: var(--color-text-secondary); margin: 20px 0;">
          Please <a href="#" data-page="login" style="color: var(--color-primary);">login</a> to send exchange requests
        </p>
      `}
    `;

    document.getElementById('exchangeModal').classList.add('show');
  } catch (error) {
    showNotification('Error loading user details', 'error');
  }
}

async function sendExchangeRequest(userId) {
  const requestedSkill = document.getElementById('modalRequestedSkill').value;
  const offeredSkill = document.getElementById('modalOfferedSkill').value;

  if (!requestedSkill || !offeredSkill) {
    showNotification('Please select both skills', 'error');
    return;
  }

  try {
    await apiRequest('/exchanges', {
      method: 'POST',
      body: JSON.stringify({
        provider_id: userId,
        requested_skill: requestedSkill,
        offered_skill: offeredSkill
      })
    });

    document.getElementById('exchangeModal').classList.remove('show');
    showNotification('Exchange request sent successfully!', 'success');

    if (AppState.currentPage === 'dashboard') {
      renderDashboard();
    }
  } catch (error) {
    showNotification(error.message || 'Error sending request', 'error');
  }
}

// ======================
// ACCOUNT RECOVERY
// ======================

function showForgotPassword() {
  navigateToPage('forgotPasswordPage');
  renderForgotPassword();
  updateStepIndicator(1);
}

// Current recovery method
let currentRecoveryMethod = 'email';
let isDemoAccountsVisible = false;

// Toggle demo accounts section
function toggleDemoAccounts() {
  isDemoAccountsVisible = !isDemoAccountsVisible;
  const demoSection = document.getElementById('demo-accounts-section');
  const toggleIcon = document.getElementById('demo-toggle-icon');
  
  if (isDemoAccountsVisible) {
    demoSection.style.display = 'block';
    toggleIcon.style.transform = 'rotate(180deg)';
  } else {
    demoSection.style.display = 'none';
    toggleIcon.style.transform = 'rotate(0deg)';
  }
}

// Update step indicator
function updateStepIndicator(step) {
  const progressBar = document.getElementById('progress-bar');
  const steps = document.querySelectorAll('.step-item');
  
  // Update progress bar
  const progress = ((step - 1) / 2) * 100;
  if (progressBar) progressBar.style.width = `${progress}%`;
  
  // Update step items
  steps.forEach((stepItem, index) => {
    const stepNumber = index + 1;
    const circle = stepItem.querySelector('div');
    
    if (stepNumber <= step) {
      circle.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
      circle.style.color = 'white';
      circle.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
      stepItem.classList.add('active');
    } else {
      circle.style.background = 'var(--color-surface)';
      circle.style.color = 'var(--color-text-secondary)';
      circle.style.boxShadow = 'none';
      stepItem.classList.remove('active');
    }
  });
}

// Switch recovery method with animation
function switchRecoveryMethod(method) {
  currentRecoveryMethod = method;
  
  // Update card styling
  document.querySelectorAll('.recovery-card').forEach(card => {
    const checkMark = card.querySelector('.check-mark');
    if (card.dataset.method === method) {
      card.classList.add('active');
      card.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))';
      card.style.borderColor = 'var(--color-primary)';
      card.style.boxShadow = '0 10px 30px rgba(102, 126, 234, 0.3)';
      if (checkMark) checkMark.style.display = 'flex';
    } else {
      card.classList.remove('active');
      card.style.background = 'var(--color-surface)';
      card.style.borderColor = 'transparent';
      card.style.boxShadow = 'none';
      if (checkMark) checkMark.style.display = 'none';
    }
  });
  
  // Show/hide input fields with animation
  document.querySelectorAll('.recovery-method').forEach(methodDiv => {
    if (methodDiv.id === `${method}-method`) {
      methodDiv.style.display = 'block';
      methodDiv.style.animation = 'fadeInUp 0.5s';
    } else {
      methodDiv.style.display = 'none';
    }
  });
  
  // Clear all inputs
  document.getElementById('forgotEmail').value = '';
  document.getElementById('forgotUsername').value = '';
  document.getElementById('forgotPhone').value = '';
}

async function renderForgotPassword() {
  // Wait for DOM to be ready
  setTimeout(() => {
    const testAccountsList = document.getElementById('testAccountsList');
    if (!testAccountsList) {
      console.error('testAccountsList element not found');
      return;
    }
    
    // Demo accounts with credentials (for testing only)
    const demoAccounts = [
      { name: 'Sarah Chen', email: 'sarah@example.com', username: 'sarah_chen', phone: '+1-555-0101', role: 'React Developer', avatar: '👩‍💻' },
      { name: 'Miguel Rodriguez', email: 'miguel@example.com', username: 'miguel_dev', phone: '+1-555-0102', role: 'UX Designer', avatar: '👨‍🎨' },
      { name: 'Priya Patel', email: 'priya@example.com', username: 'priya_data', phone: '+1-555-0103', role: 'Data Scientist', avatar: '👩‍🔬' },
      { name: 'James Wilson', email: 'james@example.com', username: 'james_marketing', phone: '+1-555-0104', role: 'Marketing Expert', avatar: '👨‍💼' },
      { name: 'Lisa Kim', email: 'lisa@example.com', username: 'lisa_teacher', phone: '+1-555-0105', role: 'Language Teacher', avatar: '👩‍🏫' }
    ];
  
    testAccountsList.innerHTML = demoAccounts.map(account => `
      <div onclick="useAccount('${account.email}', '${account.username}', '${account.phone}')" style="cursor: pointer; background: white; padding: 14px; border-radius: var(--radius-md); border: 2px solid var(--color-card-border); transition: all 0.3s; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), transparent); opacity: 0; transition: opacity 0.3s;"></div>
        <div style="display: flex; align-items: center; gap: 12px; position: relative;">
          <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
            ${account.avatar}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--color-text); margin-bottom: 4px; font-size: 14px;">${account.name}</div>
            <div style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.4;">
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                <span style="opacity: 0.7;">📧</span>
                <span>${account.email}</span>
              </div>
              <div style="display: flex; gap: 12px;">
                <span style="opacity: 0.7;">👤 ${account.username}</span>
                <span style="opacity: 0.7;">📱 ${account.phone}</span>
              </div>
            </div>
          </div>
          <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; white-space: nowrap;">
            Use →
          </div>
        </div>
      </div>
    `).join('');
    
    // Add hover effect
    const cards = testAccountsList.querySelectorAll('div[onclick]');
    cards.forEach(card => {
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateX(5px)';
        this.style.borderColor = 'var(--color-primary)';
        this.style.boxShadow = '0 5px 20px rgba(102, 126, 234, 0.2)';
        this.querySelector('div[style*="opacity: 0"]').style.opacity = '1';
      });
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateX(0)';
        this.style.borderColor = 'var(--color-card-border)';
        this.style.boxShadow = 'none';
        this.querySelector('div[style*="opacity"]').style.opacity = '0';
      });
    });
  }, 100);
}

function useAccount(email, username, phone) {
  // Fill the current recovery method field
  if (currentRecoveryMethod === 'email') {
    document.getElementById('forgotEmail').value = email;
  } else if (currentRecoveryMethod === 'username') {
    document.getElementById('forgotUsername').value = username;
  } else if (currentRecoveryMethod === 'phone') {
    document.getElementById('forgotPhone').value = phone;
  }
  
  // Highlight the filled input
  const activeInput = document.getElementById(`forgot${currentRecoveryMethod.charAt(0).toUpperCase() + currentRecoveryMethod.slice(1)}`);
  if (activeInput) {
    activeInput.style.borderColor = 'var(--color-primary)';
    activeInput.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
    setTimeout(() => {
      activeInput.style.borderColor = '';
      activeInput.style.boxShadow = '';
    }, 1500);
  }
  
  showNotification(`✅ ${currentRecoveryMethod.toUpperCase()} auto-filled! Click "Send Recovery Link" to proceed.`, 'success');
  
  // Scroll to form
  document.getElementById('forgotPasswordForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function loadRememberedEmail() {
  const rememberedEmail = localStorage.getItem('rememberedEmail');
  if (rememberedEmail) {
    const emailInput = document.getElementById('loginEmail');
    const rememberCheckbox = document.getElementById('rememberMe');
    if (emailInput) {
      emailInput.value = rememberedEmail;
      if (rememberCheckbox) rememberCheckbox.checked = true;
    }
  }
}

// Password Reset Functions
async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  
  // Update step indicator
  updateStepIndicator(2);
  
  // Get identifier based on current method
  let identifier = '';
  let inputField = null;
  
  if (currentRecoveryMethod === 'email') {
    identifier = document.getElementById('forgotEmail').value;
    inputField = document.getElementById('forgotEmail');
  } else if (currentRecoveryMethod === 'username') {
    identifier = document.getElementById('forgotUsername').value;
    inputField = document.getElementById('forgotUsername');
  } else if (currentRecoveryMethod === 'phone') {
    identifier = document.getElementById('forgotPhone').value;
    inputField = document.getElementById('forgotPhone');
  }
  
  if (!identifier) {
    showNotification(`❌ Please enter your ${currentRecoveryMethod}`, 'error');
    updateStepIndicator(1);
    if (inputField) {
      inputField.style.borderColor = '#ef4444';
      inputField.style.animation = 'shake 0.5s';
      setTimeout(() => {
        inputField.style.borderColor = '';
        inputField.style.animation = '';
      }, 500);
    }
    return;
  }
  
  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <span style="display: flex; align-items: center; justify-content: center; gap: 10px;">
      <span style="animation: spin 1s linear infinite;">⏳</span>
      <span>Sending...</span>
    </span>`;
  
  try {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Update to step 3
      updateStepIndicator(3);
      
      // Check if we're in development mode (email service not configured)
      if (data.resetToken) {
        // Development mode - show reset token
        const resetUrl = `${window.location.origin}${window.location.pathname}?reset=${data.resetToken}`;
        
        showNotification('', 'success');
        
        // Create beautiful success display
        setTimeout(() => {
          const messageEl = document.querySelector('.notification.notification--success');
          if (messageEl) {
            messageEl.innerHTML = `
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px; animation: bounceIn 0.6s;">✅</div>
                <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Account Found!</div>
                <div style="font-size: 14px; margin-bottom: 20px; opacity: 0.9;">
                  Recovery method: <strong>${currentRecoveryMethod.toUpperCase()}</strong><br>
                  ${data.maskedContact ? `Sent to: <strong>${data.maskedContact}</strong>` : ''}
                </div>
                <a href="${resetUrl}" style="display: inline-block; background: white; color: var(--color-primary); padding: 14px 28px; border-radius: 25px; text-decoration: none; font-weight: 700; margin-top: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.2s;">
                  🔗 Reset Password Now
                </a>
                <div style="font-size: 12px; margin-top: 16px; opacity: 0.8;">
                  ⏰ Link expires in 15 minutes
                </div>
              </div>`;
              
            // Add bounce animation
            messageEl.style.animation = 'bounceIn 0.6s';
          }
        }, 100);
      } else {
        // Production mode - email sent
        showNotification('', 'success');
        
        setTimeout(() => {
          const messageEl = document.querySelector('.notification.notification--success');
          if (messageEl) {
            messageEl.innerHTML = `
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px; animation: bounceIn 0.6s;">📧</div>
                <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Reset Link Sent!</div>
                <div style="font-size: 14px; margin-bottom: 12px; opacity: 0.9;">
                  Check your ${data.contactMethod || 'email'} inbox
                </div>
                ${data.maskedContact ? `
                <div style="background: rgba(255,255,255,0.2); padding: 12px; border-radius: 12px; display: inline-block; margin-top: 8px;">
                  <strong>${data.maskedContact}</strong>
                </div>` : ''}
                <div style="font-size: 12px; margin-top: 16px; opacity: 0.8;">
                  ⏰ Link expires in 15 minutes
                </div>
              </div>`;
          }
        }, 100);
      }
      
      // Clear form
      document.getElementById('forgotEmail').value = '';
      document.getElementById('forgotUsername').value = '';
      document.getElementById('forgotPhone').value = '';
    } else {
      updateStepIndicator(1);
      showNotification(`❌ ${data.message || 'Failed to send reset link'}`, 'error');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    updateStepIndicator(1);
    showNotification('❌ Failed to send reset link. Please try again.', 'error');
  } finally {
    // Restore button
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Add CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes bounceIn {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.05); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  // Validate passwords match
  if (newPassword !== confirmPassword) {
    showNotification('Passwords do not match!', 'error');
    return;
  }
  
  // Validate password length
  if (newPassword.length < 6) {
    showNotification('Password must be at least 6 characters long', 'error');
    return;
  }
  
  // Get reset token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset');
  
  if (!resetToken) {
    showNotification('Invalid or missing reset token', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/auth/reset-password/${resetToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showNotification('✅ Password reset successful! Redirecting to login...', 'success');
      
      // Clear reset token from URL and redirect to login
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
        navigateToPage('login');
      }, 2000);
    } else {
      showNotification(data.message || 'Failed to reset password', 'error');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showNotification('Failed to reset password. Please try again.', 'error');
  }
}

// ======================
// SKILL MANAGEMENT
// ======================

async function showAddSkillModal(type) {
  const modalContent = document.getElementById('exchangeModalContent');
  const modalTitle = document.querySelector('#exchangeModal .modal-header h3');
  
  modalTitle.textContent = type === 'offered' ? 'Add Skill You Offer' : 'Add Skill You Want to Learn';
  
  // Get categories
  const categoriesData = await apiRequest('/users/categories');
  const categories = categoriesData.categories;
  
  modalContent.innerHTML = `
    <form id="addSkillForm" onsubmit="handleAddSkill(event, '${type}')">
      <div class="form-group">
        <label class="form-label">Skill Name *</label>
        <input type="text" class="form-control" id="skillName" required 
               placeholder="e.g., React Development, Graphic Design, Spanish">
      </div>

      <div class="form-group">
        <label class="form-label">Category *</label>
        <select class="form-control" id="skillCategory" required>
          <option value="">Select a category</option>
          ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Experience Level *</label>
        <select class="form-control" id="skillLevel" required>
          <option value="">Select level</option>
          <option value="Beginner">🟢 Beginner - Just starting out</option>
          <option value="Intermediate">🟡 Intermediate - Some experience</option>
          <option value="Advanced">🟠 Advanced - Highly skilled</option>
          <option value="Expert">🔴 Expert - Master level</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Description *</label>
        <textarea class="form-control" id="skillDescription" required rows="3"
                  placeholder="Describe your skill or what you want to learn..."></textarea>
      </div>

      <button type="submit" class="btn btn--primary btn--full-width">Add Skill</button>
    </form>
  `;
  
  document.getElementById('exchangeModal').classList.add('show');
}

async function handleAddSkill(event, type) {
  event.preventDefault();
  
  const skillName = document.getElementById('skillName').value.trim();
  const skillCategory = document.getElementById('skillCategory').value;
  const skillLevel = document.getElementById('skillLevel').value;
  const skillDescription = document.getElementById('skillDescription').value.trim();
  
  if (!skillName || !skillCategory || !skillLevel || !skillDescription) {
    showNotification('Please fill in all fields', 'error');
    return;
  }
  
  try {
    const fieldName = type === 'offered' ? 'skills_offered' : 'skills_wanted';
    const currentSkills = AppState.currentUser[fieldName] || [];
    
    // Add new skill to existing skills
    const updatedSkills = [...currentSkills, {
      name: skillName,
      category: skillCategory,
      experience_level: skillLevel,
      description: skillDescription
    }];
    
    const updateData = {
      name: AppState.currentUser.name,
      bio: AppState.currentUser.bio,
      location: AppState.currentUser.location,
      avatar: AppState.currentUser.avatar,
      [fieldName]: updatedSkills
    };
    
    const data = await apiRequest('/auth/update', {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    
    AppState.currentUser = data.user;
    
    document.getElementById('exchangeModal').classList.remove('show');
    showNotification(`✅ Skill "${skillName}" added successfully!`, 'success');
    
    // Refresh current page
    if (AppState.currentPage === 'profile') {
      renderProfile();
    } else if (AppState.currentPage === 'dashboard') {
      renderDashboard();
    }
  } catch (error) {
    showNotification(error.message || 'Error adding skill', 'error');
  }
}

async function showEditProfileModal() {
  const modalContent = document.getElementById('exchangeModalContent');
  const modalTitle = document.querySelector('#exchangeModal .modal-header h3');
  
  modalTitle.textContent = 'Edit Profile';
  
  const currentAvatar = AppState.currentUser.profilePicture || AppState.currentUser.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
  
  modalContent.innerHTML = `
    <form id="editProfileForm" onsubmit="handleEditProfile(event)">
      <div class="form-group">
        <label class="form-label">Profile Picture</label>
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="position: relative; display: inline-block;">
            <img src="${currentAvatar}" id="previewAvatar" 
                 style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 4px solid var(--color-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <label for="profilePicUpload" style="position: absolute; bottom: 0; right: 0; background: var(--color-primary); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 3px solid white;">
              <i class="fas fa-camera" style="font-size: 16px;"></i>
            </label>
            <input type="file" id="profilePicUpload" accept="image/*" style="display: none;" onchange="handleProfilePicUpload(event)">
          </div>
          <p style="font-size: 13px; color: var(--color-text-secondary); margin-top: 12px;">
            � Click camera icon to upload from device
          </p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label class="form-label" style="font-size: 14px;">Or enter image URL:</label>
          <input type="url" class="form-control" id="editAvatar" 
                 value="${currentAvatar}"
                 placeholder="https://example.com/photo.jpg"
                 oninput="updateAvatarPreview(this.value)">
        </div>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
          <button type="button" class="btn btn--outline btn--sm" onclick="setAvatarPreset('https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face')">👤 Default 1</button>
          <button type="button" class="btn btn--outline btn--sm" onclick="setAvatarPreset('https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face')">👤 Default 2</button>
          <button type="button" class="btn btn--outline btn--sm" onclick="setAvatarPreset('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face')">👤 Default 3</button>
          <button type="button" class="btn btn--outline btn--sm" onclick="setAvatarPreset('https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face')">👤 Default 4</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" class="form-control" id="editName" value="${AppState.currentUser.name}" required>
      </div>

      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea class="form-control" id="editBio" rows="3" 
                  placeholder="Tell others about yourself...">${AppState.currentUser.bio || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Location</label>
        <input type="text" class="form-control" id="editLocation" value="${AppState.currentUser.location || ''}" 
               placeholder="e.g., San Francisco, CA">
      </div>

      <div style="display: flex; gap: 12px;">
        <button type="submit" class="btn btn--primary" style="flex: 1;">💾 Save Changes</button>
        <button type="button" class="btn btn--outline" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  
  document.getElementById('exchangeModal').classList.add('show');
}

// Update avatar preview
function updateAvatarPreview(url) {
  const preview = document.getElementById('previewAvatar');
  if (preview && url) {
    preview.src = url;
    preview.onerror = () => {
      preview.src = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
    };
  }
}

// Set avatar preset
function setAvatarPreset(url) {
  const avatarInput = document.getElementById('editAvatar');
  if (avatarInput) {
    avatarInput.value = url;
    updateAvatarPreview(url);
  }
}

// Handle profile picture upload from device
let uploadedProfilePicture = null;

function handleProfilePicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    showNotification('Please select a valid image file', 'error');
    return;
  }
  
  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showNotification('Image size must be less than 5MB', 'error');
    return;
  }
  
  // Show loading notification
  showNotification('📸 Uploading image...', 'info');
  
  // Read and preview the image
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('previewAvatar');
    const avatarInput = document.getElementById('editAvatar');
    
    if (preview && avatarInput) {
      preview.src = e.target.result;
      avatarInput.value = e.target.result; // Store base64 for upload
      uploadedProfilePicture = e.target.result; // Store separately
      showNotification('✅ Image loaded! Click Save to update your profile', 'success');
    }
  };
  
  reader.onerror = () => {
    showNotification('Error reading image file', 'error');
  };
  
  reader.readAsDataURL(file);
}

async function handleEditProfile(event) {
  event.preventDefault();
  
  const name = document.getElementById('editName').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const location = document.getElementById('editLocation').value.trim();
  const avatar = document.getElementById('editAvatar').value.trim();
  
  if (!name) {
    showNotification('Name is required', 'error');
    return;
  }
  
  try {
    const updateData = {
      name,
      bio,
      location,
      skills_offered: AppState.currentUser.skills_offered,
      skills_wanted: AppState.currentUser.skills_wanted
    };
    
    // Use uploaded picture if available, otherwise use URL
    if (uploadedProfilePicture) {
      updateData.profilePicture = uploadedProfilePicture;
      updateData.avatar = uploadedProfilePicture;
    } else if (avatar) {
      updateData.avatar = avatar;
      updateData.profilePicture = avatar;
    }
    
    const data = await apiRequest('/auth/update', {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    
    AppState.currentUser = data.user;
    
    // Clear uploaded picture after successful save
    uploadedProfilePicture = null;
    
    document.getElementById('exchangeModal').classList.remove('show');
    showNotification('✅ Profile updated successfully!', 'success');
    
    // Refresh current page
    if (AppState.currentPage === 'profile') {
      renderProfile();
    } else if (AppState.currentPage === 'dashboard') {
      renderDashboard();
    }
    updateNavigation();
  } catch (error) {
    showNotification(error.message || 'Error updating profile', 'error');
  }
}

// Close modal helper
function closeModal() {
  document.getElementById('exchangeModal').classList.remove('show');
}

// ======================
// UTILITY FUNCTIONS
// ======================

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// ======================
// CONTACT FORM HANDLER
// ======================

function handleContactForm(event) {
  event.preventDefault();
  
  const form = event.target;
  const formStatus = document.getElementById('contactFormStatus');
  const submitButton = form.querySelector('button[type="submit"]');
  
  // Get form data
  const formData = {
    name: document.getElementById('contactName').value.trim(),
    email: document.getElementById('contactEmail').value.trim(),
    subject: document.getElementById('contactSubject').value.trim(),
    message: document.getElementById('contactMessage').value.trim()
  };
  
  // Validate
  if (!formData.name || !formData.email || !formData.subject || !formData.message) {
    formStatus.textContent = 'Please fill in all fields';
    formStatus.className = 'form-status error';
    return;
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(formData.email)) {
    formStatus.textContent = 'Please enter a valid email address';
    formStatus.className = 'form-status error';
    return;
  }
  
  // Disable submit button
  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';
  
  // Send to API
  apiRequest('/contact', {
    method: 'POST',
    body: JSON.stringify(formData)
  })
    .then(response => {
      if (response.success) {
        // Success
        formStatus.textContent = `Thank you, ${formData.name}! Your message has been sent successfully. We'll get back to you soon at ${formData.email}.`;
        formStatus.className = 'form-status success';
        formStatus.style.display = 'block';
        
        // Reset form
        form.reset();
        
        // Show notification
        showNotification('Message sent successfully!', 'success');
        
        // Hide status after 5 seconds
        setTimeout(() => {
          formStatus.style.display = 'none';
        }, 5000);
      } else {
        // API returned error
        formStatus.textContent = response.message || 'Failed to send message. Please try again.';
        formStatus.className = 'form-status error';
        formStatus.style.display = 'block';
      }
    })
    .catch(error => {
      // Network or other error
      console.error('Contact form error:', error);
      formStatus.textContent = 'An error occurred. Please try again later or email us directly at support@skillexchange.com';
      formStatus.className = 'form-status error';
      formStatus.style.display = 'block';
    })
    .finally(() => {
      // Re-enable button
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message';
    });
}

// Initialize contact form on page load
function initializeContactForm() {
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', handleContactForm);
  }
  
  // Set current year in footer
  const yearElement = document.getElementById('currentYear');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
  
  // Smooth scroll for contact link
  const contactLink = document.getElementById('contactLink');
  if (contactLink) {
    contactLink.addEventListener('click', (e) => {
      e.preventDefault();
      const contactSection = document.getElementById('contact-section');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  
  // Handle footer scroll links (How It Works, Featured Skills)
  const footerScrollLinks = document.querySelectorAll('.footer-scroll-link');
  footerScrollLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionClass = link.getAttribute('data-section');
      
      // First navigate to home page if not already there
      const homePage = document.getElementById('homePage');
      if (homePage && homePage.style.display === 'none') {
        navigateToPage('home');
        // Scroll to top first
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      
      // Wait a bit for page transition, then scroll to section
      setTimeout(() => {
        const section = document.querySelector(`.${sectionClass}`);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    });
  });
  
  // Handle all footer links to scroll to top on navigation
  const footerLinks = document.querySelectorAll('.footer-links a[onclick]');
  footerLinks.forEach(link => {
    link.addEventListener('click', () => {
      // Small delay to let navigation happen first
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    });
  });
}

// ======================
// INITIALIZE
// ======================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  initializeContactForm();
  
  // Listen for user data updates from admin panel
  setInterval(() => {
    const lastUpdate = localStorage.getItem('userDataUpdated');
    if (lastUpdate && AppState.currentUser) {
      const updateTime = parseInt(lastUpdate);
      // If update was within last 5 seconds, refresh user data
      if (Date.now() - updateTime < 5000) {
        refreshUserProfile();
        localStorage.removeItem('userDataUpdated');
      }
    }
  }, 1000);
});

// Refresh user profile data
async function refreshUserProfile() {
  try {
    const response = await apiRequest('/users/me');
    if (response.success && response.user) {
      AppState.currentUser = response.user;
      updateUserDisplay();
    }
  } catch (error) {
    console.error('Error refreshing user profile:', error);
  }
}

// Update user display in UI
function updateUserDisplay() {
  if (!AppState.currentUser) return;
  
  // Update profile picture
  const profilePics = document.querySelectorAll('.user-avatar, .profile-avatar, img[alt*="Profile"]');
  profilePics.forEach(img => {
    if (AppState.currentUser.profilePicture) {
      img.src = AppState.currentUser.profilePicture;
    }
  });
  
  // Update user name
  const nameElements = document.querySelectorAll('.user-name, .profile-name');
  nameElements.forEach(el => {
    el.textContent = AppState.currentUser.fullName || 'User';
  });
}

// Make functions global for onclick handlers
window.navigateToPage = navigateToPage;
window.openExchangeModal = openExchangeModal;
window.selectConversation = selectConversation;
window.sendExchangeRequest = sendExchangeRequest;
window.showAddSkillModal = showAddSkillModal;
window.handleAddSkill = handleAddSkill;
window.showEditProfileModal = showEditProfileModal;
window.handleEditProfile = handleEditProfile;
window.updateAvatarPreview = updateAvatarPreview;
window.setAvatarPreset = setAvatarPreset;
window.handleProfilePicUpload = handleProfilePicUpload;
window.closeModal = closeModal;
window.hideProfileCompletion = hideProfileCompletion;
window.showForgotPassword = showForgotPassword;
window.useAccount = useAccount;
window.switchRecoveryMethod = switchRecoveryMethod;
window.toggleDemoAccounts = toggleDemoAccounts;
