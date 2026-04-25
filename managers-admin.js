/**
 * Admin Manager Module
 * Handles admin catalog, user management, bans, and statistics
 */

class AdminManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.userRole = null;
    this.isAdmin = false;
    this.rateLimiter = rateLimiters.adminAction;
    this.callbacks = {
      onRoleVerified: [],
      onGameApproved: [],
      onGameRemoved: [],
      onUserBanned: [],
      onStatsLoaded: [],
      onError: []
    };
  }

  /**
   * Register callback
   */
  on(eventName, callback) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName].push(callback);
    }
  }

  /**
   * Emit event
   */
  emit(eventName, data) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName].forEach(cb => cb(data));
    }
  }

  /**
   * Verify admin role from server (CRITICAL: Never trust client)
   */
  async verifyAdminRole() {
    try {
      const claims = await firebaseManager.getUserClaims();

      // Server-issued claims
      const role = claims.role || 'user';
      this.userRole = role;
      this.isAdmin = role === 'admin' || role === 'owner' || role === 'mod';

      logger.info('Admin role verified', { role: this.userRole });
      this.emit('onRoleVerified', { role: this.userRole, isAdmin: this.isAdmin });

      return this.isAdmin;
    } catch (error) {
      logger.error('Failed to verify admin role', error);
      this.isAdmin = false;
      return false;
    }
  }

  /**
   * Guard for admin-only functions
   */
  requiresAdmin(functionName) {
    if (!this.isAdmin) {
      logger.error(`Unauthorized admin access attempt: ${functionName}`);
      throw new Error('You do not have permission to perform this action');
    }
  }

  /**
   * Add/Edit game in catalog
   */
  async submitCatalogGame(gameData) {
    try {
      this.requiresAdmin('submitCatalogGame');

      // Check rate limit
      if (!this.rateLimiter.isAllowed('catalog_submit')) {
        throw new Error('Too many requests. Please wait a moment.');
      }

      // Validate all fields
      const titleError = validateInput(gameData.title, {
        required: true,
        maxLength: 100
      });
      if (titleError) throw new Error(`Title: ${titleError}`);

      const urlError = validateGameURL(gameData.url);
      if (urlError) throw new Error(`URL: ${urlError}`);

      const iconError = validateImageURL(gameData.icon);
      if (iconError) throw new Error(`Icon: ${iconError}`);

      const bgError = validateImageURL(gameData.img);
      if (bgError) throw new Error(`Background: ${bgError}`);

      // Prepare game document
      const game = {
        title: escapeHtml(gameData.title.trim()),
        url: gameData.url.trim(),
        icon: gameData.icon.trim(),
        img: gameData.img.trim(),
        desc: escapeHtml((gameData.desc || '').trim()),
        category: escapeHtml(gameData.category || 'Games'),
        type: escapeHtml(gameData.type || 'games'),
        addedBy: this.userId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      // Add or update
      let docId = gameData.id;
      if (docId) {
        await firebaseManager.updateDocument(game.type, docId, game);
        logger.info('Game updated', { docId, title: game.title });
      } else {
        // Auto-generate ID from title
        docId = game.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        game.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        game.id = docId;

        await firebaseManager.updateDocument(game.type, docId, game);
        logger.info('Game added', { docId, title: game.title });
      }

      this.emit('onGameApproved', { docId, game });
      return docId;
    } catch (error) {
      logger.error('Catalog submission failed', error);
      this.emit('onError', error);
      throw error;
    }
  }

  /**
   * Delete game from catalog
   */
  async deleteGame(type, gameId, title) {
    try {
      this.requiresAdmin('deleteGame');

      if (!rateLimiters.adminAction.isAllowed(this.userId)) {
        throw new Error('Rate limited. Please wait before performing another action.');
      }

      await firebaseManager.deleteDocument(type, gameId);

      logger.info('Game deleted', { gameId, type, title });
      this.emit('onGameRemoved', { gameId, type });

      return true;
    } catch (error) {
      logger.error('Failed to delete game', error);
      this.emit('onError', error);
      throw error;
    }
  }

  /**
   * Load all users
   */
  async loadUsers(limit = 50) {
    try {
      this.requiresAdmin('loadUsers');

      const users = await firebaseManager.getCollection('users', {
        limit,
        orderBy: ['createdAt', 'desc']
      });

      return users.map(user => ({
        ...user,
        role: user.role || 'user',
        banned: user.banned || false
      }));
    } catch (error) {
      logger.error('Failed to load users', error);
      throw error;
    }
  }

  /**
   * Ban user
   */
  async banUser(userId, reason) {
    try {
      this.requiresAdmin('banUser');

      if (!userId || !reason) {
        throw new Error('User ID and reason required');
      }

      if (reason.length > 500) {
        throw new Error('Reason too long (max 500 characters)');
      }

      await firebaseManager.updateDocument('users', userId, {
        banned: true,
        banReason: escapeHtml(reason.trim()),
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        bannedBy: this.userId
      });

      logger.info('User banned', { userId, reason });
      this.emit('onUserBanned', { userId, reason });

      return true;
    } catch (error) {
      logger.error('Failed to ban user', error);
      throw error;
    }
  }

  /**
   * Unban user
   */
  async unbanUser(userId) {
    try {
      this.requiresAdmin('unbanUser');

      await firebaseManager.updateDocument('users', userId, {
        banned: false,
        banReason: null,
        bannedAt: null
      });

      logger.info('User unbanned', { userId });

      return true;
    } catch (error) {
      logger.error('Failed to unban user', error);
      throw error;
    }
  }

  /**
   * Ban device
   */
  async banDevice(deviceFingerprint, reason) {
    try {
      this.requiresAdmin('banDevice');

      await firebaseManager.updateDocument('deviceBans', deviceFingerprint, {
        reason: escapeHtml(reason),
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        bannedBy: this.userId
      });

      logger.info('Device banned', { deviceFingerprint, reason });

      return true;
    } catch (error) {
      logger.error('Failed to ban device', error);
      throw error;
    }
  }

  /**
   * Load statistics
   */
  async loadStatistics() {
    try {
      this.requiresAdmin('loadStatistics');

      // Get counts
      const gamesSnap = await this.db.collection('games').get();
      const usersSnap = await this.db.collection('users').get();
      const messagesSnap = await this.db.collection('messages').get();
      const sessionsSnap = await this.db.collection('playSessions').get();

      // Get daily stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();

      const newUsersToday = await this.db
        .collection('users')
        .where('createdAt', '>=', new Date(todayMs))
        .get();

      const messagestoday = await this.db
        .collection('messages')
        .where('timestamp', '>=', new Date(todayMs))
        .get();

      const stats = {
        totalGames: gamesSnap.size,
        totalUsers: usersSnap.size,
        totalMessages: messagesSnap.size,
        totalPlaySessions: sessionsSnap.size,
        newUsersToday: newUsersToday.size,
        messagesToday: messagestoday.size,
        timestamp: new Date()
      };

      logger.info('Statistics loaded', stats);
      this.emit('onStatsLoaded', stats);

      return stats;
    } catch (error) {
      logger.error('Failed to load statistics', error);
      throw error;
    }
  }

  /**
   * Get pending game submissions
   */
  async getPendingSubmissions(limit = 20) {
    try {
      this.requiresAdmin('getPendingSubmissions');

      const submissions = await firebaseManager.getCollection('gameSubmissions', {
        limit,
        orderBy: ['createdAt', 'asc']
      });

      return submissions.filter(s => s.status === 'pending');
    } catch (error) {
      logger.error('Failed to load submissions', error);
      throw error;
    }
  }

  /**
   * Approve game submission
   */
  async approveSubmission(submissionId) {
    try {
      this.requiresAdmin('approveSubmission');

      const submission = await firebaseManager.getDocument('gameSubmissions', submissionId);
      if (!submission) throw new Error('Submission not found');

      // Copy to games collection
      const gameId = submission.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');

      await firebaseManager.updateDocument(submission.type || 'games', gameId, {
        title: submission.title,
        url: submission.url,
        icon: submission.icon,
        img: submission.img,
        desc: submission.desc,
        category: submission.category,
        addedBy: submission.addedBy,
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: this.userId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Mark submission as approved
      await firebaseManager.updateDocument('gameSubmissions', submissionId, {
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      logger.info('Submission approved', { submissionId });

      return gameId;
    } catch (error) {
      logger.error('Failed to approve submission', error);
      throw error;
    }
  }

  /**
   * Reject game submission
   */
  async rejectSubmission(submissionId, reason) {
    try {
      this.requiresAdmin('rejectSubmission');

      await firebaseManager.updateDocument('gameSubmissions', submissionId, {
        status: 'rejected',
        rejectionReason: escapeHtml(reason),
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        rejectedBy: this.userId
      });

      logger.info('Submission rejected', { submissionId, reason });

      return true;
    } catch (error) {
      logger.error('Failed to reject submission', error);
      throw error;
    }
  }
}
