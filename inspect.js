const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tasks.db');
db.all('PRAGMA table_info(tasks)', (err, rows) => {
  if (err) {
    console.error('Помилка при отриманні інформації про таблицю:', err.message);
  } else {
    console.log('Схема таблиці tasks:', rows);
  }
});
