require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

async function diagnose() {
  console.log("=== Telegram Bot Diagnostics ===");

  // 1. Check token
  const token = process.env.BOT_TOKEN;
  console.log("1. Token exists:", !!token);
  console.log(
    "   Token format:",
    token ? `${token.substring(0, 10)}...` : "None",
  );

  // 2. Try to get bot info
  try {
    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    console.log("2. Bot API connection: ✅ SUCCESS");
    console.log("   Bot username:", `@${me.username}`);
    console.log("   Bot name:", me.first_name);
  } catch (error) {
    console.log("2. Bot API connection: ❌ FAILED");
    console.log("   Error:", error.message);
    return;
  }

  // 3. Test webhook/polling
  const bot2 = new TelegramBot(token, { polling: true });

  bot2.onText(/\/ping/, (msg) => {
    console.log("3. Command received: ✅ SUCCESS");
    console.log("   From:", msg.from.username);
    bot2.sendMessage(msg.chat.id, "🏓 Pong!").then(() => {
      console.log("   Response sent: ✅ SUCCESS");
      process.exit(0);
    });
  });

  console.log("\n📱 Send /ping to your bot in Telegram...");
  console.log("Waiting 30 seconds for command...");

  setTimeout(() => {
    console.log("❌ No command received in 30 seconds");
    process.exit(1);
  }, 30000);
}

diagnose();