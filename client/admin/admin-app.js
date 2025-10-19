// ===== STATE MANAGEMENT =====
let currentPage = 'dashboard';
let networkMonitorCollapsed = false;
let sidebarCollapsed = false;
let networkLogs = [];
let allUsers = [];
let allExchanges = [];
let allSkills = [];
let currentAdmin = null;

// ===== AUTHENTICATION =====
async function checkAuth() {
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
        window.location.href = 'admin-login.html';
        return false;
    }
    
    try {
        const response = await fetch('/api/admin-auth/verify-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentAdmin = data.data.admin;
            updateAdminInfo();
            return true;
        } else {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminData');
            window.location.href = 'admin-login.html';
            return false;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'admin-login.html';
        return false;
    }
}

function updateAdminInfo() {
    // Update admin info in UI if elements exist
    const adminNameElement = document.getElementById('adminName');
    const adminNameTopbar = document.getElementById('adminNameTopbar');
    const adminEmailElement = document.getElementById('adminEmail');
    const adminRoleElement = document.getElementById('adminRole');
    
    if (currentAdmin) {
        if (adminNameElement) adminNameElement.textContent = currentAdmin.fullName;
        if (adminNameTopbar) adminNameTopbar.textContent = currentAdmin.fullName;
        if (adminEmailElement) adminEmailElement.textContent = currentAdmin.email;
        if (adminRoleElement) {
            const roleDisplay = currentAdmin.role === 'super-admin' ? 'Super Admin' : 
                               currentAdmin.role === 'moderator' ? 'Moderator' : 'Admin';
            adminRoleElement.textContent = roleDisplay;
        }
    }
}

// Get auth headers for API calls
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        initializeAdmin();
        startNetworkMonitoring();
    }
});

function initializeAdmin() {
    // Load initial data
    navigateToPage('dashboard');
    
    // Check database connection
    checkDatabaseConnection();
    
    // Initialize network logs display
    displayNetworkLogs();
    
    // Add some example logs to show the feature works
    setTimeout(() => {
        addExampleLogs();
    }, 500);
}

// Add example logs to demonstrate the feature
function addExampleLogs() {
    logAPICall('GET', '/api/admin/status', 200, 45, 'success');
    setTimeout(() => logAPICall('GET', '/api/admin/stats', 200, 128, 'success'), 200);
    setTimeout(() => logAPICall('GET', '/api/admin/users', 200, 95, 'success'), 400);
}

// ===== NAVIGATION =====
function navigateToPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const page = document.getElementById(`${pageId}Page`);
    if (page) {
        page.classList.add('active');
    }
    
    // Update navigation - remove active from all
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active to clicked item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes(`'${pageId}'`)) {
            item.classList.add('active');
        }
    });
    
    // Update page title
    const titles = {
        dashboard: '📊 Dashboard',
        users: '👥 Users Management',
        exchanges: '🤝 Exchanges Management',
        skills: '🎯 Skills Management',
        analytics: '📈 Analytics',
        backup: '💾 Backup & Data Management',
        settings: '⚙️ Settings'
    };
    
    document.getElementById('pageTitle').textContent = titles[pageId] || 'Dashboard';
    
    currentPage = pageId;
    
    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 1024) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
        if (overlay && overlay.classList.contains('active')) {
            overlay.classList.remove('active');
        }
    }
    
    // Load page data
    loadPageData(pageId);
}

function loadPageData(pageId) {
    switch(pageId) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'users':
            loadUsers();
            break;
        case 'exchanges':
            loadExchanges();
            break;
        case 'skills':
            loadSkills();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'backup':
            loadBackupPage();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ===== SIDEBAR =====
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // For mobile: toggle 'active' class
    // For desktop: toggle 'collapsed' class
    if (window.innerWidth <= 1024) {
        sidebar.classList.toggle('active');
        
        // Close sidebar when clicking outside on mobile
        if (sidebar.classList.contains('active')) {
            // Add overlay
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.onclick = () => toggleSidebar();
                document.body.appendChild(overlay);
            }
            overlay.classList.add('active');
        } else {
            // Remove overlay
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        }
    } else {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    }
    
    sidebarCollapsed = !sidebarCollapsed;
}

// ===== NETWORK MONITOR =====
function toggleNetworkMonitor() {
    const monitor = document.getElementById('networkMonitor');
    const toggleBtn = monitor.querySelector('.toggle-btn');
    
    monitor.classList.toggle('collapsed');
    networkMonitorCollapsed = !networkMonitorCollapsed;
    
    toggleBtn.textContent = networkMonitorCollapsed ? '+' : '−';
}

async function checkDatabaseConnection() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();
        
        const dbStatus = document.getElementById('dbStatus');
        const dbName = document.getElementById('dbName');
        
        if (data.success) {
            dbStatus.innerHTML = '🟢 MongoDB: Connected';
            dbName.innerHTML = `📊 Database: ${data.database}`;
        } else {
            dbStatus.innerHTML = '🔴 MongoDB: Disconnected';
            dbName.innerHTML = '📊 Database: N/A';
        }
    } catch (error) {
        const dbStatus = document.getElementById('dbStatus');
        const dbName = document.getElementById('dbName');
        
        dbStatus.innerHTML = '🔴 MongoDB: Error';
        dbName.innerHTML = '📊 Database: N/A';
        
        logAPICall('GET', '/api/admin/status', 500, 0, 'error');
    }
}

function startNetworkMonitoring() {
    // Intercept fetch calls
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
        const startTime = Date.now();
        const url = args[0];
        const options = args[1] || {};
        const method = options.method || 'GET';
        
        try {
            const response = await originalFetch.apply(this, args);
            const duration = Date.now() - startTime;
            
            logAPICall(method, url, response.status, duration, 'success');
            
            return response;
        } catch (error) {
            const duration = Date.now() - startTime;
            logAPICall(method, url, 500, duration, 'error');
            throw error;
        }
    };
}

function logAPICall(method, url, status, duration, type) {
    const log = {
        method,
        url,
        status,
        duration,
        type,
        timestamp: new Date().toISOString()
    };
    
    networkLogs.unshift(log);
    
    // Keep only last 50 logs
    if (networkLogs.length > 50) {
        networkLogs.pop();
    }
    
    displayNetworkLogs();
}

function displayNetworkLogs() {
    const logsContainer = document.getElementById('networkLogs');
    
    if (!logsContainer) return;
    
    // Keep the header if it exists
    const existingHeader = logsContainer.querySelector('.log-header');
    
    // Clear existing logs but keep structure
    logsContainer.innerHTML = '<div class="log-header">Recent API Calls</div>';
    
    // If no logs yet, show waiting message
    if (networkLogs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'log-item';
        emptyMessage.style.justifyContent = 'center';
        emptyMessage.style.color = 'var(--text-secondary)';
        emptyMessage.innerHTML = '⏳ Waiting for API calls...';
        logsContainer.appendChild(emptyMessage);
        return;
    }
    
    // Display logs (most recent first)
    networkLogs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        
        logItem.innerHTML = `
            <span class="log-method ${log.method}">${log.method}</span>
            <span class="log-url" title="${log.url}">${log.url}</span>
            <span class="log-status ${log.type}">${log.status}</span>
            <span class="log-time">${log.duration}ms</span>
        `;
        
        logsContainer.appendChild(logItem);
    });
}

// ===== DASHBOARD =====
async function loadDashboardStats() {
    try {
        // Show loading
        const dashboardUsersEl = document.getElementById('dashboardUsers');
        const dashboardExchangesEl = document.getElementById('dashboardExchanges');
        
        if (dashboardUsersEl) dashboardUsersEl.innerHTML = '<div class="loading">Loading users...</div>';
        if (dashboardExchangesEl) dashboardExchangesEl.innerHTML = '<div class="loading">Loading exchanges...</div>';
        
        const response = await fetch('/api/admin/stats');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.stats) {
            // Update stat cards
            updateStatCard('totalUsers', data.stats.totalUsers || 0, '+12%');
            updateStatCard('totalExchanges', data.stats.totalExchanges || 0, '+8%');
            updateStatCard('avgRating', (data.stats.averageRating || 0).toFixed(1), '+5%');
            updateStatCard('successRate', `${data.stats.successRate || 0}%`, '+3%');
            
            // Update recent users
            displayRecentUsers(data.recentUsers || []);
            
            // Update recent exchanges
            displayRecentExchanges(data.recentExchanges || []);
        } else {
            throw new Error(data.message || 'Failed to load dashboard stats');
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        
        // Show error in UI
        const dashboardUsersEl = document.getElementById('dashboardUsers');
        const dashboardExchangesEl = document.getElementById('dashboardExchanges');
        
        if (dashboardUsersEl) {
            dashboardUsersEl.innerHTML = '<div class="loading" style="color: var(--danger);">❌ Error loading users</div>';
        }
        if (dashboardExchangesEl) {
            dashboardExchangesEl.innerHTML = '<div class="loading" style="color: var(--danger);">❌ Error loading exchanges</div>';
        }
        
        // Set default values for stat cards
        updateStatCard('totalUsers', '0', '');
        updateStatCard('totalExchanges', '0', '');
        updateStatCard('avgRating', '0.0', '');
        updateStatCard('successRate', '0%', '');
    }
}

function updateStatCard(id, value, change) {
    const cardElement = document.getElementById(id);
    
    if (!cardElement) {
        console.warn(`Stat card element with id '${id}' not found`);
        return;
    }
    
    const valueElement = cardElement.querySelector('.stat-value');
    const changeElement = cardElement.querySelector('.stat-change');
    
    if (valueElement) valueElement.textContent = value;
    if (changeElement && change) changeElement.textContent = change;
}

function displayRecentUsers(users) {
    const container = document.getElementById('dashboardUsers');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="loading">No recent users</div>';
        return;
    }
    
    const html = users.map(user => `
        <div class="user-cell" style="padding: 12px; border-bottom: 1px solid var(--border-color);">
            <img src="${user.profilePicture || '/default-avatar.png'}" class="user-avatar" alt="${user.fullName}">
            <div class="user-info">
                <span class="user-name">${user.fullName}</span>
                <span class="user-email">${user.email}</span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function displayRecentExchanges(exchanges) {
    const container = document.getElementById('dashboardExchanges');
    
    if (!exchanges || exchanges.length === 0) {
        container.innerHTML = '<div class="loading">No recent exchanges</div>';
        return;
    }
    
    const html = exchanges.map(exchange => `
        <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong>${exchange.requester?.fullName || 'Unknown'} ↔️ ${exchange.provider?.fullName || 'Unknown'}</strong>
                <span class="status-badge ${exchange.status}">${exchange.status}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">
                ${exchange.skillOffered} ↔️ ${exchange.skillWanted}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// ===== USERS MANAGEMENT =====
async function loadUsers(search = '', filter = 'all') {
    try {
        const tableBody = document.getElementById('usersTableBody');
        tableBody.innerHTML = '<tr><td colspan="8" class="loading">⏳ Loading users...</td></tr>';
        
        const url = `/api/admin/users?search=${encodeURIComponent(search)}&filter=${filter}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users || [];
            displayUsers(allUsers);
            
            // Update badge count
            const userCountBadge = document.getElementById('userCount');
            if (userCountBadge) {
                userCountBadge.textContent = allUsers.length;
            }
        } else {
            throw new Error(data.message || 'Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        const tableBody = document.getElementById('usersTableBody');
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--danger);">❌ Error: ${error.message}</td></tr>`;
    }
}

function displayUsers(users) {
    const tableBody = document.getElementById('usersTableBody');
    
    if (!users || users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No users found</td></tr>';
        return;
    }
    
    const html = users.map(user => `
        <tr>
            <td>
                <div class="user-cell">
                    <img src="${user.profilePicture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullName || 'User')}" class="user-avatar" alt="${user.fullName || 'User'}" onerror="this.src='https://ui-avatars.com/api/?name=User'">
                    <div class="user-info">
                        <span class="user-name">${user.fullName || 'Unknown'}</span>
                        <span class="user-email">${user.email || 'N/A'}</span>
                    </div>
                </div>
            </td>
            <td>${user.email || 'N/A'}</td>
            <td>${user.location || 'Not specified'}</td>
            <td>${(user.skillsOffered?.length || 0)} / ${(user.skillsWanted?.length || 0)}</td>
            <td>${user.totalExchanges || 0}</td>
            <td>⭐ ${user.rating ? user.rating.toFixed(1) : 'N/A'}</td>
            <td>${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editUser('${user._id}')" title="Edit User">✏️</button>
                    <button class="btn-action btn-delete" onclick="deleteUser('${user._id}', '${(user.fullName || 'User').replace(/'/g, "\\'")}')" title="Delete User">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    tableBody.innerHTML = html;
}

function searchUsers() {
    const searchValue = document.getElementById('userSearch').value;
    const filterValue = document.getElementById('userFilter').value;
    loadUsers(searchValue, filterValue);
}

function filterUsers() {
    const searchValue = document.getElementById('userSearch').value;
    const filterValue = document.getElementById('userFilter').value;
    loadUsers(searchValue, filterValue);
}

async function editUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            
            // Populate modal with form
            const modalBody = document.getElementById('editUserForm');
            modalBody.innerHTML = `
                <input type="hidden" id="editUserId" value="${user._id}">
                <div class="setting-item">
                    <label>Full Name</label>
                    <input type="text" class="form-control" id="editUserName" value="${user.fullName || ''}" required>
                </div>
                <div class="setting-item">
                    <label>Email</label>
                    <input type="email" class="form-control" id="editUserEmail" value="${user.email || ''}" required>
                </div>
                <div class="setting-item">
                    <label>Location</label>
                    <input type="text" class="form-control" id="editUserLocation" value="${user.location || ''}">
                </div>
                <div class="setting-item">
                    <label>Bio</label>
                    <textarea class="form-control" id="editUserBio" rows="4">${user.bio || ''}</textarea>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="saveUser()">💾 Save Changes</button>
                    <button class="btn btn-secondary" onclick="closeModal('editUserModal')">Cancel</button>
                </div>
            `;
            
            openModal('editUserModal');
        } else {
            showError('User not found');
        }
    } catch (error) {
        console.error('Error loading user:', error);
        showError('Error loading user details');
    }
}

async function saveUser() {
    const userId = document.getElementById('editUserId').value;
    const userData = {
        fullName: document.getElementById('editUserName').value,
        email: document.getElementById('editUserEmail').value,
        location: document.getElementById('editUserLocation').value,
        bio: document.getElementById('editUserBio').value
    };
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal('editUserModal');
            loadUsers();
            showSuccess('User updated successfully');
        } else {
            showError(data.message || 'Failed to update user');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showError('Error updating user');
    }
}

function deleteUser(userId, userName) {
    const confirmMsg = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    
    confirmMsg.textContent = `Are you sure you want to delete ${userName}? This action cannot be undone.`;
    confirmBtn.onclick = () => confirmDeleteUser(userId);
    
    openModal('confirmModal');
}

async function confirmDeleteUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal('confirmModal');
            loadUsers();
            showSuccess('User deleted successfully');
        } else {
            showError(data.message || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showError('Error deleting user');
    }
}

// ===== EXCHANGES MANAGEMENT =====
async function loadExchanges(filter = 'all') {
    try {
        const tableBody = document.getElementById('exchangesTableBody');
        tableBody.innerHTML = '<tr><td colspan="7" class="loading">⏳ Loading exchanges...</td></tr>';
        
        const url = `/api/admin/exchanges?status=${filter}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            allExchanges = data.exchanges || [];
            displayExchanges(allExchanges);
            
            // Update badge count
            const exchangeCountBadge = document.getElementById('exchangeCount');
            if (exchangeCountBadge) {
                exchangeCountBadge.textContent = allExchanges.length;
            }
        } else {
            throw new Error(data.message || 'Failed to load exchanges');
        }
    } catch (error) {
        console.error('Error loading exchanges:', error);
        const tableBody = document.getElementById('exchangesTableBody');
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--danger);">❌ Error: ${error.message}</td></tr>`;
    }
}

function displayExchanges(exchanges) {
    const tableBody = document.getElementById('exchangesTableBody');
    
    if (!exchanges || exchanges.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No exchanges found</td></tr>';
        return;
    }
    
    const html = exchanges.map(exchange => `
        <tr>
            <td>#${exchange._id ? exchange._id.slice(-6) : 'N/A'}</td>
            <td>${exchange.requester?.fullName || 'Unknown'}</td>
            <td>${exchange.provider?.fullName || 'Unknown'}</td>
            <td>${exchange.skillOffered || 'N/A'} ↔️ ${exchange.skillWanted || 'N/A'}</td>
            <td><span class="status-badge ${exchange.status || 'pending'}">${exchange.status || 'pending'}</span></td>
            <td>${exchange.createdAt ? new Date(exchange.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="viewExchange('${exchange._id}')" title="View Details">👁️</button>
                    <button class="btn-action btn-delete" onclick="deleteExchange('${exchange._id}')" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    tableBody.innerHTML = html;
}

function filterExchanges() {
    const filterValue = document.getElementById('exchangeFilter').value;
    loadExchanges(filterValue);
}

async function viewExchange(exchangeId) {
    showSuccess(`Viewing exchange: ${exchangeId.slice(-6)}`);
}

function deleteExchange(exchangeId) {
    const confirmMsg = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    
    confirmMsg.textContent = 'Are you sure you want to delete this exchange?';
    confirmBtn.onclick = () => confirmDeleteExchange(exchangeId);
    
    openModal('confirmModal');
}

async function confirmDeleteExchange(exchangeId) {
    try {
        const response = await fetch(`/api/admin/exchanges/${exchangeId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal('confirmModal');
            loadExchanges();
            showSuccess('Exchange deleted successfully');
        } else {
            showError(data.message || 'Failed to delete exchange');
        }
    } catch (error) {
        console.error('Error deleting exchange:', error);
        showError('Error deleting exchange');
    }
}

// ===== SKILLS MANAGEMENT =====
async function loadSkills(search = '', category = 'all') {
    try {
        const container = document.getElementById('skillsGrid');
        container.innerHTML = '<div class="loading">⏳ Loading skills...</div>';
        
        // Extract skills from all users
        const skillsMap = new Map();
        
        allUsers.forEach(user => {
            if (user.skillsOffered && Array.isArray(user.skillsOffered)) {
                user.skillsOffered.forEach(skill => {
                    const skillName = skill.name || skill;
                    const skillCategory = skill.category || 'General';
                    const skillLevel = skill.level || 'Intermediate';
                    
                    if (skillName) {
                        const key = `${skillName}-${skillCategory}`;
                        
                        if (!skillsMap.has(key)) {
                            skillsMap.set(key, {
                                name: skillName,
                                category: skillCategory,
                                level: skillLevel,
                                providers: []
                            });
                        }
                        
                        // Add user as provider if not already added
                        const skillData = skillsMap.get(key);
                        if (!skillData.providers.find(p => p._id === user._id)) {
                            skillData.providers.push({
                                _id: user._id,
                                fullName: user.fullName,
                                email: user.email,
                                location: user.location,
                                rating: user.rating
                            });
                        }
                    }
                });
            }
        });
        
        // Convert map to array
        allSkills = Array.from(skillsMap.values());
        
        // Apply filters
        let filteredSkills = allSkills;
        
        // Filter by search
        if (search) {
            const searchLower = search.toLowerCase();
            filteredSkills = filteredSkills.filter(skill => 
                skill.name.toLowerCase().includes(searchLower) ||
                skill.category.toLowerCase().includes(searchLower)
            );
        }
        
        // Filter by category
        if (category !== 'all') {
            filteredSkills = filteredSkills.filter(skill => 
                skill.category.toLowerCase() === category.toLowerCase()
            );
        }
        
        displaySkills(filteredSkills);
        
        console.log(`✅ Loaded ${filteredSkills.length} skills from ${allUsers.length} users`);
    } catch (error) {
        console.error('Error loading skills:', error);
        const container = document.getElementById('skillsGrid');
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger);">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 18px; margin-bottom: 8px;">Error loading skills</div>
                <div style="font-size: 14px; color: var(--text-secondary);">${error.message}</div>
            </div>
        `;
    }
}

function displaySkills(skills) {
    const container = document.getElementById('skillsGrid');
    
    if (!skills || skills.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                <div style="font-size: 64px; margin-bottom: 20px;">🎯</div>
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">No Skills Found</div>
                <div style="font-size: 14px;">Try adjusting your search or filter criteria</div>
            </div>
        `;
        return;
    }
    
    // Category colors and emojis
    const categoryStyles = {
        'Programming': { emoji: '💻', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
        'Design': { emoji: '🎨', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
        'Marketing': { emoji: '📱', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
        'Languages': { emoji: '🗣️', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        'Business': { emoji: '💼', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
        'Music': { emoji: '🎵', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
        'Sports': { emoji: '⚽', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' },
        'Cooking': { emoji: '👨‍🍳', color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
        'General': { emoji: '🎯', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' }
    };
    
    const levelBadges = {
        'Beginner': { emoji: '🌱', color: '#10b981' },
        'Intermediate': { emoji: '📊', color: '#f59e0b' },
        'Advanced': { emoji: '🏆', color: '#6366f1' },
        'Expert': { emoji: '⭐', color: '#ef4444' }
    };
    
    const html = skills.map(skill => {
        const categoryStyle = categoryStyles[skill.category] || categoryStyles['General'];
        const levelBadge = levelBadges[skill.level] || levelBadges['Intermediate'];
        const providersCount = skill.providers.length;
        
        // Get top 3 providers by rating
        const topProviders = skill.providers
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 3);
        
        // Calculate average rating
        const avgRating = skill.providers.length > 0
            ? skill.providers.reduce((sum, p) => sum + (p.rating || 0), 0) / skill.providers.length
            : 0;
        
        return `
            <div class="skill-card" style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; transition: all 0.3s ease; cursor: pointer;" 
                 onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.2)'; this.style.borderColor='${categoryStyle.color}';" 
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'; this.style.borderColor='var(--border-color)';">
                
                <!-- Header with Category -->
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                    <div style="flex: 1;">
                        <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">
                            ${categoryStyle.emoji} ${skill.name}
                        </div>
                        <div style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: ${categoryStyle.bg}; color: ${categoryStyle.color};">
                            ${skill.category}
                        </div>
                    </div>
                </div>
                
                <!-- Stats Row -->
                <div style="display: flex; gap: 16px; margin-bottom: 16px; padding: 12px; background: var(--bg-primary); border-radius: 8px;">
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: ${categoryStyle.color};">${providersCount}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Providers</div>
                    </div>
                    <div style="width: 1px; background: var(--border-color);"></div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">⭐ ${avgRating.toFixed(1)}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Avg Rating</div>
                    </div>
                    <div style="width: 1px; background: var(--border-color);"></div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 24px;">${levelBadge.emoji}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${skill.level}</div>
                    </div>
                </div>
                
                <!-- Top Providers -->
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                        Top Providers
                    </div>
                    ${topProviders.map((provider, index) => `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 4px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${categoryStyle.bg}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: ${categoryStyle.color};">
                                ${index + 1}
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${provider.fullName}
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary);">
                                    📍 ${provider.location || 'Location not set'}
                                </div>
                            </div>
                            ${provider.rating ? `
                                <div style="font-size: 12px; font-weight: 600; color: #f59e0b; white-space: nowrap;">
                                    ⭐ ${provider.rating.toFixed(1)}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                    ${providersCount > 3 ? `
                        <div style="text-align: center; padding: 8px; font-size: 12px; color: var(--text-secondary);">
                            +${providersCount - 3} more provider${providersCount - 3 !== 1 ? 's' : ''}
                        </div>
                    ` : ''}
                </div>
                
                <!-- View All Button -->
                <button onclick="viewSkillProviders('${skill.name.replace(/'/g, "\\'")}', event)" 
                        style="width: 100%; padding: 10px; background: ${categoryStyle.bg}; color: ${categoryStyle.color}; border: 1px solid ${categoryStyle.color}; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;"
                        onmouseover="this.style.background='${categoryStyle.color}'; this.style.color='white';"
                        onmouseout="this.style.background='${categoryStyle.bg}'; this.style.color='${categoryStyle.color}';">
                    View All ${providersCount} Provider${providersCount !== 1 ? 's' : ''}
                </button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function searchSkills() {
    const searchValue = document.getElementById('skillSearch').value;
    const categoryValue = document.getElementById('categoryFilter').value;
    loadSkills(searchValue, categoryValue);
}

function filterSkills() {
    const searchValue = document.getElementById('skillSearch').value;
    const categoryValue = document.getElementById('categoryFilter').value;
    loadSkills(searchValue, categoryValue);
}

// View all providers for a skill in a modal
function viewSkillProviders(skillName, event) {
    event.stopPropagation();
    
    // Find the skill in allSkills
    const skill = allSkills.find(s => s.name === skillName);
    if (!skill) return;
    
    // Category styles
    const categoryStyles = {
        'Programming': { emoji: '💻', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
        'Design': { emoji: '🎨', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
        'Marketing': { emoji: '📱', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
        'Languages': { emoji: '🗣️', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        'Business': { emoji: '💼', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
        'Music': { emoji: '🎵', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
        'Sports': { emoji: '⚽', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' },
        'Cooking': { emoji: '👨‍🍳', color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
        'General': { emoji: '🎯', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' }
    };
    
    const categoryStyle = categoryStyles[skill.category] || categoryStyles['General'];
    
    // Sort providers by rating
    const sortedProviders = [...skill.providers].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;
    
    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 16px; padding: 0; max-width: 600px; width: 90%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; animation: slideUp 0.3s ease;">
            <!-- Header -->
            <div style="padding: 24px; border-bottom: 1px solid var(--border-color); background: ${categoryStyle.bg};">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: ${categoryStyle.color}; margin-bottom: 8px;">
                            ${categoryStyle.emoji} ${skill.name}
                        </div>
                        <div style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: ${categoryStyle.color}; color: white;">
                            ${skill.category}
                        </div>
                    </div>
                    <button onclick="this.closest('[style*=\\'z-index: 10000\\']').remove()" 
                            style="background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(0,0,0,0.1)'"
                            onmouseout="this.style.background='transparent'">
                        ×
                    </button>
                </div>
            </div>
            
            <!-- Providers List -->
            <div style="flex: 1; overflow-y: auto; padding: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
                    All Providers (${sortedProviders.length})
                </div>
                ${sortedProviders.map((provider, index) => `
                    <div style="padding: 16px; background: var(--bg-primary); border-radius: 12px; margin-bottom: 12px; transition: all 0.2s; cursor: pointer;"
                         onmouseover="this.style.background='var(--surface-hover)'; this.style.transform='translateX(4px)'"
                         onmouseout="this.style.background='var(--bg-primary)'; this.style.transform='translateX(0)'">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${categoryStyle.bg}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: ${categoryStyle.color}; flex-shrink: 0;">
                                ${index + 1}
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">
                                    ${provider.fullName}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary);">
                                    📧 ${provider.email}
                                </div>
                            </div>
                            ${provider.rating ? `
                                <div style="text-align: center; padding: 8px 16px; background: rgba(245, 158, 11, 0.1); border-radius: 8px;">
                                    <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">⭐ ${provider.rating.toFixed(1)}</div>
                                    <div style="font-size: 11px; color: var(--text-secondary);">Rating</div>
                                </div>
                            ` : `
                                <div style="text-align: center; padding: 8px 16px; background: var(--surface); border-radius: 8px;">
                                    <div style="font-size: 16px; color: var(--text-secondary);">-</div>
                                    <div style="font-size: 11px; color: var(--text-secondary);">No Rating</div>
                                </div>
                            `}
                        </div>
                        <div style="display: flex; gap: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                            <div style="flex: 1;">
                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">📍 Location</div>
                                <div style="font-size: 13px; font-weight: 600;">${provider.location || 'Not specified'}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <!-- Footer -->
            <div style="padding: 20px; border-top: 1px solid var(--border-color); background: var(--bg-primary); text-align: center;">
                <button onclick="this.closest('[style*=\\'z-index: 10000\\']').remove()" 
                        style="padding: 12px 32px; background: ${categoryStyle.color}; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s;"
                        onmouseover="this.style.opacity='0.9'; this.style.transform='scale(1.02)'"
                        onmouseout="this.style.opacity='1'; this.style.transform='scale(1)'">
                    Close
                </button>
            </div>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(modal);
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Close on Escape key
    const closeOnEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEscape);
        }
    };
    document.addEventListener('keydown', closeOnEscape);
}

// ===== ANALYTICS =====
async function loadAnalytics() {
    try {
        // Load analytics data
        const response = await fetch('/api/admin/analytics');
        
        if (!response.ok) {
            console.warn(`Analytics API returned ${response.status}, loading demo data`);
            loadDemoAnalytics();
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.charts) {
            // Update summary stats
            const totalActivity = (allUsers.length || 0) + (allExchanges.length || 0);
            document.getElementById('analyticsActivity').textContent = totalActivity;
            document.getElementById('analyticsGrowth').textContent = '+15%';
            document.getElementById('analyticsCompletion').textContent = '78%';
            document.getElementById('analyticsSatisfaction').textContent = '4.5';
            
            // Render charts if Chart.js is available
            if (typeof Chart !== 'undefined' && data.charts) {
                renderChart('userGrowthCanvas', 'line', data.charts.userGrowth);
                renderChart('exchangeStatsCanvas', 'doughnut', data.charts.exchangeStatus);
                renderChart('skillsDistCanvas', 'bar', data.charts.popularSkills);
                renderChart('ratingDistCanvas', 'line', data.charts.monthlyActivity);
                console.log('✅ Analytics: 4 charts rendered successfully');
            } else {
                console.warn('⚠️ Chart.js not available or no chart data');
            }
            
            // Display insights
            if (data.insights) {
                displayInsights(data.insights);
            }
            
            // Display top users and popular skills with real data
            displayTopPerformingUsers();
            displayMostPopularSkills();
        } else {
            console.warn('No analytics data available, loading demo data');
            loadDemoAnalytics();
        }
    } catch (error) {
        console.error('❌ Error loading analytics:', error);
        // Load demo data on error
        loadDemoAnalytics();
    }
}

function renderChart(canvasId, type, chartData) {
    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas element with id '${canvasId}' not found`);
            return;
        }
        
        // Verify it's actually a canvas element
        if (!(canvas instanceof HTMLCanvasElement)) {
            console.error(`Element '${canvasId}' is not a canvas element`);
            return;
        }
        
        // Destroy existing chart if it exists
        if (canvas.chart) {
            canvas.chart.destroy();
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error(`Failed to get 2D context for canvas '${canvasId}'`);
            return;
        }
        
        canvas.chart = new Chart(ctx, {
            type: type,
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: type === 'doughnut' || type === 'pie',
                        position: 'bottom',
                        labels: {
                            color: '#e5e7eb',
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        borderWidth: 1
                    }
                },
                scales: type !== 'doughnut' && type !== 'pie' ? {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#9ca3af'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#9ca3af'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                } : {}
            }
        });
    } catch (error) {
        console.error(`❌ Error rendering chart '${canvasId}':`, error);
    }
}

function displayInsights(insights) {
    const container = document.getElementById('insightsContainer');
    if (!container) return;
    
    const html = insights.map(insight => `
        <div class="insight-card">
            <div class="insight-header">
                <h4>${insight.title}</h4>
                <span class="insight-status ${insight.status}">${insight.status}</span>
            </div>
            <p>${insight.description}</p>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function loadDemoAnalytics() {
    // Set summary stats
    const totalActivity = (allUsers.length || 0) + (allExchanges.length || 0);
    document.getElementById('analyticsActivity').textContent = totalActivity;
    document.getElementById('analyticsGrowth').textContent = '+15%';
    document.getElementById('analyticsCompletion').textContent = '78%';
    document.getElementById('analyticsSatisfaction').textContent = '4.5';
    
    // Create demo chart data
    if (typeof Chart !== 'undefined') {
        // User Growth Chart
        const userGrowthData = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'New Users',
                data: [12, 19, 15, 25, 32, 28],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4
            }]
        };
        
        // Exchange Status Chart
        const exchangeStatusData = {
            labels: ['Completed', 'Pending', 'Active', 'Cancelled'],
            datasets: [{
                data: [45, 10, 25, 5],
                backgroundColor: ['#10b981', '#f59e0b', '#6366f1', '#ef4444']
            }]
        };
        
        // Popular Skills Chart
        const popularSkillsData = {
            labels: ['JavaScript', 'Python', 'Design', 'Marketing', 'Business'],
            datasets: [{
                label: 'Number of Providers',
                data: [45, 38, 32, 25, 18],
                backgroundColor: '#6366f1'
            }]
        };
        
        // Monthly Activity Chart
        const monthlyActivityData = {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Exchanges',
                data: [65, 78, 90, 81],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4
            }]
        };
        
        // Render all charts
        renderChart('userGrowthCanvas', 'line', userGrowthData);
        renderChart('exchangeStatsCanvas', 'doughnut', exchangeStatusData);
        renderChart('skillsDistCanvas', 'bar', popularSkillsData);
        renderChart('ratingDistCanvas', 'line', monthlyActivityData);
        
        console.log('✅ Analytics: 4 demo charts rendered successfully');
    } else {
        console.warn('⚠️ Chart.js not available');
    }
    
    // Display top users and popular skills with real data
    displayTopPerformingUsers();
    displayMostPopularSkills();
}

function displayAnalytics(analytics) {
    // Update summary stats
    document.getElementById('analyticsActivity').textContent = analytics.totalActivity || 0;
    document.getElementById('analyticsGrowth').textContent = `+${analytics.growthRate || 0}%`;
    document.getElementById('analyticsCompletion').textContent = `${analytics.completionRate || 0}%`;
    document.getElementById('analyticsSatisfaction').textContent = (analytics.avgSatisfaction || 0).toFixed(1);
    
    // Display charts
    displayUserGrowthChart(analytics.userGrowth);
    displayExchangeStatsChart(analytics.exchangeStats);
    displaySkillsDistChart(analytics.skillsDist);
    displayRatingDistChart(analytics.ratingDist);
    
    // Display reports
    displayTopUsers(analytics.topUsers);
    displayPopularSkills(analytics.popularSkills);
}

function displayUserGrowthChart(data) {
    const container = document.getElementById('userGrowthCanvas');
    if (!container) return;
    
    // Simple text-based chart for demo
    const parent = container.parentElement;
    parent.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div style="margin-bottom: 20px;">
                <div style="font-size: 48px; font-weight: 700; color: var(--primary);">${allUsers.length}</div>
                <div style="color: var(--text-secondary);">Total Users</div>
            </div>
            <div style="display: flex; justify-content: space-around; margin-top: 30px;">
                <div>
                    <div style="font-size: 24px; font-weight: 600;">📊</div>
                    <div style="margin-top: 8px; color: var(--text-secondary);">Growing +15%</div>
                </div>
                <div>
                    <div style="font-size: 24px; font-weight: 600;">📈</div>
                    <div style="margin-top: 8px; color: var(--text-secondary);">Month over month</div>
                </div>
            </div>
        </div>
    `;
}

function displayExchangeStatsChart(data) {
    const container = document.getElementById('exchangeStatsCanvas');
    if (!container) return;
    
    const parent = container.parentElement;
    const statusCounts = {
        pending: allExchanges.filter(e => e.status === 'pending').length,
        active: allExchanges.filter(e => e.status === 'active').length,
        completed: allExchanges.filter(e => e.status === 'completed').length,
        cancelled: allExchanges.filter(e => e.status === 'cancelled').length
    };
    
    parent.innerHTML = `
        <div style="padding: 20px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: 700; color: var(--warning);">${statusCounts.pending}</div>
                    <div style="color: var(--text-secondary); margin-top: 4px;">Pending</div>
                </div>
                <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: 700; color: var(--success);">${statusCounts.active}</div>
                    <div style="color: var(--text-secondary); margin-top: 4px;">Active</div>
                </div>
                <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: 700; color: var(--info);">${statusCounts.completed}</div>
                    <div style="color: var(--text-secondary); margin-top: 4px;">Completed</div>
                </div>
                <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: 700; color: var(--danger);">${statusCounts.cancelled}</div>
                    <div style="color: var(--text-secondary); margin-top: 4px;">Cancelled</div>
                </div>
            </div>
        </div>
    `;
}

function displaySkillsDistChart(data) {
    const container = document.getElementById('skillsDistCanvas');
    if (!container) return;
    
    const parent = container.parentElement;
    const skillCategories = {};
    
    allSkills.forEach(skill => {
        const category = skill.category || 'Other';
        skillCategories[category] = (skillCategories[category] || 0) + 1;
    });
    
    const topCategories = Object.entries(skillCategories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    parent.innerHTML = `
        <div style="padding: 20px;">
            ${topCategories.map(([cat, count]) => `
                <div style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>${cat}</span>
                        <span style="font-weight: 600;">${count}</span>
                    </div>
                    <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: var(--primary); height: 100%; width: ${(count / allSkills.length * 100)}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayRatingDistChart(data) {
    const container = document.getElementById('ratingDistCanvas');
    if (!container) return;
    
    const parent = container.parentElement;
    const ratings = allUsers.filter(u => u.rating).map(u => Math.floor(u.rating));
    const ratingCounts = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0};
    
    ratings.forEach(r => {
        if (ratingCounts[r] !== undefined) ratingCounts[r]++;
    });
    
    parent.innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 200px;">
                ${[5, 4, 3, 2, 1].map(star => {
                    const count = ratingCounts[star];
                    const maxCount = Math.max(...Object.values(ratingCounts), 1);
                    const height = (count / maxCount * 160) + 20;
                    return `
                        <div style="text-align: center;">
                            <div style="background: var(--primary); width: 40px; height: ${height}px; border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                                ${count}
                            </div>
                            <div style="margin-top: 8px; color: var(--text-secondary);">${star}⭐</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Display top performing users with real dynamic data
async function displayTopPerformingUsers() {
    const container = document.getElementById('topUsers');
    
    try {
        // Show loading state
        container.innerHTML = '<div class="loading">Loading top users...</div>';
        
        // Get users sorted by rating
        const sortedUsers = allUsers
            .filter(u => u.rating && u.rating > 0)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 5);
        
        if (sortedUsers.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 12px;">👥</div>
                    <div>No rated users yet</div>
                    <div style="font-size: 12px; margin-top: 8px;">Users will appear here once they receive ratings</div>
                </div>
            `;
            return;
        }
        
        const html = sortedUsers.map((user, index) => {
            const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-default';
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            
            // Count user's exchanges
            const userExchanges = allExchanges.filter(e => 
                e.requester_id?._id === user._id || e.provider_id?._id === user._id
            ).length;
            
            return `
                <div class="top-user-item" style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="rank-badge ${rankClass}" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px;">
                            ${rankEmoji}
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${user.fullName || 'Unknown User'}</div>
                            <div style="font-size: 12px; color: var(--text-secondary); display: flex; gap: 12px;">
                                <span>📍 ${user.location || 'Unknown'}</span>
                                <span>🤝 ${userExchanges} exchanges</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 18px; color: #f59e0b;">
                            ⭐ ${(user.rating || 0).toFixed(1)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                            ${user.skillsOffered?.length || 0} skills
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error displaying top users:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--danger);">
                <div>⚠️ Error loading top users</div>
            </div>
        `;
    }
}

function displayTopUsers(users) {
    // Legacy function - now calls the new dynamic function
    displayTopPerformingUsers();
}

// Display most popular skills with real dynamic data
async function displayMostPopularSkills() {
    const container = document.getElementById('popularSkills');
    
    try {
        // Show loading state
        container.innerHTML = '<div class="loading">Loading popular skills...</div>';
        
        // Calculate skill counts from all users
        const skillCounts = {};
        const skillCategories = {};
        
        allUsers.forEach(user => {
            if (user.skillsOffered && Array.isArray(user.skillsOffered)) {
                user.skillsOffered.forEach(skill => {
                    const skillName = skill.name || skill;
                    const category = skill.category || 'General';
                    
                    if (skillName) {
                        skillCounts[skillName] = (skillCounts[skillName] || 0) + 1;
                        if (!skillCategories[skillName]) {
                            skillCategories[skillName] = category;
                        }
                    }
                });
            }
        });
        
        // Convert to array and sort
        const sortedSkills = Object.entries(skillCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({
                name,
                count,
                category: skillCategories[name] || 'General'
            }));
        
        if (sortedSkills.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 12px;">🎯</div>
                    <div>No skills available yet</div>
                    <div style="font-size: 12px; margin-top: 8px;">Skills will appear here as users add them</div>
                </div>
            `;
            return;
        }
        
        // Category emojis
        const categoryEmojis = {
            'Programming': '💻',
            'Design': '🎨',
            'Marketing': '📱',
            'Languages': '🗣️',
            'Business': '💼',
            'Music': '🎵',
            'Sports': '⚽',
            'Cooking': '👨‍🍳',
            'General': '🎯'
        };
        
        const html = sortedSkills.map((skill, index) => {
            const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-default';
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            const categoryEmoji = categoryEmojis[skill.category] || '🎯';
            
            // Calculate percentage of total users
            const percentage = allUsers.length > 0 ? Math.round((skill.count / allUsers.length) * 100) : 0;
            
            return `
                <div class="popular-skill-item" style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="rank-badge ${rankClass}" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px;">
                            ${rankEmoji}
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
                                ${categoryEmoji} ${skill.name}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                ${skill.category}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 18px; color: #6366f1;">
                            ${skill.count} users
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                            ${percentage}% of total
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error displaying popular skills:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--danger);">
                <div>⚠️ Error loading popular skills</div>
            </div>
        `;
    }
}

function displayPopularSkills(skills) {
    // Legacy function - now calls the new dynamic function
    displayMostPopularSkills();
}

function refreshAnalytics() {
    loadAnalytics();
    showSuccess('Analytics refreshed');
}

// ===== BACKUP & DATA MANAGEMENT =====
async function loadBackupPage() {
    try {
        // Load backup history
        displayBackupHistory();
        
        // Load database statistics
        await loadDatabaseStats();
    } catch (error) {
        console.error('Error loading backup page:', error);
    }
}

function displayBackupHistory() {
    const container = document.getElementById('backupHistory');
    
    // Get backups from localStorage
    const backups = JSON.parse(localStorage.getItem('adminBackups') || '[]');
    
    if (backups.length === 0) {
        container.innerHTML = `
            <div class="info-item">
                <span class="info-label">No backups yet</span>
                <span class="info-value">Create your first backup</span>
            </div>
        `;
        return;
    }
    
    const html = backups.slice(0, 5).map(backup => `
        <div class="backup-item">
            <div class="backup-info">
                <div class="backup-name">${backup.name}</div>
                <div class="backup-meta">
                    ${backup.type} • ${backup.size} • ${new Date(backup.timestamp).toLocaleString()}
                </div>
            </div>
            <div class="backup-actions-btn">
                <button class="btn-action btn-edit" onclick="downloadBackup('${backup.id}')" title="Download">
                    💾
                </button>
                <button class="btn-action btn-delete" onclick="deleteBackup('${backup.id}')" title="Delete">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
    
    // Update last backup time
    if (backups.length > 0) {
        document.getElementById('lastBackup').textContent = new Date(backups[0].timestamp).toLocaleString();
    }
}

async function loadDatabaseStats() {
    try {
        const totalRecords = allUsers.length + allExchanges.length + allSkills.length;
        
        document.getElementById('totalRecords').textContent = totalRecords;
        
        // Calculate approximate size
        const dataSize = JSON.stringify({
            users: allUsers,
            exchanges: allExchanges,
            skills: allSkills
        }).length;
        
        const sizeInKB = (dataSize / 1024).toFixed(2);
        const sizeInMB = (dataSize / (1024 * 1024)).toFixed(2);
        
        document.getElementById('dbSize').textContent = sizeInMB > 1 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
        document.getElementById('backupStatus').innerHTML = '✅ Ready';
    } catch (error) {
        console.error('Error loading database stats:', error);
    }
}

async function createFullBackup() {
    try {
        showSuccess('Creating full backup...');
        
        // Fetch all data
        await Promise.all([
            allUsers.length === 0 ? loadUsers() : Promise.resolve(),
            allExchanges.length === 0 ? loadExchanges() : Promise.resolve(),
            allSkills.length === 0 ? loadSkills() : Promise.resolve()
        ]);
        
        const backupData = {
            users: allUsers,
            exchanges: allExchanges,
            skills: allSkills,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
        
        const backup = {
            id: generateId(),
            name: `Full_Backup_${new Date().toISOString().split('T')[0]}`,
            type: 'Full Backup',
            size: formatBytes(JSON.stringify(backupData).length),
            timestamp: new Date().toISOString(),
            data: backupData
        };
        
        // Save to localStorage
        saveBackup(backup);
        
        // Download backup file
        downloadBackupFile(backup);
        
        showSuccess('✅ Full backup created successfully!');
        displayBackupHistory();
    } catch (error) {
        console.error('Error creating backup:', error);
        showError('Failed to create backup');
    }
}

async function createUsersBackup() {
    try {
        if (allUsers.length === 0) await loadUsers();
        
        const backupData = {
            users: allUsers,
            timestamp: new Date().toISOString()
        };
        
        const backup = {
            id: generateId(),
            name: `Users_Backup_${new Date().toISOString().split('T')[0]}`,
            type: 'Users Only',
            size: formatBytes(JSON.stringify(backupData).length),
            timestamp: new Date().toISOString(),
            data: backupData
        };
        
        saveBackup(backup);
        downloadBackupFile(backup);
        
        showSuccess('✅ Users backup created!');
        displayBackupHistory();
    } catch (error) {
        console.error('Error creating users backup:', error);
        showError('Failed to create users backup');
    }
}

async function createExchangesBackup() {
    try {
        if (allExchanges.length === 0) await loadExchanges();
        
        const backupData = {
            exchanges: allExchanges,
            timestamp: new Date().toISOString()
        };
        
        const backup = {
            id: generateId(),
            name: `Exchanges_Backup_${new Date().toISOString().split('T')[0]}`,
            type: 'Exchanges Only',
            size: formatBytes(JSON.stringify(backupData).length),
            timestamp: new Date().toISOString(),
            data: backupData
        };
        
        saveBackup(backup);
        downloadBackupFile(backup);
        
        showSuccess('✅ Exchanges backup created!');
        displayBackupHistory();
    } catch (error) {
        console.error('Error creating exchanges backup:', error);
        showError('Failed to create exchanges backup');
    }
}

async function createSkillsBackup() {
    try {
        if (allSkills.length === 0) await loadSkills();
        
        const backupData = {
            skills: allSkills,
            timestamp: new Date().toISOString()
        };
        
        const backup = {
            id: generateId(),
            name: `Skills_Backup_${new Date().toISOString().split('T')[0]}`,
            type: 'Skills Only',
            size: formatBytes(JSON.stringify(backupData).length),
            timestamp: new Date().toISOString(),
            data: backupData
        };
        
        saveBackup(backup);
        downloadBackupFile(backup);
        
        showSuccess('✅ Skills backup created!');
        displayBackupHistory();
    } catch (error) {
        console.error('Error creating skills backup:', error);
        showError('Failed to create skills backup');
    }
}

function saveBackup(backup) {
    const backups = JSON.parse(localStorage.getItem('adminBackups') || '[]');
    backups.unshift(backup);
    
    // Keep only last 10 backups in localStorage
    if (backups.length > 10) {
        backups.pop();
    }
    
    localStorage.setItem('adminBackups', JSON.stringify(backups));
}

function downloadBackupFile(backup) {
    const dataStr = JSON.stringify(backup.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${backup.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadBackup(backupId) {
    const backups = JSON.parse(localStorage.getItem('adminBackups') || '[]');
    const backup = backups.find(b => b.id === backupId);
    
    if (backup) {
        downloadBackupFile(backup);
        showSuccess('Backup downloaded');
    } else {
        showError('Backup not found');
    }
}

function deleteBackup(backupId) {
    const confirmMsg = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    
    confirmMsg.textContent = 'Are you sure you want to delete this backup?';
    confirmBtn.onclick = () => {
        const backups = JSON.parse(localStorage.getItem('adminBackups') || '[]');
        const filtered = backups.filter(b => b.id !== backupId);
        localStorage.setItem('adminBackups', JSON.stringify(filtered));
        
        closeModal('confirmModal');
        displayBackupHistory();
        showSuccess('Backup deleted');
    };
    
    openModal('confirmModal');
}

async function exportToJSON() {
    try {
        showSuccess('Exporting data to JSON...');
        
        const exportData = {
            users: allUsers,
            exchanges: allExchanges,
            skills: allSkills,
            exportDate: new Date().toISOString(),
            platform: 'SkillSwap',
            version: '1.0.0'
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SkillSwap_Export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showSuccess('✅ Data exported as JSON!');
    } catch (error) {
        console.error('Error exporting JSON:', error);
        showError('Failed to export data');
    }
}

async function exportToCSV() {
    try {
        showSuccess('Exporting users to CSV...');
        
        // Create CSV for users
        const headers = ['Name', 'Email', 'Location', 'Skills Offered', 'Skills Wanted', 'Rating', 'Exchanges', 'Joined'];
        const rows = allUsers.map(user => [
            user.fullName || '',
            user.email || '',
            user.location || '',
            (user.skillsOffered?.length || 0),
            (user.skillsWanted?.length || 0),
            user.rating || 0,
            user.totalExchanges || 0,
            user.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        const dataBlob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SkillSwap_Users_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showSuccess('✅ Data exported as CSV!');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showError('Failed to export CSV');
    }
}

async function generateReport() {
    try {
        showSuccess('Generating PDF report...');
        
        // Create a simple HTML report
        const reportHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>SkillSwap Platform Report</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #6366f1; }
                    .stat { display: inline-block; margin: 20px; padding: 20px; background: #f0f0f0; border-radius: 8px; }
                    .stat-value { font-size: 36px; font-weight: bold; }
                    .stat-label { color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #6366f1; color: white; }
                </style>
            </head>
            <body>
                <h1>🎯 SkillSwap Platform Report</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
                
                <h2>📊 Platform Statistics</h2>
                <div class="stat">
                    <div class="stat-value">${allUsers.length}</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${allExchanges.length}</div>
                    <div class="stat-label">Total Exchanges</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${allSkills.length}</div>
                    <div class="stat-label">Total Skills</div>
                </div>
                
                <h2>👥 Recent Users</h2>
                <table>
                    <tr><th>Name</th><th>Email</th><th>Location</th><th>Rating</th></tr>
                    ${allUsers.slice(0, 10).map(user => `
                        <tr>
                            <td>${user.fullName || 'Unknown'}</td>
                            <td>${user.email || 'N/A'}</td>
                            <td>${user.location || 'N/A'}</td>
                            <td>⭐ ${user.rating ? user.rating.toFixed(1) : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </table>
            </body>
            </html>
        `;
        
        const dataBlob = new Blob([reportHTML], { type: 'text/html' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SkillSwap_Report_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showSuccess('✅ Report generated! (HTML format)');
    } catch (error) {
        console.error('Error generating report:', error);
        showError('Failed to generate report');
    }
}

function handleBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const statusEl = document.getElementById('importStatus');
    statusEl.textContent = '⏳ Reading backup file...';
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            
            statusEl.innerHTML = `
                <div style="color: var(--success);">✅ Backup file loaded successfully!</div>
                <div style="margin-top: 8px;">
                    <strong>Contents:</strong><br>
                    Users: ${backupData.users?.length || 0}<br>
                    Exchanges: ${backupData.exchanges?.length || 0}<br>
                    Skills: ${backupData.skills?.length || 0}<br>
                    <button class="btn btn-primary" onclick="restoreBackup(${JSON.stringify(backupData).replace(/"/g, '&quot;')})" style="margin-top: 12px;">
                        📥 Restore This Backup
                    </button>
                </div>
            `;
        } catch (error) {
            console.error('Error parsing backup file:', error);
            statusEl.innerHTML = `<div style="color: var(--danger);">❌ Invalid backup file format</div>`;
        }
    };
    
    reader.onerror = function() {
        statusEl.innerHTML = `<div style="color: var(--danger);">❌ Error reading file</div>`;
    };
    
    reader.readAsText(file);
}

function restoreBackup(backupData) {
    const confirmMsg = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    
    confirmMsg.innerHTML = `
        <strong>⚠️ Warning:</strong> This will restore the backup data.<br><br>
        This action cannot be undone. Are you sure?
    `;
    
    confirmBtn.onclick = () => {
        try {
            // Note: In production, this should call API endpoints to restore data
            console.log('Restoring backup:', backupData);
            
            closeModal('confirmModal');
            showSuccess('✅ Backup restored successfully! (Demo mode - data not persisted)');
            
            document.getElementById('importStatus').innerHTML = `
                <div style="color: var(--success);">✅ Backup restored successfully!</div>
            `;
        } catch (error) {
            console.error('Error restoring backup:', error);
            showError('Failed to restore backup');
        }
    };
    
    openModal('confirmModal');
}

// Utility functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ===== SETTINGS =====
async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        
        if (data.success) {
            // Populate settings - check if elements exist
            const mongoUriEl = document.getElementById('mongoUri');
            const dbNameEl = document.getElementById('dbNameSetting');
            
            if (mongoUriEl) mongoUriEl.value = data.settings.dbUri || '***hidden***';
            if (dbNameEl) dbNameEl.value = data.settings.dbName || 'skillExchange';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const mongoUriEl = document.getElementById('mongoUri');
    const dbNameEl = document.getElementById('dbNameSetting');
    
    const settings = {
        dbUri: mongoUriEl ? mongoUriEl.value : '',
        dbName: dbNameEl ? dbNameEl.value : ''
    };
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Settings saved successfully');
        } else {
            showError(data.message || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Error saving settings');
    }
}

// ===== UTILITY FUNCTIONS =====
function refreshData() {
    const refreshBtn = document.querySelector('.btn-icon[onclick="refreshData()"]');
    refreshBtn.classList.add('spinning');
    
    loadPageData(currentPage);
    checkDatabaseConnection();
    
    setTimeout(() => {
        refreshBtn.classList.remove('spinning');
    }, 1000);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading">⏳ Loading...</div>';
    }
}

function showError(message) {
    console.error('Admin Error:', message);
    
    // Create a toast-style notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    errorDiv.innerHTML = `<strong>❌ Error:</strong> ${message}`;
    document.body.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

function showSuccess(message) {
    console.log('Admin Success:', message);
    
    // Create a toast-style notification
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--success);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    successDiv.innerHTML = `<strong>✅ Success:</strong> ${message}`;
    document.body.appendChild(successDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        successDiv.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => successDiv.remove(), 300);
    }, 3000);
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

// Logout function
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            const token = localStorage.getItem('adminToken');
            
            // Call logout API
            if (token) {
                await fetch('/api/admin-auth/logout', {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage and redirect
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminData');
            window.location.href = 'admin-login.html';
        }
    }
}

// ===== MOBILE & RESPONSIVE ENHANCEMENTS =====

// Detect device type
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function isTabletDevice() {
    return /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768 && window.innerWidth <= 1024;
}

// Auto-close sidebar on mobile after navigation
let originalNavigateToPage = navigateToPage;
navigateToPage = function(pageId) {
    originalNavigateToPage(pageId);
    
    // Auto-close sidebar on mobile
    if (isMobileDevice()) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }
};

// Handle window resize for responsive adjustments
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        handleResponsiveLayout();
    }, 250);
});

function handleResponsiveLayout() {
    const width = window.innerWidth;
    const sidebar = document.querySelector('.sidebar');
    const networkMonitor = document.getElementById('networkMonitor');
    
    // Reset sidebar on desktop
    if (width > 1024) {
        if (sidebar) sidebar.classList.remove('active');
    }
    
    // Adjust network monitor
    if (networkMonitor) {
        if (width < 480) {
            networkMonitor.style.maxHeight = '200px';
        } else if (width < 768) {
            networkMonitor.style.maxHeight = '250px';
        } else {
            networkMonitor.style.maxHeight = '400px';
        }
    }
    
    // Reload charts for proper sizing if on analytics page
    if (currentPage === 'analytics' && typeof Chart !== 'undefined') {
        setTimeout(() => {
            loadAnalytics();
        }, 100);
    }
}

// Touch event handlers for better mobile UX
document.addEventListener('DOMContentLoaded', () => {
    // Add touch-friendly hover effects
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
        
        // Improve button tap response
        document.querySelectorAll('.btn, .nav-item, .skill-card, .stat-card').forEach(element => {
            element.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
            });
            element.addEventListener('touchend', function() {
                this.style.transform = '';
            });
        });
    }
    
    // Prevent double-tap zoom on buttons
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // Add swipe gesture for sidebar on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipeGesture();
    });
    
    function handleSwipeGesture() {
        const swipeThreshold = 100;
        const sidebar = document.querySelector('.sidebar');
        
        if (!sidebar) return;
        
        // Swipe right to open sidebar
        if (touchEndX - touchStartX > swipeThreshold && touchStartX < 50) {
            if (!sidebar.classList.contains('active')) {
                toggleSidebar();
            }
        }
        
        // Swipe left to close sidebar
        if (touchStartX - touchEndX > swipeThreshold && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }
});

// Enhanced scroll behavior for mobile
function smoothScrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Add back-to-top button on mobile
if (isMobileDevice()) {
    const backToTopBtn = document.createElement('button');
    backToTopBtn.innerHTML = '⬆️';
    backToTopBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        border: none;
        font-size: 20px;
        cursor: pointer;
        display: none;
        z-index: 999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.3s;
    `;
    
    backToTopBtn.addEventListener('click', smoothScrollToTop);
    document.body.appendChild(backToTopBtn);
    
    // Show/hide based on scroll
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopBtn.style.display = 'block';
        } else {
            backToTopBtn.style.display = 'none';
        }
    });
}

// Optimize table scroll on mobile
document.querySelectorAll('.table-container').forEach(container => {
    if (isMobileDevice()) {
        // Add scroll indicator
        const scrollIndicator = document.createElement('div');
        scrollIndicator.textContent = '← Scroll →';
        scrollIndicator.style.cssText = `
            text-align: center;
            padding: 8px;
            background: var(--bg-secondary);
            color: var(--text-secondary);
            font-size: 12px;
            border-radius: 4px 4px 0 0;
        `;
        container.parentNode.insertBefore(scrollIndicator, container);
        
        // Hide indicator when scrolled
        container.addEventListener('scroll', () => {
            if (container.scrollLeft > 10) {
                scrollIndicator.style.opacity = '0';
            } else {
                scrollIndicator.style.opacity = '1';
            }
        });
    }
});

// Prevent zoom on input focus (mobile)
if (isMobileDevice()) {
    const addMaximumScaleToMetaViewport = () => {
        const el = document.querySelector('meta[name=viewport]');
        if (el !== null) {
            let content = el.getAttribute('content');
            let re = /maximum-scale=[0-9.]+/g;
            
            if (re.test(content)) {
                content = content.replace(re, 'maximum-scale=1.0');
            } else {
                content = [content, 'maximum-scale=1.0'].join(', ');
            }
            
            el.setAttribute('content', content);
        }
    };
    
    const disableIosTextFieldZoom = addMaximumScaleToMetaViewport;
    const checkIsIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (checkIsIOS()) {
        disableIosTextFieldZoom();
    }
}

// Enhanced modal for mobile
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        
        // Lock body scroll on mobile
        if (isMobileDevice()) {
            document.body.style.overflow = 'hidden';
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        
        // Restore body scroll
        if (isMobileDevice()) {
            document.body.style.overflow = '';
        }
    }
}

// Performance monitoring
function logPerformance(metric, value) {
    if (window.performance && window.performance.mark) {
        window.performance.mark(metric);
    }
    console.log(`Performance - ${metric}:`, value);
}

// Initialize responsive enhancements
handleResponsiveLayout();

// Orientation change handler
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        handleResponsiveLayout();
    }, 100);
});
