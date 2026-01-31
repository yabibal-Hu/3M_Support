// server/prisma/db.js
const mysql = require("mysql2");
require("dotenv").config();

class Database {
  constructor() {
    this.pool = null;
    this.init();
  }

  init() {
    try {
      console.log("🔗 Initializing MySQL database connection...");
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);

      // Get database configuration based on environment
      const dbConfig = this.getDbConfig();

      this.pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        charset: "utf8mb4",
        connectionLimit: dbConfig.connectionLimit,
        queueLimit: 0,
        waitForConnections: true,
        multipleStatements: false,
        timezone: "Z",
        dateStrings: true,
        debug: false,
      });

      console.log(`✅ MySQL connection pool created`);
      console.log(
        `📊 Connected to: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
      );

      // Test connection immediately
      this.testConnection();
    } catch (error) {
      console.error("❌ Database initialization error:", error.message);
    }
  }

getDbConfig() {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Production (cPanel) - IMPORTANT: Use IP address for remote connection
    console.log("⚡ Using PRODUCTION configuration");
    return {
      host: "192.250.239.84", // Use IP address, not localhost
      port: 3306,
      user: "msccrykr_support_user",
      password: "SXhJ#+D)Oi%fQ$5c",
      database: "msccrykr_support",
      connectionLimit: 2,
    };
  } else {
    // Development (VS Code) - also use IP address
    console.log("💻 Using DEVELOPMENT configuration");
    return {
      host: "192.250.239.84", // Same IP for both
      port: 3306,
      user: "msccrykr_support_user",
      password: "SXhJ#+D)Oi%fQ$5c",
      database: "msccrykr_support",
      connectionLimit: 5,
    };
  }
}

  async testConnection() {
    try {
      const connection = await this.getConnection();

      // Use promise-based query
      const promisePool = this.pool.promise();
      const [rows] = await promisePool.query(
        "SELECT 1 as connected, DATABASE() as db, USER() as user",
      );

      console.log("✅ Database connection test successful");
      console.log(`📊 Database: ${rows[0].db}`);
      console.log(`👤 Connected as: ${rows[0].user}`);
      return true;
    } catch (error) {
      console.error("❌ Database connection test failed:", error.message);
      return false;
    }
  }

  // Helper method to get a connection from pool (promise-based)
  async getConnection() {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, connection) => {
        if (err) {
          reject(err);
        } else {
          resolve(connection);
        }
      });
    });
  }

  // Helper method to execute queries (promise-based)
  async execute(sql, params = []) {
    const promisePool = this.pool.promise();
    try {
      const [rows] = await promisePool.execute(sql, params);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Helper method for regular queries (not prepared statements)
  async query(sql, params = []) {
    const promisePool = this.pool.promise();
    try {
      const [rows] = await promisePool.query(sql, params);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // User methods
  async getUserByTelegramId(telegramId) {
    try {
      const rows = await this.execute(
        "SELECT * FROM users WHERE telegram_id = ?",
        [telegramId],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting user:", error);
      return null;
    }
  }

  async createUser(userData) {
    const { telegram_id, username, first_name, last_name, language_code } =
      userData;

    try {
      // Handle undefined values by converting them to null
      const safeUsername = username || null;
      const safeFirstName = first_name || null;
      const safeLastName = last_name || null;
      const safeLanguageCode = language_code || null;

      await this.execute(
        `INSERT INTO users (telegram_id, username, first_name, last_name, language_code) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         username = VALUES(username),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         updated_at = CURRENT_TIMESTAMP`,
        [
          telegram_id,
          safeUsername,
          safeFirstName,
          safeLastName,
          safeLanguageCode,
        ],
      );

      return await this.getUserByTelegramId(telegram_id);
    } catch (error) {
      console.error("Error creating user:", error);
      // Return a basic user object to prevent crashes
      return {
        id: 0,
        telegram_id: telegram_id,
        username: username || null,
        first_name: first_name || null,
        last_name: last_name || null,
        language_code: language_code || null,
      };
    }
  }

  async updateUserActive(telegramId, isActive) {
    try {
      await this.execute(
        "UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?",
        [isActive, telegramId],
      );
    } catch (error) {
      console.error("Error updating user:", error);
    }
  }

  async getAllActiveUsers() {
    try {
      return await this.query(
        "SELECT * FROM users WHERE is_active = true AND is_blocked = false",
      );
    } catch (error) {
      console.error("Error getting active users:", error);
      return [];
    }
  }

  async getUserCount() {
    try {
      const rows = await this.query(
        "SELECT COUNT(*) as count FROM users WHERE is_active = true AND is_blocked = false",
      );
      return rows[0].count;
    } catch (error) {
      console.error("Error counting users:", error);
      return 0;
    }
  }

  // Message methods
  async saveMessage(messageData) {
    const {
      user_id,
      chat_id,
      message_text,
      message_type,
      media_type,
      file_id,
      telegram_message_id,
    } = messageData;

    try {
      const result = await this.execute(
        `INSERT INTO messages 
         (user_id, chat_id, message_text, message_type, media_type, file_id, telegram_message_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          chat_id,
          message_text,
          message_type,
          media_type,
          file_id,
          telegram_message_id,
        ],
      );

      return { id: result.insertId };
    } catch (error) {
      console.error("Error saving message:", error);
      throw error;
    }
  }

  async markMessageAsForwarded(messageId) {
    try {
      await this.execute(
        "UPDATE messages SET is_forwarded = true WHERE id = ?",
        [messageId],
      );
    } catch (error) {
      console.error("Error marking message as forwarded:", error);
    }
  }

  async markMessageAsReplied(messageId) {
    try {
      await this.execute("UPDATE messages SET is_replied = true WHERE id = ?", [
        messageId,
      ]);
    } catch (error) {
      console.error("Error marking message as replied:", error);
    }
  }

  async getRecentMessages(limit = 20) {
    try {
      // Make sure we're getting the correct field names
      return await this.query(
        `SELECT 
         m.id,
         m.user_id,
         m.chat_id,
         m.message_text,
         m.message_type,
         m.media_type,
         m.file_id,
         m.telegram_message_id,
         m.is_forwarded,
         m.is_replied,
         m.created_at,
         u.telegram_id,
         u.username,
         u.first_name,
         u.last_name
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       ORDER BY m.created_at DESC
       LIMIT ?`,
        [limit],
      );
    } catch (error) {
      console.error("Error getting recent messages:", error);
      return [];
    }
  }

  // Broadcast methods
  async createBroadcast(broadcastData) {
    const { admin_id, message_text, media_type, file_id, total_users } =
      broadcastData;

    try {
      const result = await this.execute(
        `INSERT INTO broadcasts (admin_id, message_text, media_type, file_id, total_users) 
         VALUES (?, ?, ?, ?, ?)`,
        [admin_id, message_text, media_type, file_id, total_users],
      );

      return { id: result.insertId };
    } catch (error) {
      console.error("Error creating broadcast:", error);
      throw error;
    }
  }

  async updateBroadcastStats(broadcastId, sentCount, failedCount) {
    try {
      await this.execute(
        "UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?",
        [sentCount, failedCount, broadcastId],
      );
    } catch (error) {
      console.error("Error updating broadcast stats:", error);
    }
  }

  async getBroadcastHistory(limit = 10) {
    try {
      return await this.query(
        `SELECT 
           id,
           message_text,
           media_type,
           total_users,
           sent_count,
           failed_count,
           created_at
         FROM broadcasts 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [limit],
      );
    } catch (error) {
      console.error("Error getting broadcast history:", error);
      return [];
    }
  }

  // Stats methods
  async getStats() {
    const stats = {};

    try {
      // User stats - use query() for complex SQL
      const userStats = await this.query(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_users_7d,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_users_30d
        FROM users
        WHERE is_blocked = false
      `);

      Object.assign(stats, userStats[0]);

      // Message stats
      const messageStats = await this.query(`
        SELECT 
          COUNT(*) as total_messages,
          SUM(CASE WHEN message_type = 'customer' THEN 1 ELSE 0 END) as customer_messages,
          SUM(CASE WHEN message_type = 'admin' THEN 1 ELSE 0 END) as admin_messages,
          SUM(CASE WHEN is_replied = true THEN 1 ELSE 0 END) as replied_messages,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as messages_24h
        FROM messages
      `);

      Object.assign(stats, messageStats[0]);

      // Broadcast stats
      const broadcastStats = await this.query(`
        SELECT 
          COUNT(*) as total_broadcasts,
          COALESCE(SUM(total_users), 0) as total_broadcast_users,
          COALESCE(SUM(sent_count), 0) as total_broadcast_sent
        FROM broadcasts
      `);

      Object.assign(stats, broadcastStats[0]);

      // Convert BigInt to regular numbers
      stats.total_users = Number(stats.total_users);
      stats.new_users_7d = Number(stats.new_users_7d);
      stats.new_users_30d = Number(stats.new_users_30d);
      stats.total_messages = Number(stats.total_messages);
      stats.customer_messages = Number(stats.customer_messages);
      stats.admin_messages = Number(stats.admin_messages);
      stats.replied_messages = Number(stats.replied_messages);
      stats.messages_24h = Number(stats.messages_24h);
      stats.total_broadcasts = Number(stats.total_broadcasts);
      stats.total_broadcast_users = Number(stats.total_broadcast_users);
      stats.total_broadcast_sent = Number(stats.total_broadcast_sent);

      return stats;
    } catch (error) {
      console.error("Error getting stats:", error);
      return {
        total_users: 0,
        new_users_7d: 0,
        new_users_30d: 0,
        total_messages: 0,
        customer_messages: 0,
        admin_messages: 0,
        replied_messages: 0,
        messages_24h: 0,
        total_broadcasts: 0,
        total_broadcast_users: 0,
        total_broadcast_sent: 0,
      };
    }
  }

  // Close connection
  async close() {
    if (this.pool) {
      return new Promise((resolve) => {
        this.pool.end((err) => {
          if (err) {
            console.error("Error closing pool:", err);
          } else {
            console.log("✅ Database connection pool closed");
          }
          resolve();
        });
      });
    }
  }
}

module.exports = new Database();
