/**
 * Chat Manager Module
 * Handles all chat message lifecycle, sync, and display
 */

class ChatManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.messages = [];
    this.listeners = [];
    this.rateLimiter = rateLimiters.chatMessage;
    this.isLoading = false;
    this.callbacks = {
      onMessageAdded: [],
      onMessageDeleted: [],
      onMessageEdited: [],
      onError: [],
      onLoadingStateChange: []
    };
  }

  /**
   * Register callback for events
   */
  on(eventName, callback) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName].push(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(eventName, data) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName].forEach(cb => cb(data));
    }
  }

  /**
   * Set loading state and emit event
   */
  setLoading(isLoading) {
    this.isLoading = isLoading;
    this.emit('onLoadingStateChange', isLoading);
  }

  /**
   * Send a message with validation
   */
  async sendMessage(content, currentChatId) {
    try {
      // Validate input
      if (!content?.trim()) {
        throw new Error('Message cannot be empty');
      }

      if (content.trim().length > 5000) {
        throw new Error('Message too long (max 5000 characters)');
      }

      // Check rate limit
      if (!this.rateLimiter.isAllowed(this.userId)) {
        const remaining = this.rateLimiter.getRemaining(this.userId);
        throw new Error(`Rate limited. Try again in a moment. (${remaining} remaining)`);
      }

      this.setLoading(true);

      const message = {
        userId: this.userId,
        content: content.trim(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        edited: false,
        reactions: {},
        chatId: currentChatId
      };

      // Send to backend with validation
      const docId = await firebaseManager.addDocument('messages', message);

      logger.info('Message sent', { docId });

      return docId;
    } catch (error) {
      logger.error('Failed to send message', error);
      this.emit('onError', { message: error.message, type: 'send' });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Edit a message with validation
   */
  async editMessage(messageId, newContent) {
    try {
      // Get original message to verify ownership
      const original = await firebaseManager.getDocument('messages', messageId);

      if (!original) {
        throw new Error('Message not found');
      }

      if (original.userId !== this.userId) {
        throw new Error('You can only edit your own messages');
      }

      if (newContent?.trim().length > 5000) {
        throw new Error('Message too long (max 5000 characters)');
      }

      this.setLoading(true);

      await firebaseManager.updateDocument('messages', messageId, {
        content: newContent.trim(),
        edited: true,
        editedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      logger.info('Message edited', { messageId });
      this.emit('onMessageEdited', { messageId, content: newContent });

      return true;
    } catch (error) {
      logger.error('Failed to edit message', error);
      this.emit('onError', { message: error.message, type: 'edit' });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Delete a message with verification
   */
  async deleteMessage(messageId) {
    try {
      // Get message to verify ownership
      const message = await firebaseManager.getDocument('messages', messageId);

      if (!message) {
        throw new Error('Message not found');
      }

      if (message.userId !== this.userId) {
        throw new Error('You can only delete your own messages');
      }

      this.setLoading(true);

      // Soft delete - keep for audit trail
      await firebaseManager.updateDocument('messages', messageId, {
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        content: '[deleted]'
      });

      logger.info('Message deleted', { messageId });
      this.emit('onMessageDeleted', { messageId });

      return true;
    } catch (error) {
      logger.error('Failed to delete message', error);
      this.emit('onError', { message: error.message, type: 'delete' });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId, emoji) {
    try {
      if (!messageId || !emoji) {
        throw new Error('Invalid message or emoji');
      }

      const message = await firebaseManager.getDocument('messages', messageId);
      if (!message) throw new Error('Message not found');

      const reactions = message.reactions || {};
      const reactionKey = emoji;
      const userReactions = reactions[reactionKey] || [];

      // Toggle reaction
      if (userReactions.includes(this.userId)) {
        reactions[reactionKey] = userReactions.filter(id => id !== this.userId);
        if (reactions[reactionKey].length === 0) {
          delete reactions[reactionKey];
        }
      } else {
        reactions[reactionKey] = [...userReactions, this.userId];
      }

      await firebaseManager.updateDocument('messages', messageId, { reactions });
      logger.info('Reaction added', { messageId, emoji });

      return true;
    } catch (error) {
      logger.error('Failed to add reaction', error);
      throw error;
    }
  }

  /**
   * Subscribe to chat messages
   */
  subscribeToChat(chatId) {
    try {
      const unsubscribe = this.db.subscribe(
        'messages',
        messages => {
          this.messages = messages.filter(m => !m.deleted);
          this.emit('onMessagesLoaded', this.messages);
        },
        query => query.where('chatId', '==', chatId).orderBy('timestamp', 'asc')
      );

      this.listeners.push(unsubscribe);
      return unsubscribe;
    } catch (error) {
      logger.error('Failed to subscribe to chat', error);
      this.emit('onError', { message: error.message, type: 'subscribe' });
      throw error;
    }
  }

  /**
   * Load message history with pagination
   */
  async loadHistory(chatId, limit = 50, beforeTimestamp = null) {
    try {
      this.setLoading(true);

      let query = query => query
        .where('chatId', '==', chatId)
        .where('deleted', '!=', true)
        .orderBy('deleted')
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (beforeTimestamp) {
        query = query => query
          .where('chatId', '==', chatId)
          .orderBy('timestamp', 'desc')
          .startAfter(beforeTimestamp)
          .limit(limit);
      }

      const messages = await firebaseManager.getCollection('messages', {
        orderBy: ['timestamp', 'desc'],
        limit
      });

      return messages.reverse();
    } catch (error) {
      logger.error('Failed to load history', error);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Search messages
   */
  async searchMessages(chatId, query, limit = 20) {
    try {
      if (!query?.trim()) return [];

      const tokens = query.toLowerCase().split(/\s+/);

      const messages = await firebaseManager.getCollection('messages', {
        where: q => q.where('chatId', '==', chatId)
      });

      // Client-side search
      return messages
        .filter(msg => {
          const content = msg.content.toLowerCase();
          return tokens.some(token => content.includes(token));
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Search failed', error);
      throw error;
    }
  }

  /**
   * Cleanup all listeners
   */
  destroy() {
    this.listeners.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (e) {
        logger.warn('Listener cleanup error', e);
      }
    });
    this.listeners = [];
    this.messages = [];
  }

  /**
   * Get message count
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * Get messages by user
   */
  getMessagesByUser(userId) {
    return this.messages.filter(m => m.userId === userId);
  }

  /**
   * Get recent messages
   */
  getRecentMessages(count = 20) {
    return this.messages.slice(-count);
  }
}
