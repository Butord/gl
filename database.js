const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tasks.db');

// Створення таблиць
db.serialize(() => {
  // Створення таблиці задач
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    task TEXT NOT NULL,
    deadline TEXT,
    priority TEXT,
    category TEXT
  )`);

  // Створення таблиці категорій
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    category TEXT NOT NULL
  )`);

  // Створення таблиці підзадач
  db.run(`CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    parent_task_id INTEGER NOT NULL,
    subtask TEXT NOT NULL,
    FOREIGN KEY (parent_task_id) REFERENCES tasks (id)
  )`);

  
});

module.exports = db;