const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = require('./bot');


function startScheduler() {
  cron.schedule('* * * * *', () => {
    const now = moment().utc(); // Поточний час у форматі UTC
    console.log('Поточний UTC час:', now.format()); // Логуємо поточний час

    db.getAllReminders((reminders) => {
      if (reminders.length === 0) {
        console.log('Нагадувань немає.');
      }

      reminders.forEach(reminder => {
        const reminderTime = moment(reminder.reminder_time).tz(reminder.timezone);
        const notifyTime = moment(reminder.notify_time).tz(reminder.timezone);

        console.log(`Час нагадування для користувача ${reminder.user_id}: ${reminderTime.format()}`);
        console.log(`Час для повідомлення користувача ${reminder.user_id}: ${notifyTime.format()}`);
        console.log(`Статус нагадування: Сповіщення - ${reminder.is_sent_notify}, Нагадування - ${reminder.is_sent_reminder}`);

        // Перевірка для сповіщення
        if (now.isSameOrAfter(notifyTime.utc()) && reminder.is_sent_notify === 0) {
          console.log(`Надсилаємо сповіщення користувачу ${reminder.user_id}: ${reminder.reminder_text}`);
          bot.sendMessage(reminder.user_id, `🔔 Сповіщення: ${reminder.reminder_text} заплановане на ${reminderTime.format('HH:mm')}`)
            .then(() => {
              // Позначаємо сповіщення як відправлене
              db.markAsSent(reminder.id, 'notify', (err) => {
                if (err) {
                  console.error(`Помилка при позначенні сповіщення як відправленого для нагадування ${reminder.id}`);
                } else {
                  console.log(`Сповіщення для нагадування ${reminder.id} успішно позначено як відправлене.`);
                }
              });
            })
            .catch(err => {
              console.error(`Помилка при надсиланні сповіщення користувачу ${reminder.user_id}:`, err);
            });
        }

        // Перевірка для нагадування
        if (now.isSameOrAfter(reminderTime.utc()) && reminder.is_sent_reminder === 0) {
          console.log(`Надсилаємо нагадування користувачу ${reminder.user_id}: ${reminder.reminder_text}`);
          bot.sendMessage(reminder.user_id, `🔔 Нагадування: ${reminder.reminder_text}`)
            .then(() => {
              // Позначаємо нагадування як відправлене
              db.markAsSent(reminder.id, 'reminder', (err) => {
                if (err) {
                  console.error(`Помилка при позначенні нагадування як відправленого для нагадування ${reminder.id}`);
                } else {
                  console.log(`Нагадування для нагадування ${reminder.id} успішно позначено як відправлене.`);
                }
              });
            })
            .catch(err => {
              console.error(`Помилка при надсиланні нагадування користувачу ${reminder.user_id}:`, err);
            });
        }
      });
    });
  });
}

module.exports = {
  startScheduler
};
