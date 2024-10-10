// index.js or app.js
const TelegramBot = require('node-telegram-bot-api');
const { startScheduler, checkReminders } = require('./scheduler');
const botHandlers = require('./bot');
//require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Initialize bot handlers
botHandlers(bot);

// Start the scheduler with the bot instance
startScheduler(bot);

// Manually trigger a check every 10 seconds
setInterval(() => checkReminders(bot), 10000);

console.log('Bot and scheduler started');