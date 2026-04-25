/**
 * Game Manager Module
 * Handles game catalog, favorites, ratings, search, and recommendations
 */

class GameManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.games = [];
    this.favorites = new Set();
    this.ratings = new Map();
    this.searchIndex = [];
    this.callbacks = {
      onGamesLoaded: [],
      onGameAdded: [],
      onGameUpdated: [],
      onFavoritesChanged: [],
      onError: []
    };
    this.filterState = {
      category: null,
      searchQuery: '',
      sortBy: 'title'
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
   * Emit event
   */
  emit(eventName, data) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName].forEach(cb => cb(data));
    }
  }

  /**
   * Load all games
   */
  async loadGames() {
    try {
      const games = await firebaseManager.getCollection('games', {
        orderBy: ['title', 'asc']
      });

      this.games = games.map(g => ({
        ...g,
        rating: null,
        isFavorite: this.favorites.has(g.id)
      }));

      this.buildSearchIndex();
      this.emit('onGamesLoaded', this.games);

      return this.games;
    } catch (error) {
      logger.error('Failed to load games', error);
      this.emit('onError', error);
      throw error;
    }
  }

  /**
   * Build search index for quick lookup
   */
  buildSearchIndex() {
    this.searchIndex = this.games.map(game => ({
      id: game.id,
      tokens: this.tokenize(
        `${game.title} ${game.desc || ''} ${game.category || ''}`
      ),
      game
    }));
  }

  /**
   * Tokenize text for search
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(token => token.length > 1);
  }

  /**
   * Search games with autocomplete
   */
  search(query, limit = 10) {
    if (!query?.trim()) return [];

    const tokens = this.tokenize(query);
    const results = this.searchIndex
      .map(item => ({
        score: this.calculateMatchScore(item.tokens, tokens),
        game: item.game
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results.map(r => r.game);
  }

  /**
   * Calculate match score for search
   */
  calculateMatchScore(itemTokens, queryTokens) {
    return queryTokens.reduce((score, token) => {
      const matches = itemTokens.filter(t => t.includes(token)).length;
      return score + (matches > 0 ? 5 : 0);
    }, 0);
  }

  /**
   * Filter games
   */
  getFilteredGames(options = {}) {
    const { category = null, tag = null, minRating = 0 } = options;

    let filtered = this.games;

    if (category) {
      filtered = filtered.filter(g => g.category === category);
    }

    if (tag) {
      filtered = filtered.filter(g => 
        (g.tags || []).includes(tag)
      );
    }

    if (minRating > 0) {
      filtered = filtered.filter(g => 
        (g.averageRating || 0) >= minRating
      );
    }

    return filtered;
  }

  /**
   * Sort games
   */
  getSortedGames(games, sortBy = 'title') {
    const sorted = [...games];

    switch (sortBy) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        break;
      case 'newest':
        sorted.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );
        break;
      case 'popular':
        sorted.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        break;
    }

    return sorted;
  }

  /**
   * Toggle favorite
   */
  async toggleFavorite(gameId) {
    try {
      const isFavorite = this.favorites.has(gameId);

      if (isFavorite) {
        this.favorites.delete(gameId);
      } else {
        this.favorites.add(gameId);
      }

      // Save to database
      await firebaseManager.updateDocument('users', this.userId, {
        favorites: Array.from(this.favorites),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Update game
      const game = this.games.find(g => g.id === gameId);
      if (game) {
        game.isFavorite = !isFavorite;
      }

      this.emit('onFavoritesChanged', {
        gameId,
        isFavorite: !isFavorite
      });

      logger.info('Favorite toggled', { gameId, isFavorite: !isFavorite });
      return !isFavorite;
    } catch (error) {
      logger.error('Failed to toggle favorite', error);
      throw error;
    }
  }

  /**
   * Load user favorites
   */
  async loadFavorites() {
    try {
      const userDoc = await firebaseManager.getDocument('users', this.userId);
      const favorites = userDoc?.favorites || [];
      this.favorites = new Set(favorites);

      // Update games
      this.games.forEach(game => {
        game.isFavorite = this.favorites.has(game.id);
      });

      return favorites;
    } catch (error) {
      logger.error('Failed to load favorites', error);
      throw error;
    }
  }

  /**
   * Get favorite games
   */
  getFavorites() {
    return this.games.filter(g => g.isFavorite);
  }

  /**
   * Submit game for approval
   */
  async submitGame(gameData) {
    try {
      // Validate all fields
      const titleError = validateInput(gameData.title, {
        required: true,
        maxLength: 100,
        minLength: 3
      });
      if (titleError) throw new Error(`Title: ${titleError}`);

      const urlError = validateGameURL(gameData.url);
      if (urlError) throw new Error(`URL: ${urlError}`);

      const iconError = validateImageURL(gameData.icon);
      if (iconError) throw new Error(`Icon: ${iconError}`);

      const bgError = validateImageURL(gameData.img);
      if (bgError) throw new Error(`Background: ${bgError}`);

      const descError = validateInput(gameData.desc, {
        required: false,
        maxLength: 500
      });
      if (descError) throw new Error(`Description: ${descError}`);

      // Check rate limit
      if (!rateLimiters.gameSubmit.isAllowed(this.userId)) {
        throw new Error('Too many submissions. Please wait before submitting again.');
      }

      const game = {
        title: escapeHtml(gameData.title.trim()),
        url: gameData.url.trim(),
        icon: gameData.icon.trim(),
        img: gameData.img.trim(),
        desc: escapeHtml((gameData.desc || '').trim()),
        category: escapeHtml(gameData.category || 'Games'),
        tags: gameData.tags || [],
        addedBy: this.userId,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        rating: 0,
        ratingCount: 0
      };

      const docId = await firebaseManager.addDocument('gameSubmissions', game);

      logger.info('Game submitted', { docId, title: game.title });
      this.emit('onGameAdded', game);

      return docId;
    } catch (error) {
      logger.error('Game submission failed', error);
      throw error;
    }
  }

  /**
   * Load game ratings
   */
  async loadGameRating(gameId) {
    try {
      const reviews = await firebaseManager.getCollection('gameReviews', {
        where: q => q.where('gameId', '==', gameId)
      });

      if (reviews.length === 0) {
        return {
          average: 0,
          count: 0,
          distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };
      }

      const ratings = reviews.map(r => r.rating);
      const distribution = {
        5: ratings.filter(r => r === 5).length,
        4: ratings.filter(r => r === 4).length,
        3: ratings.filter(r => r === 3).length,
        2: ratings.filter(r => r === 2).length,
        1: ratings.filter(r => r === 1).length
      };

      const average = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);

      const rating = {
        average: parseFloat(average),
        count: reviews.length,
        distribution
      };

      this.ratings.set(gameId, rating);
      return rating;
    } catch (error) {
      logger.error('Failed to load rating', error);
      return null;
    }
  }

  /**
   * Submit review
   */
  async submitReview(gameId, rating, reviewText) {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      if (reviewText.length > 500) {
        throw new Error('Review too long (max 500 characters)');
      }

      const review = {
        gameId,
        userId: this.userId,
        rating,
        text: escapeHtml(reviewText.trim()),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        helpful: 0
      };

      const docId = await firebaseManager.addDocument('gameReviews', review);

      logger.info('Review submitted', { gameId, rating });

      // Reload rating
      await this.loadGameRating(gameId);

      return docId;
    } catch (error) {
      logger.error('Review submission failed', error);
      throw error;
    }
  }

  /**
   * Record play session
   */
  async recordPlaySession(gameId, durationSeconds) {
    try {
      const session = {
        userId: this.userId,
        gameId,
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
        duration: durationSeconds,
        completedAt: null
      };

      await firebaseManager.addDocument('playSessions', session);

      // Increment game play count
      const game = this.games.find(g => g.id === gameId);
      if (game) {
        await firebaseManager.updateDocument('games', gameId, {
          playCount: firebase.firestore.FieldValue.increment(1)
        });
        game.playCount = (game.playCount || 0) + 1;
      }

      logger.info('Play session recorded', { gameId, duration: durationSeconds });
    } catch (error) {
      logger.error('Failed to record play session', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get recommended games
   */
  async getRecommendations(limit = 5) {
    try {
      // Simple recommendation: games similar to favorites
      const favorites = this.getFavorites();
      if (favorites.length === 0) {
        // Return popular games
        return this.games
          .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
          .slice(0, limit);
      }

      // Get games with same categories/tags
      const favoriteCategories = new Set(
        favorites.map(g => g.category).filter(Boolean)
      );

      const recommended = this.games
        .filter(g => !g.isFavorite)
        .filter(g => favoriteCategories.has(g.category))
        .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        .slice(0, limit);

      return recommended;
    } catch (error) {
      logger.error('Failed to get recommendations', error);
      return [];
    }
  }

  /**
   * Get user play history
   */
  async getPlayHistory(limit = 10) {
    try {
      const sessions = await firebaseManager.getCollection('playSessions', {
        orderBy: ['startedAt', 'desc'],
        limit
      });

      // Filter for current user
      const userSessions = sessions.filter(s => s.userId === this.userId);

      // Enrich with game data
      return Promise.all(
        userSessions.map(async session => ({
          ...session,
          game: await firebaseManager.getDocument('games', session.gameId)
        }))
      );
    } catch (error) {
      logger.error('Failed to load play history', error);
      return [];
    }
  }
}
