require("dotenv").config();
const db = require("./prisma/db");

module.exports = function (bot) {
  const ADMIN_ID = parseInt(process.env.ADMIN_CHAT_ID);
  const replyStates = {};
  let broadcastState = null;

  // Register event handlers if using polling
  function registerPollingHandlers() {
    // Photo handler
    bot.on("photo", async (msg) => {
      await handlePhoto(msg);
    });

    // Message handler
    bot.on("message", async (msg) => {
      await handleMessage(msg);
    });

    // Callback query handler
    bot.on("callback_query", async (callbackQuery) => {
      await handleCallbackQuery(callbackQuery);
    });

    // Command handlers
    bot.onText(/\/status/, async (msg) => {
      await handleStatusCommand(msg);
    });

    bot.onText(/\/history(?: (\d+))?/, async (msg, match) => {
      await handleHistoryCommand(msg, match);
    });

    bot.onText(/\/broadcasts(?: (\d+))?/, async (msg, match) => {
      await handleBroadcastsCommand(msg, match);
    });

    bot.onText(/\/broadcast$/, async (msg) => {
      await handleBroadcastCommand(msg);
    });

    bot.onText(/\/start/, async (msg) => {
      await handleStartCommand(msg);
    });

    bot.onText(/\/help/, async (msg) => {
      await handleHelpCommand(msg);
    });

    console.log("✅ Polling handlers registered");
  }

  // Export both
  module.exports = function (telegramBot) {
    bot = telegramBot;

    return {
      handleUpdate,
      handlePhoto,
      handleMessage,
      handleCallbackQuery,
      handleReplyMessage,
      handleAdminMessage,
      handleStatusCommand,
      handleHistoryCommand,
      handleBroadcastsCommand,
      handleBroadcastCommand,
      handleStartCommand,
      handleHelpCommand,
      sendBroadcast,
      registerPollingHandlers, // Add this
    };
  };

  // ==================== HELPER FUNCTIONS ====================
  function escapeMarkdown(text) {
    if (!text) return "";
    return String(text)
      .replace(/\_/g, "\\_")
      .replace(/\*/g, "\\*")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\~/g, "\\~")
      .replace(/\`/g, "\\`")
      .replace(/\>/g, "\\>")
      .replace(/\#/g, "\\#")
      .replace(/\+/g, "\\+")
      .replace(/\-/g, "\\-")
      .replace(/\=/g, "\\=")
      .replace(/\|/g, "\\|")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\./g, "\\.")
      .replace(/\!/g, "\\!");
  }

  // ==================== USER MANAGEMENT ====================
  async function ensureUserExists(msg) {
    const userData = {
      telegram_id: msg.from.id,
      username: msg.from.username || null,
      first_name: msg.from.first_name || null,
      last_name: msg.from.last_name || null,
      language_code: msg.from.language_code || null,
    };

    const user = await db.createUser(userData);
    return user;
  }

  // ==================== MESSAGE HANDLING ====================
  async function handlePhoto(msg) {
    const chatId = msg.chat.id;
    if (chatId === ADMIN_ID) return;

    const user = await ensureUserExists(msg);
    const customerName = escapeMarkdown(msg.from.first_name || "Customer");
    const caption = escapeMarkdown(msg.caption || "");
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // Save to database
    const savedMessage = await db.saveMessage({
      user_id: user.id,
      chat_id: chatId,
      message_text: caption,
      message_type: "customer",
      media_type: "photo",
      file_id: fileId,
      telegram_message_id: msg.message_id,
    });

    // Forward to admin
    bot.sendPhoto(ADMIN_ID, fileId, {
      caption:
        `<b>📷 New Image from ${customerName}</b>\n\n` +
        `User: @${user.username || "no_username"}\n` +
        `Telegram ID: ${user.telegramId || user.telegram_id}\n` +
        `Caption: ${caption || "(none)"}\n\n` +
        `👇 Tap to reply`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💬 Text Reply",
              callback_data: `text_${chatId}_${savedMessage.id}`,
            },
            {
              text: "🖼️ Image Reply",
              callback_data: `image_${chatId}_${savedMessage.id}`,
            },
          ],
        ],
      },
    });

    await db.markMessageAsForwarded(savedMessage.id);
    bot.sendMessage(chatId, "✅ Image received! We'll review it soon.");
  }

  async function handleMessage(msg) {
    const chatId = msg.chat.id;

    if (chatId === ADMIN_ID) return;
    if (msg.photo) return;
    if (msg.text && msg.text.startsWith("/")) {
      await ensureUserExists(msg);
      return;
    }

    const user = await ensureUserExists(msg);
    const customerName = escapeMarkdown(msg.from.first_name || "Customer");
    const messageText = escapeMarkdown(msg.text);

    // Save to database
    const savedMessage = await db.saveMessage({
      user_id: user.id,
      chat_id: chatId,
      message_text: messageText,
      message_type: "customer",
      media_type: "text",
      file_id: null,
      telegram_message_id: msg.message_id,
    });

    // Forward to admin
    bot.sendMessage(
      ADMIN_ID,
      `<b>📨 New Message from ${customerName}</b>\n\n` +
        `User: @${user.username || "no_username"}\n` +
        `Telegram ID: ${user.telegramId || user.telegram_id}\n` +
        `Message: ${messageText}\n\n` +
        `👇 Tap to reply`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💬 Text Reply",
                callback_data: `text_${chatId}_${savedMessage.id}`,
              },
              {
                text: "🖼️ Image Reply",
                callback_data: `image_${chatId}_${savedMessage.id}`,
              },
            ],
          ],
        },
      },
    );

    await db.markMessageAsForwarded(savedMessage.id);
    bot.sendMessage(chatId, "✅ Message received! We'll respond soon.");
  }

  // ==================== COMMAND HANDLERS ====================
  async function handleStatusCommand(msg) {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, "❌ Admin only command.");
      return;
    }

    try {
      const stats = await db.getStats();
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const recentMessages = await db.getRecentMessages(5);

      const botStatus = "✅ Online";
      const dbStatus = "✅ Connected";

      let recentActivity = "";
      if (recentMessages.length > 0) {
        recentMessages.forEach((msg, index) => {
          const name = msg.user?.firstName || `User ${msg.userId}`;
          const time = new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const type =
            msg.messageType === "customer"
              ? "👤"
              : msg.messageType === "admin"
                ? "👑"
                : "📢";
          recentActivity += `${type} <b>${time}</b> - ${name}\n`;
        });
      } else {
        recentActivity = "No recent messages";
      }

      bot.sendMessage(
        ADMIN_ID,
        `<b>🤖 Bot Status Dashboard</b>\n\n` +
          `<b>🟢 System Status</b>\n` +
          `├ Bot: ${botStatus}\n` +
          `├ Database: ${dbStatus}\n` +
          `├ Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
          `└ Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB\n\n` +
          `<b>📊 Quick Stats</b>\n` +
          `├ Users: ${stats.total_users}\n` +
          `├ Messages: ${stats.total_messages}\n` +
          `└ Today: ${stats.messages_24h} messages\n\n` +
          `<b>⏰ Recent Activity</b>\n` +
          `${recentActivity}\n` +
          `<i>Use /stats for detailed statistics</i>`,
        { parse_mode: "HTML" },
      );
    } catch (error) {
      console.error("Status error:", error);
      bot.sendMessage(ADMIN_ID, "❌ Error getting bot status.");
    }
  }

  async function handleHistoryCommand(msg, match) {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, "❌ Admin only command.");
      return;
    }

    const limit = match[1] ? parseInt(match[1]) : 10;
    const safeLimit = Math.min(limit, 50);

    try {
      const messages = await db.getRecentMessages(safeLimit);

      if (messages.length === 0) {
        bot.sendMessage(ADMIN_ID, "📭 No messages yet.");
        return;
      }

      let response = `<b>📜 Last ${messages.length} Messages</b>\n\n`;

      messages.forEach((message) => {
        const date = new Date(message.created_at || message.createdAt);
        const time = date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const name =
          message.first_name || `User ${message.user_id || message.userId}`;
        const type =
          message.message_type === "customer"
            ? "👤"
            : message.message_type === "admin"
              ? "👑"
              : "📢";

        let content =
          message.message_text ||
          `[${message.media_type || message.mediaType}]`;
        if (content && content.length > 40) {
          content = content.substring(0, 40) + "...";
        }

        response += `${type} <b>${time}</b> - ${name}\n${escapeMarkdown(content)}\n\n`;
      });

      bot.sendMessage(ADMIN_ID, response, { parse_mode: "HTML" });
    } catch (error) {
      console.error("History error:", error);
      bot.sendMessage(ADMIN_ID, "❌ Error retrieving history.");
    }
  }

  async function handleBroadcastsCommand(msg, match) {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, "❌ Admin only command.");
      return;
    }

    const limit = match[1] ? parseInt(match[1]) : 10;
    const safeLimit = Math.min(limit, 20);

    try {
      const broadcasts = await db.getBroadcastHistory(safeLimit);

      if (broadcasts.length === 0) {
        bot.sendMessage(ADMIN_ID, "📭 No broadcast history found.");
        return;
      }

      let response = `<b>📢 Broadcast History (Last ${broadcasts.length})</b>\n\n`;

      broadcasts.forEach((broadcast, index) => {
        const date = new Date(broadcast.createdAt);
        const time = date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const day = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        let messagePreview =
          broadcast.messageText || `[${broadcast.mediaType}]`;
        if (messagePreview && messagePreview.length > 30) {
          messagePreview = messagePreview.substring(0, 30) + "...";
        }

        const successRate =
          broadcast.totalUsers > 0
            ? Math.round((broadcast.sentCount / broadcast.totalUsers) * 100)
            : 0;

        response +=
          `<b>${index + 1}. ${day} ${time}</b>\n` +
          `├ Message: ${escapeMarkdown(messagePreview)}\n` +
          `├ Target: ${broadcast.totalUsers} users\n` +
          `├ Sent: ${broadcast.sentCount} ✓\n` +
          `├ Failed: ${broadcast.failedCount} ✗\n` +
          `└ Success: ${successRate}%\n\n`;
      });

      const totalSent = broadcasts.reduce((sum, b) => sum + b.sentCount, 0);
      const totalFailed = broadcasts.reduce((sum, b) => sum + b.failedCount, 0);
      const totalTarget = broadcasts.reduce((sum, b) => sum + b.totalUsers, 0);
      const overallRate =
        totalTarget > 0 ? Math.round((totalSent / totalTarget) * 100) : 0;

      response +=
        `<b>📈 Summary</b>\n` +
        `├ Total broadcasts: ${broadcasts.length}\n` +
        `├ Total users targeted: ${totalTarget}\n` +
        `├ Total messages sent: ${totalSent}\n` +
        `├ Total failed: ${totalFailed}\n` +
        `└ Overall success rate: ${overallRate}%\n\n` +
        `<i>💡 Use /broadcast to send a new broadcast</i>`;

      bot.sendMessage(ADMIN_ID, response, { parse_mode: "HTML" });
    } catch (error) {
      console.error("Broadcasts error:", error);
      bot.sendMessage(ADMIN_ID, "❌ Error retrieving broadcast history.");
    }
  }

  async function handleBroadcastCommand(msg) {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, "❌ Admin only command.");
      return;
    }

    try {
      const users = await db.getAllActiveUsers();
      const totalUsers = users.length;

      if (totalUsers === 0) {
        bot.sendMessage(ADMIN_ID, "❌ No active users in database.");
        return;
      }

      broadcastState = { step: "waiting_for_message" };

      bot.sendMessage(
        ADMIN_ID,
        `<b>📢 New Broadcast</b>\n\n` +
          `Active users: ${totalUsers}\n\n` +
          `Send your message (text or photo):\n` +
          `<i>Type /cancel to cancel</i>\n\n` +
          `<i>💡 Use /broadcasts to see broadcast history</i>`,
        { parse_mode: "HTML" },
      );
    } catch (error) {
      console.error("Broadcast error:", error);
      bot.sendMessage(ADMIN_ID, "❌ Error starting broadcast.");
    }
  }

  async function handleStartCommand(msg) {
    const chatId = msg.chat.id;
    const user = await ensureUserExists(msg);

    if (chatId === ADMIN_ID) {
      const stats = await db.getStats();

      bot.sendMessage(
        chatId,
        `<b>👑 Admin Panel</b>\n\n` +
          `<b>🟢 Status</b>\n` +
          `├ Database: Connected ✓\n` +
          `├ Users: ${stats.total_users}\n` +
          `└ Messages: ${stats.total_messages}\n\n` +
          `<b>📋 Admin Commands:</b>\n` +
          `/status - Bot status dashboard\n` +
          `/stats - Detailed statistics\n` +
          `/broadcast - Send to all users\n` +
          `/broadcasts - View broadcast history\n` +
          `/history [n] - Recent messages (default: 10)\n\n` +
          `<i>💡 Tip: Use /history 20 to see last 20 messages</i>\n` +
          `<i>Powered by Express Server</i>`,
        { parse_mode: "HTML" },
      );
    } else {
      bot.sendMessage(
        chatId,
        `👋 Hello ${user.firstName || user.first_name}!\n\n` +
          `Thank you for contacting our support team. We have received your message and will get back to you as soon as possible.\n\n` +
          `In the meantime, feel free to send us any additional information or questions you may have.\n\n` +
          `Best regards,\nSupport Team`,
      );
    }
  }

  async function handleHelpCommand(msg) {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, "❌ Admin only command.");
      return;
    }

    bot.sendMessage(
      ADMIN_ID,
      `<b>🆘 Admin Help Guide</b>\n\n` +
        `<b>📊 Monitoring Commands:</b>\n` +
        `/status - Quick bot status dashboard\n` +
        `/stats - Detailed statistics\n` +
        `/history [n] - View recent messages\n` +
        `/broadcasts - View broadcast history\n\n` +
        `<b>📢 Action Commands:</b>\n` +
        `/broadcast - Send message to all users\n\n` +
        `<b>🔄 How to Reply:</b>\n` +
        `1. Click "Text Reply" or "Image Reply" button\n` +
        `2. Type your message or send photo\n` +
        `3. Bot will forward it to the customer\n\n` +
        `<b>❓ Tips:</b>\n` +
        `• Use /history 20 to see last 20 messages\n` +
        `• Cancel any operation with /cancel\n` +
        `• Broadcast supports both text and images\n\n` +
        `<i>Need more help? Check the documentation.</i>`,
      { parse_mode: "HTML" },
    );
  }

  // ==================== BROADCAST HANDLING ====================
  async function handleAdminMessage(msg) {
    if (msg.text && msg.text.startsWith("/")) {
      return;
    }

    if (broadcastState && broadcastState.step === "waiting_for_message") {
      if (msg.text === "/cancel") {
        broadcastState = null;
        bot.sendMessage(ADMIN_ID, "❌ Broadcast cancelled.");
        return;
      }

      if (msg.text) {
        const users = await db.getAllActiveUsers();
        broadcastState = {
          step: "confirm_broadcast",
          type: "text",
          content: msg.text,
        };

        bot.sendMessage(
          ADMIN_ID,
          `<b>📢 Confirm Broadcast</b>\n\n` +
            `Message: "${escapeMarkdown(msg.text.substring(0, 80))}${
              msg.text.length > 80 ? "..." : ""
            }"\n\n` +
            `Recipients: ${users.length} users\n\n` +
            `Type /confirm to send\n` +
            `Type /cancel to cancel`,
          { parse_mode: "HTML" },
        );
      } else if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const caption = escapeMarkdown(msg.caption || "");
        const users = await db.getAllActiveUsers();

        broadcastState = {
          step: "confirm_broadcast",
          type: "photo",
          fileId: photo.file_id,
          caption: caption,
        };

        bot.sendMessage(
          ADMIN_ID,
          `<b>📢 Confirm Broadcast</b>\n\n` +
            `Type: Photo${caption ? " with caption" : ""}\n` +
            `Recipients: ${users.length} users\n\n` +
            `Type /confirm to send\n` +
            `Type /cancel to cancel`,
          { parse_mode: "HTML" },
        );
      }
    } else if (broadcastState && broadcastState.step === "confirm_broadcast") {
      if (msg.text === "/confirm") {
        await sendBroadcast(ADMIN_ID, broadcastState);
        broadcastState = null;
      } else if (msg.text === "/cancel") {
        broadcastState = null;
        bot.sendMessage(ADMIN_ID, "❌ Broadcast cancelled.");
      }
    }
  }

  async function sendBroadcast(adminId, broadcastData) {
    try {
      const users = await db.getAllActiveUsers();
      const totalUsers = users.length;

      if (totalUsers === 0) {
        bot.sendMessage(adminId, "❌ No users in database.");
        return;
      }

      const broadcastRecord = await db.createBroadcast({
        admin_id: 1,
        message_text:
          broadcastData.type === "text"
            ? broadcastData.content
            : broadcastData.caption,
        media_type: broadcastData.type,
        file_id: broadcastData.type === "photo" ? broadcastData.fileId : null,
        total_users: totalUsers,
      });

      bot.sendMessage(
        adminId,
        `📤 Broadcasting to ${totalUsers} users...\n\n⏳ This may take a moment.`,
      );

      let sentCount = 0;
      let failedCount = 0;
      const failedUsers = [];

      for (let i = 0; i < users.length; i++) {
        const user = users[i];

        try {
          if (broadcastData.type === "text") {
            await bot.sendMessage(
              user.telegramId,
              `<b>📢 Announcement</b>\n\n${broadcastData.content}\n\n` +
                `<i>From Support Team</i>`,
              { parse_mode: "HTML" },
            );
          } else if (broadcastData.type === "photo") {
            await bot.sendPhoto(user.telegramId, broadcastData.fileId, {
              caption: broadcastData.caption
                ? `<b>📢 Announcement</b>\n\n${broadcastData.caption}\n\n<i>From Support Team</i>`
                : "📢 Announcement from Support Team",
              parse_mode: "HTML",
            });
          }

          sentCount++;

          await db.saveMessage({
            user_id: user.id,
            chat_id: user.telegramId,
            message_text:
              broadcastData.type === "text"
                ? broadcastData.content
                : broadcastData.caption,
            message_type: "broadcast",
            media_type: broadcastData.type,
            file_id:
              broadcastData.type === "photo" ? broadcastData.fileId : null,
            telegram_message_id: null,
          });

          if (sentCount % 15 === 0) {
            const progress = Math.round(((i + 1) / users.length) * 100);
            bot.sendMessage(
              adminId,
              `📤 Progress: ${progress}% (${i + 1}/${users.length})`,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Failed to send to ${user.telegramId}:`, error.message);
          failedCount++;
          failedUsers.push(user.telegramId);

          if (
            error.message.includes("blocked") ||
            error.message.includes("403") ||
            error.message.includes("bot was blocked")
          ) {
            await db.updateUserActive(user.telegramId, false);
          }
        }
      }

      await db.updateBroadcastStats(broadcastRecord.id, sentCount, failedCount);

      let report =
        `<b>✅ Broadcast Complete</b>\n\n` +
        `<b>📊 Summary</b>\n` +
        `├ Total users: ${totalUsers}\n` +
        `├ Successfully sent: ${sentCount}\n` +
        `└ Failed: ${failedCount}\n\n`;

      if (failedCount > 0) {
        report += `<b>📝 Failed Users (first 5):</b>\n`;
        const sample = failedUsers.slice(0, 5);
        sample.forEach((id) => (report += `├ ${id}\n`));
        if (failedUsers.length > 5)
          report += `└ ...and ${failedUsers.length - 5} more\n`;
      }

      report += `\n<i>Saved to database</i>`;

      bot.sendMessage(adminId, report, { parse_mode: "HTML" });
    } catch (error) {
      console.error("Broadcast error:", error);
      bot.sendMessage(adminId, `❌ Broadcast failed: ${error.message}`);
    }
  }

  // ==================== REPLY HANDLING ====================
  async function handleCallbackQuery(callbackQuery) {
    const adminId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (adminId !== ADMIN_ID) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Not authorized" });
      return;
    }

    const [type, customerChatId, messageId] = data.split("_");

    replyStates[adminId] = {
      mode: type === "text" ? "text_reply" : "image_reply",
      targetChatId: customerChatId,
      originalMessageId: parseInt(messageId),
    };

    const action = type === "text" ? "text message" : "image";
    bot.sendMessage(
      ADMIN_ID,
      `<b>✍️ Reply to Customer</b>\n\n` +
        `Chat ID: ${customerChatId}\n` +
        `Send your ${action} now.\n` +
        `Type /cancel to cancel.`,
      { parse_mode: "HTML" },
    );

    bot.answerCallbackQuery(callbackQuery.id, {
      text: `Ready for ${action}...`,
    });
  }

  async function handleReplyMessage(msg) {
    const state = replyStates[ADMIN_ID];
    if (!state) return;

    const { targetChatId, originalMessageId, mode } = state;

    if (msg.text === "/cancel") {
      delete replyStates[ADMIN_ID];
      bot.sendMessage(ADMIN_ID, "❌ Reply cancelled.");
      return;
    }

    try {
      const user = await db.getUserByTelegramId(targetChatId);

      if (!user) {
        bot.sendMessage(ADMIN_ID, "❌ User not found in database.");
        delete replyStates[ADMIN_ID];
        return;
      }

      if (mode === "text_reply" && msg.text) {
        const safeMessage = escapeMarkdown(msg.text);

        await bot.sendMessage(
          targetChatId,
          `<b>💬 From Support:</b>\n\n${safeMessage}`,
          {
            parse_mode: "HTML",
          },
        );

        await db.saveMessage({
          user_id: user.id,
          chat_id: targetChatId,
          message_text: msg.text,
          message_type: "admin",
          media_type: "text",
          file_id: null,
          telegram_message_id: msg.message_id,
        });

        if (originalMessageId) {
          await db.markMessageAsReplied(originalMessageId);
        }

        bot.sendMessage(
          ADMIN_ID,
          `✅ Reply sent!\n\nUser: ${user.firstName || user.first_name}\nID: ${user.id}`,
        );
      } else if (mode === "image_reply" && msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const caption = escapeMarkdown(msg.caption || "");

        await bot.sendPhoto(targetChatId, photo.file_id, {
          caption: caption
            ? `<b>💬 From Support:</b>\n\n${caption}`
            : "💬 From Support Team",
          parse_mode: "HTML",
        });

        await db.saveMessage({
          user_id: user.id,
          chat_id: targetChatId,
          message_text: caption,
          message_type: "admin",
          media_type: "photo",
          file_id: photo.file_id,
          telegram_message_id: msg.message_id,
        });

        if (originalMessageId) {
          await db.markMessageAsReplied(originalMessageId);
        }

        bot.sendMessage(
          ADMIN_ID,
          `✅ Image reply sent!\n\nUser: ${user.firstName || user.first_name}\nID: ${user.id}`,
        );
      }

      delete replyStates[ADMIN_ID];
    } catch (error) {
      console.error("Reply error:", error);
      bot.sendMessage(ADMIN_ID, `❌ Failed: ${error.message}`);
      delete replyStates[ADMIN_ID];
    }
  }

  // ==================== MAIN UPDATE HANDLER ====================
  async function handleUpdate(update) {
    try {
      // Handle message updates
      if (update.message) {
        const msg = update.message;

        // Handle photos
        if (msg.photo) {
          await handlePhoto(msg);
          return;
        }

        // Handle messages
        if (msg.text) {
          // Admin commands
          if (msg.chat.id === ADMIN_ID) {
            // Admin broadcast handling
            await handleAdminMessage(msg);

            // Admin commands
            if (msg.text.startsWith("/status")) {
              await handleStatusCommand(msg);
            } else if (msg.text.startsWith("/history")) {
              const match = msg.text.match(/\/history(?: (\d+))?/);
              await handleHistoryCommand(msg, match);
            } else if (msg.text.startsWith("/broadcasts")) {
              const match = msg.text.match(/\/broadcasts(?: (\d+))?/);
              await handleBroadcastsCommand(msg, match);
            } else if (msg.text.startsWith("/broadcast$")) {
              await handleBroadcastCommand(msg);
            } else if (msg.text.startsWith("/start")) {
              await handleStartCommand(msg);
            } else if (msg.text.startsWith("/help")) {
              await handleHelpCommand(msg);
            } else {
              // Check if it's a reply to customer
              await handleReplyMessage(msg);
            }
          } else {
            // Regular user messages
            if (msg.text.startsWith("/start")) {
              await handleStartCommand(msg);
            } else {
              await handleMessage(msg);
            }
          }
        }
      }

      // Handle callback queries (button clicks)
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      console.error("Error handling update:", error);
    }
  }

  return {
    handleUpdate,
    handlePhoto,
    handleMessage,
    handleCallbackQuery,
    handleReplyMessage,
    handleAdminMessage,
    handleStatusCommand,
    handleHistoryCommand,
    handleBroadcastsCommand,
    handleBroadcastCommand,
    handleStartCommand,
    handleHelpCommand,
    sendBroadcast,
  };
};;
