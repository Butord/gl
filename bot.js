const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const db = require('./db');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const { validateTime } = require('./utils');
const { startScheduler } = require('./scheduler');

const popularTimezones = [
  'Europe/Kiev',
  'Europe/London',
  'America/New_York',
  'Asia/Tokyo',
  'Australia/Sydney',
  // Додай інші часові пояси за потреби
];

let usersData = {};

function getUserTimezone(chatId, callback) {
  db.getUserTimezone(chatId, (timezone) => {
    callback(timezone);
  });
}

// Запитуємо текст нагадування
bot.onText(/\/remind/, (msg) => {
  const chatId = msg.chat.id;

  getUserTimezone(chatId, (timezone) => {
    usersData[chatId] = { stage: 'text' }; // Ініціалізуємо стадію

    if (timezone) {
      usersData[chatId].timezone = timezone; // Зберігаємо знайдений часовий пояс
      bot.sendMessage(chatId, 'Введіть текст нагадування:');
    } else {
      bot.sendMessage(chatId, 'Введіть текст нагадування:');
    }
  });
});

// Обробляємо текст нагадування
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (usersData[chatId] && usersData[chatId].stage === 'text') {
    usersData[chatId].reminderText = msg.text;

    bot.sendMessage(chatId, 'Введіть час нагадування (формат HH:mm):');
    usersData[chatId].stage = 'time';
  } else if (usersData[chatId] && usersData[chatId].stage === 'time') {
    if (validateTime(msg.text)) {
      usersData[chatId].reminderTime = msg.text;

      // Запитуємо часовий пояс
      const options = {
        reply_markup: {
          keyboard: popularTimezones.map(tz => [tz]).concat([['Інший часовий пояс']]),
          one_time_keyboard: true,
          resize_keyboard: true
        }
      };
      bot.sendMessage(chatId, 'Виберіть ваш часовий пояс або напишіть свій:', options);
      usersData[chatId].stage = 'timezone';
    } else {
      bot.sendMessage(chatId, 'Неправильний формат часу! Спробуйте ще раз.');
    }
  } else if (usersData[chatId] && usersData[chatId].stage === 'timezone') {
    const timezone = msg.text;

    if (timezone === 'Інший часовий пояс') {
      bot.sendMessage(chatId, 'Введіть ваш часовий пояс (наприклад, Europe/Kiev):');
      usersData[chatId].stage = 'input_timezone';
    } else if (moment.tz.zone(timezone)) {
      usersData[chatId].timezone = timezone;
      db.saveUserTimezone(chatId, timezone); // Зберігаємо часовий пояс у базі даних

      bot.sendMessage(chatId, 'Введіть час для повідомлення перед нагадуванням (формат HH:mm):');
      usersData[chatId].stage = 'notify';
    } else {
      bot.sendMessage(chatId, 'Неправильний часовий пояс! Спробуйте ще раз.');
    }
  } else if (usersData[chatId] && usersData[chatId].stage === 'input_timezone') {
    const timezone = msg.text;
    if (moment.tz.zone(timezone)) {
      usersData[chatId].timezone = timezone;
      db.saveUserTimezone(chatId, timezone); // Зберігаємо часовий пояс
      bot.sendMessage(chatId, 'Введіть час для повідомлення перед нагадуванням (формат HH:mm):');
      usersData[chatId].stage = 'notify';
    } else {
      bot.sendMessage(chatId, 'Неправильний часовий пояс! Спробуйте ще раз.');
    }
  } else if (usersData[chatId] && usersData[chatId].stage === 'notify') {
    if (validateTime(msg.text)) {
      const { reminderText, reminderTime, timezone } = usersData[chatId];

      // Визначаємо поточний час в часовому поясі користувача
      const nowInUserTZ = moment().tz(timezone);
      const currentDate = nowInUserTZ.format('YYYY-MM-DD');

      // Формуємо час нагадування
      let reminderMoment = moment.tz(`${currentDate} ${reminderTime}`, 'YYYY-MM-DD HH:mm', timezone);
      if (reminderMoment.isBefore(nowInUserTZ)) {
        reminderMoment.add(1, 'day');
      }
      const reminderTimeWithZone = reminderMoment.format();

      // Формуємо час сповіщення
      let notifyMoment = moment.tz(`${reminderMoment.format('YYYY-MM-DD')} ${msg.text}`, 'YYYY-MM-DD HH:mm', timezone);
      if (notifyMoment.isBefore(nowInUserTZ)) {
        notifyMoment.add(1, 'day');
      }
      const notifyTimeWithZone = notifyMoment.format();

      // Перевірка, чи час сповіщення перед нагадуванням
      if (notifyMoment.isAfter(reminderMoment)) {
        bot.sendMessage(chatId, 'Час для сповіщення повинен бути перед часом нагадування. Спробуйте ще раз.');
        usersData[chatId].stage = 'notify';
        return;
      }

      db.addReminder(chatId, reminderText, reminderTimeWithZone, timezone, notifyTimeWithZone, (err) => {
        if (err) {
          bot.sendMessage(chatId, 'Сталася помилка при створенні нагадування. Спробуйте пізніше.');
          return;
        }

        bot.sendMessage(chatId, 'Нагадування створено!');
        usersData[chatId] = null;

        startScheduler();
      });
    } else {
      bot.sendMessage(chatId, 'Неправильний формат часу для нагадування! Спробуйте ще раз.');
    }
  }
});

// Простий тест у bot.js
bot.onText(/\/test/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Бот працює!');
});

startScheduler(); // Запускаємо scheduler один раз при запуску бота

module.exports = bot; // Експортуємо екземпляр бота
