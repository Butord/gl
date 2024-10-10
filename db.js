const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:'); // Можна змінити на файл бази

db.serialize(() => {
  // Таблиця для нагадувань
  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      reminder_text TEXT,
      reminder_time TEXT,
      timezone TEXT,
      notify_time TEXT,
      is_sent_notify INTEGER DEFAULT 0,
      is_sent_reminder INTEGER DEFAULT 0
    )
  `);
  
  // Таблиця для користувачів
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      timezone TEXT
    )
  `);
});

// Функція для додавання нагадування
async function addReminder(userId, reminderText, reminderDate, reminderTime, timezone, notifyTime) {
  const reminderDateTime = `${reminderDate}T${reminderTime}:00`;
  
  const stmt = db.prepare(`
    INSERT INTO reminders (user_id, reminder_text, reminder_time, timezone, notify_time)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(userId, reminderText, reminderDateTime, timezone, notifyTime, function(err) {
    if (err) {
      console.error('Помилка додавання нагадування:', err);
    } else {
      console.log(`Нагадування для користувача ${userId} успішно додано.`);
    }
  });

  stmt.finalize();
}

// Функція для запиту дати
async function askForDate(userId) {
  // Ваша реалізація запиту дати до користувача
  // Наприклад, ви можете використовувати:
  // bot.sendMessage(userId, "Введіть дату нагадування (формат YYYY-MM-DD):");
}

// Функція для запиту часу
async function askForTime(userId) {
  // Ваша реалізація запиту часу до користувача
  // Наприклад, ви можете використовувати:
  // bot.sendMessage(userId, "Введіть час нагадування (формат HH:mm):");
}

// Функція для запиту про сповіщення
async function askForNotifyTime(userId) {
  // Ваша реалізація запиту часу сповіщення до користувача
  // Наприклад, ви можете використовувати:
  // bot.sendMessage(userId, "Введіть час для повідомлення перед нагадуванням (формат HH:mm):");
}

// Функція для отримання всіх нагадувань
function getAllReminders(callback) {
  db.all(`SELECT * FROM reminders`, (err, rows) => {
    if (err) {
      console.error('Помилка отримання нагадувань:', err);
    } else {
      console.log('Отримані нагадування:', rows);
      callback(rows);
    }
  });
}
// Функція для позначення відправленого нагадування або сповіщення
function markAsSent(id, type) {
  let field = type === 'notify' ? 'is_sent_notify' : 'is_sent_reminder';
  const stmt = db.prepare(`
    UPDATE reminders
    SET ${field} = 1
    WHERE id = ?
  `);
  stmt.run(id);
  stmt.finalize();
}
function saveUserTimezone(userId, timezone) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users (id, timezone)
    VALUES (?, ?)
  `);
  stmt.run(userId, timezone);
  stmt.finalize();
}
function getUserTimezone(userId, callback) {
  db.get(`SELECT timezone FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err) {
      console.error('Помилка отримання часового поясу:', err);
      callback(null);
    } else {
      callback(row ? row.timezone : null);
    }
  });
}

module.exports = {
  addReminder,
  getAllReminders,
  markAsSent,
  saveUserTimezone,
  getUserTimezone
};
