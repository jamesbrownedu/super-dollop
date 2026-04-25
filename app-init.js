/**
 * GameUI Initialization & Bootstrap
 * Initializes all managers and sets up the application
 */

// Global state
let firebaseManager;
let currentUser = null;

let chatManager;
let gameManager;
let adminManager;

let currentChatId = null;

/**
 * Initialize application on page load
 */
async function initializeApp() {
  try {
    logger.info('Initializing GameUI application...');

    // 1. Initialize Firebase
    firebaseManager = new FirebaseManager();
    await firebaseManager.initialize();
    logger.info('Firebase initialized');

    // 2. Set up auth state listener
    firebaseManager.auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        logger.info('User authenticated', { uid: user.uid, email: user.email });
        
        // Initialize managers
        chatManager = new ChatManager(firebaseManager.db, user.uid);
        gameManager = new GameManager(firebaseManager.db, user.uid);
        adminManager = new AdminManager(firebaseManager.db, user.uid);

        // Setup event listeners
        setupEventListeners();

        // Verify admin role from server
        await adminManager.verifyAdminRole();

        // Load initial data
        await loadInitialData();

        // Show main UI
        showMainUI();
      } else {
        currentUser = null;
        logger.info('User logged out');
        
        // Cleanup listeners
        if (chatManager) chatManager.destroy();
        if (firebaseManager) firebaseManager.cleanupAllListeners();

        // Show auth UI
        showAuthUI();
      }
    });

    logger.info('App initialization complete');
  } catch (error) {
    logger.error('App initialization failed', error);
    showErrorUI('Failed to initialize app: ' + error.message);
  }
}

/**
 * Load initial data
 */
async function loadInitialData() {
  try {
    logger.info('Loading initial data...');

    // Load games
    await gameManager.loadGames();
    renderGameCatalog();

    // Load favorites
    await gameManager.loadFavorites();

    // Subscribe to chat if in a chat
    if (currentChatId) {
      chatManager.subscribeToChat(currentChatId);
    }

    logger.info('Initial data loaded');
  } catch (error) {
    logger.error('Failed to load initial data', error);
    showToast('Failed to load data: ' + error.message);
  }
}

/**
 * Setup event listeners for UI interactions
 */
function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    const searchDebouncer = new Debouncer(() => {
      const query = searchInput.value.trim();
      const results = gameManager.search(query);
      renderSearchResults(results);
    }, 300);

    searchInput.addEventListener('input', () => {
      searchDebouncer.execute();
    });
  }

  // Game tile clicks - with debounce
  const gameClickThrottler = new Throttler(() => {
    const tiles = document.querySelectorAll('.game-tile');
    tiles.forEach(tile => {
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameId = tile.dataset.gameId;
        if (gameId) {
          handleGameClick(gameId);
        }
      });
    });
  }, 100);

  gameClickThrottler.execute();

  // Chat input
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await handleSendMessage(chatInput.value);
        chatInput.value = '';
      }
    });
  }

  // Modal events
  setupModalListeners();

  logger.info('Event listeners setup complete');
}

/**
 * Handle game tile click
 */
async function handleGameClick(gameId) {
  try {
    const game = gameManager.games.find(g => g.id === gameId);
    if (!game) {
      showToast('Game not found');
      return;
    }

    // Record play session
    await gameManager.recordPlaySession(gameId, 0);

    // Show game info modal
    showGameModal(game);

    logger.info('Game clicked', { gameId, title: game.title });
  } catch (error) {
    logger.error('Failed to handle game click', error);
    showToast('Error loading game');
  }
}

/**
 * Handle send message
 */
async function handleSendMessage(content) {
  try {
    if (!content?.trim()) return;

    if (!currentChatId) {
      showToast('No chat selected');
      return;
    }

    const messageId = await chatManager.sendMessage(content, currentChatId);
    logger.info('Message sent', { messageId });
    showToast('Message sent');
  } catch (error) {
    logger.error('Failed to send message', error);
    showToast('Error: ' + error.message);
  }
}

/**
 * Render game catalog
 */
function renderGameCatalog() {
  try {
    const container = document.getElementById('game-grid');
    if (!container) return;

    const games = gameManager.getSortedGames(gameManager.games, 'title');

    const html = games.map(game => `
      <div class="game-tile" data-game-id="${escapeHtml(game.id)}" title="${escapeHtml(game.title)}">
        <img src="${escapeHtml(game.img || game.icon || '')}" alt="${escapeHtml(game.title)}" loading="lazy">
        <div class="game-title-popup">${escapeHtml(game.title)}</div>
        ${game.isFavorite ? '<i class="fas fa-heart favorite-badge" style="position:absolute;top:4px;right:4px;color:#ff6b9d;"></i>' : ''}
      </div>
    `).join('');

    container.innerHTML = html;

    // Re-attach listeners
    setupEventListeners();
  } catch (error) {
    logger.error('Failed to render catalog', error);
  }
}

/**
 * Render search results
 */
function renderSearchResults(results) {
  try {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = '<div class="text-gray-400 text-center py-8">No games found</div>';
      return;
    }

    const html = results.map(game => `
      <div class="game-tile" data-game-id="${escapeHtml(game.id)}">
        <img src="${escapeHtml(game.img || game.icon || '')}" alt="${escapeHtml(game.title)}" loading="lazy">
        <div class="game-title-popup">${escapeHtml(game.title)}</div>
      </div>
    `).join('');

    container.innerHTML = html;
    setupEventListeners();
  } catch (error) {
    logger.error('Failed to render search results', error);
  }
}

/**
 * Show game details modal
 */
function showGameModal(game) {
  try {
    const modal = document.getElementById('game-modal');
    if (!modal) return;

    const html = `
      <div class="modal-overlay active" id="game-modal-overlay" onclick="closeModals()">
        <div class="modal-content" style="max-width: 600px;" onclick="event.stopPropagation()">
          <button class="modal-close" onclick="closeModals()"><i class="fas fa-times"></i></button>
          
          <div style="background-image: url('${escapeHtml(game.img || '')}'); background-size: cover; background-position: center; height: 200px; border-radius: 8px; margin-bottom: 16px;"></div>
          
          <h2 class="text-2xl font-bold mb-2">${escapeHtml(game.title)}</h2>
          <p class="text-sm text-gray-400 mb-4">${escapeHtml(game.category || 'Game')}</p>
          
          <p class="text-gray-300 mb-4">${escapeHtml(game.desc || 'No description available')}</p>
          
          <div class="flex gap-2 mb-4">
            <button class="btn-primary flex-1" onclick="openGameInNewTab('${escapeHtml(game.url)}')">
              <i class="fas fa-play mr-2"></i>Play Game
            </button>
            <button class="btn-secondary" onclick="toggleGameFavorite('${escapeHtml(game.id)}')">
              <i class="fas fa-${game.isFavorite ? 'heart' : 'heart'} mr-2"></i>${game.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.innerHTML += html;
    }
  } catch (error) {
    logger.error('Failed to show game modal', error);
  }
}

/**
 * Open game in new tab
 */
async function openGameInNewTab(url) {
  try {
    // Validate URL before opening
    const error = validateGameURL(url);
    if (error) {
      showToast('Invalid game URL: ' + error);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    logger.info('Game opened in new tab', { url });
  } catch (error) {
    logger.error('Failed to open game', error);
    showToast('Failed to open game');
  }
}

/**
 * Toggle game favorite
 */
async function toggleGameFavorite(gameId) {
  try {
    const isFav = await gameManager.toggleFavorite(gameId);
    showToast(isFav ? 'Added to favorites' : 'Removed from favorites');
    renderGameCatalog();
  } catch (error) {
    logger.error('Failed to toggle favorite', error);
    showToast('Error: ' + error.message);
  }
}

/**
 * Show UI when authenticated
 */
function showMainUI() {
  const authUI = document.getElementById('auth-modal');
  const mainUI = document.getElementById('main-screen');

  if (authUI) authUI.classList.add('hidden');
  if (mainUI) mainUI.classList.remove('hidden');
}

/**
 * Show auth UI when logged out
 */
function showAuthUI() {
  const authUI = document.getElementById('auth-modal');
  const mainUI = document.getElementById('main-screen');

  if (authUI) authUI.classList.remove('hidden');
  if (mainUI) mainUI.classList.add('hidden');
}

/**
 * Show error UI
 */
function showErrorUI(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed inset-0 bg-red-900/90 flex items-center justify-center z-50';
  errorDiv.innerHTML = `
    <div class="bg-red-800 p-8 rounded-lg max-w-md text-center">
      <h2 class="text-xl font-bold mb-4 text-white">Initialization Error</h2>
      <p class="text-red-100 mb-6">${escapeHtml(message)}</p>
      <button onclick="location.reload()" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded">
        Reload Page
      </button>
    </div>
  `;
  document.body.appendChild(errorDiv);
}

/**
 * Setup modal event listeners
 */
function setupModalListeners() {
  // Close modals on background click
  window.closeModals = function() {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      // Open search
      const searchModal = document.getElementById('search-modal');
      if (searchModal) {
        searchModal.classList.add('active');
        document.getElementById('search-input')?.focus();
      }
    }
  });
}

/**
 * Initialize on DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Wait for Firebase to be loaded
    if (typeof firebase === 'undefined') {
      logger.error('Firebase SDK not loaded');
      showErrorUI('Firebase SDK failed to load');
      return;
    }

    // Initialize app
    await initializeApp();
  } catch (error) {
    logger.error('DOMContentLoaded error', error);
    showErrorUI('Failed to start application');
  }
});

// Global toast function
function showToast(message, duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 transform translate-y-full opacity-0 transition-all duration-300 pointer-events-auto';
  toast.innerHTML = `<i class="fas fa-bell text-blue-400"></i> <span class="font-medium text-sm flex-1">${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-full', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-full', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

logger.info('GameUI initialization script loaded');
