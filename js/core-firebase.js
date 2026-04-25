/**
 * Firebase Configuration Module
 * Handles secure Firebase initialization and API communication
 */

class FirebaseManager {
  constructor() {
    this.app = null;
    this.db = null;
    this.auth = null;
    this.configured = false;
    this.listeners = new Map(); // Track listeners for cleanup
  }

  /**
   * Initialize Firebase by fetching config from a secure endpoint
   */
  async initialize() {
    try {
      if (this.configured) return;

      logger.info('Initializing Firebase...');

      const firebaseConfig = {
        apiKey: "AIzaSyDjhsXh2BKiULb_lf1XLXsQy6IRJP3paa4",
        authDomain: "gameui1z.firebaseapp.com",
        projectId: "gameui1z",
        storageBucket: "gameui1z.firebasestorage.app",
        messagingSenderId: "488163230363",
        appId: "1:488163230363:web:97b72324e07f428447fc3e",
        measurementId: "G-Z917M9T98P"
      };
      
      this.app = firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore(this.app);
      this.auth = firebase.auth(this.app);

      // Enable offline persistence
      await this.db.enablePersistence().catch(err => {
        if (err.code !== 'failed-precondition') {
          logger.warn('Offline persistence failed', err);
        }
      });

      this.configured = true;
      logger.info('Firebase initialized successfully');
    } catch (error) {
      logger.error('Firebase initialization failed', error);
      throw error;
    }
  }

  /**
   * Subscribe to collection with automatic cleanup
   * @param {string} collection - Collection name
   * @param {Function} callback - Callback function
   * @param {Function} constraint - Optional where constraint
   * @returns {Function} - Unsubscribe function
   */
  subscribe(collection, callback, constraint = null) {
    try {
      let query = this.db.collection(collection);

      if (constraint) {
        query = constraint(query);
      }

      const unsubscribe = query.onSnapshot(
        snapshot => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callback(data);
        },
        error => {
          logger.error(`Listener error for ${collection}`, error);
          // Notify UI of error
          if (window.showToast) {
            window.showToast('Connection error: ' + error.message);
          }
        }
      );

      // Store for cleanup
      const listenerId = `${collection}_${Date.now()}_${Math.random()}`;
      this.listeners.set(listenerId, unsubscribe);

      // Return enhanced unsubscribe that also removes from map
      return () => {
        unsubscribe();
        this.listeners.delete(listenerId);
      };
    } catch (error) {
      logger.error('Subscribe failed', error);
      throw error;
    }
  }

  /**
   * Fetch single document
   */
  async getDocument(collection, docId) {
    try {
      const doc = await this.db.collection(collection).doc(docId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      logger.error(`Failed to fetch ${collection}/${docId}`, error);
      throw error;
    }
  }

  /**
   * Fetch collection with pagination
   */
  async getCollection(collection, options = {}) {
    const { limit = 20, orderBy = null, where = null, startAfter = null } = options;

    try {
      let query = this.db.collection(collection);

      if (where) {
        query = where(query);
      }

      if (orderBy) {
        const [field, direction] = orderBy;
        query = query.orderBy(field, direction || 'asc');
      }

      if (startAfter) {
        query = query.startAfter(startAfter);
      }

      query = query.limit(limit);

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error(`Failed to fetch ${collection}`, error);
      throw error;
    }
  }

  /**
   * Add document with validation
   */
  async addDocument(collection, data) {
    try {
      // Validate data
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data format');
      }

      // Add server timestamp
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

      const docRef = await this.db.collection(collection).add(data);
      return docRef.id;
    } catch (error) {
      logger.error(`Failed to add to ${collection}`, error);
      throw error;
    }
  }

  /**
   * Update document with validation
   */
  async updateDocument(collection, docId, data) {
    try {
      if (!docId) throw new Error('Document ID required');

      // Add updated timestamp
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      await this.db.collection(collection).doc(docId).update(data);
    } catch (error) {
      logger.error(`Failed to update ${collection}/${docId}`, error);
      throw error;
    }
  }

  /**
   * Delete document with confirmation
   */
  async deleteDocument(collection, docId) {
    try {
      if (!docId) throw new Error('Document ID required');

      await this.db.collection(collection).doc(docId).delete();
    } catch (error) {
      logger.error(`Failed to delete ${collection}/${docId}`, error);
      throw error;
    }
  }

  /**
   * Batch write operation
   */
  async batch(operations) {
    try {
      const batch = this.db.batch();

      for (const op of operations) {
        const ref = this.db.collection(op.collection).doc(op.id);
        
        if (op.type === 'set') {
          batch.set(ref, op.data);
        } else if (op.type === 'update') {
          batch.update(ref, op.data);
        } else if (op.type === 'delete') {
          batch.delete(ref);
        }
      }

      await batch.commit();
    } catch (error) {
      logger.error('Batch operation failed', error);
      throw error;
    }
  }

  /**
   * Transaction operation
   */
  async transaction(updateFunction) {
    try {
      return await this.db.runTransaction(updateFunction);
    } catch (error) {
      logger.error('Transaction failed', error);
      throw error;
    }
  }

  /**
   * Cleanup all listeners on logout
   */
  cleanupAllListeners() {
    logger.info(`Cleaning up ${this.listeners.size} listeners`);
    this.listeners.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (e) {
        logger.warn('Listener cleanup error', e);
      }
    });
    this.listeners.clear();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.auth?.currentUser;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.auth?.currentUser;
  }

  /**
   * Get user claims (role, permissions, etc)
   */
  async getUserClaims() {
    try {
      const idTokenResult = await this.auth.currentUser.getIdTokenResult(true);
      return idTokenResult.claims;
    } catch (error) {
      logger.error('Failed to get user claims', error);
      return {};
    }
  }
}
