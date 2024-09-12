const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tasks.db');

db.serialize(() => {
 db.run(`ALTER TABLE tasks ADD COLUMN date_time DATETIME;`);
});