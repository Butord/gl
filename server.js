const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const schedule = require("node-schedule");
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true, request: { debug: true } });
const userState = {}; // Зберігає стан для кожного користувача

const db = new sqlite3.Database("./tasks.db");

// Ловимо помилки polling
bot.on("polling_error", (error) => {
  console.error(`Polling error: ${error.code} - ${error.message}`);
});
// Завантаження запланованих нагадувань при запуску бота
loadScheduledReminders();
// Створення таблиці, якщо вона не існує
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER, task TEXT, date_time TEXT)",
    (err) => {
      if (err) {
        console.error(`Error creating table: ${err.message}`);
      }
    }
  );
});

// Закриття бази даних при завершенні програми
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Помилка при закритті бази даних:', err.message);
    }
    console.log('База даних успішно закрита.');
    process.exit(0);
  });
});

// Функція для відправки варіантів вибору часу
function sendTimeOptions(chatId) {
  bot.sendMessage(chatId, "Виберіть час для задачі або введіть власний:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "09:00", callback_data: "09:00" }],
        [{ text: "12:00", callback_data: "12:00" }],
        [{ text: "18:00", callback_data: "18:00" }],
        [{ text: "Ввести власний час", callback_data: "custom_time" }],
      ],
    },
  });
}

function scheduleReminder(chatId, reminderTime, task) {
  console.log(`Scheduling reminder for ${reminderTime}`);
  schedule.scheduleJob(reminderTime, () => {
    bot.sendMessage(chatId, `Reminder: ${task}`);
    console.log(`Reminder sent for task: ${task}`);
  });
}


// Ваша функція обробки кастомного нагадування
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId]) return;

  const userStep = userState[chatId].step;

  if (userStep === "waitingForCustomReminder") {
    const minutesBefore = parseInt(msg.text);
    if (isNaN(minutesBefore) || minutesBefore <= 0) {
      bot.sendMessage(chatId, "Invalid value. Enter a positive number of minutes.");
      return;
    }

    const reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - minutesBefore * 60 * 1000);
    console.log(`Reminder time: ${reminderTime}`);
    scheduleReminder(chatId, reminderTime, userState[chatId].task);
    saveTask(chatId, userState[chatId].chosenDateTime);
  }
});



// Збереження задачі до бази даних
function saveTask(chatId, chosenDateTime, reminderTime) {
  db.run(
    "INSERT INTO tasks (chat_id, task, date_time, reminder_time) VALUES (?, ?, ?, ?)",
    [chatId, userState[chatId].task, chosenDateTime.toISOString(), reminderTime.toISOString()],
    (err) => {
      if (err) {
        console.error(`Error saving task: ${err.message}`);
      } else {
        console.log("Task successfully saved.");
      }
    }
  );
}

// Завантаження всіх запланованих нагадувань з бази даних
function loadScheduledReminders() {
  db.all("SELECT chat_id, task, reminder_time FROM tasks WHERE reminder_time IS NOT NULL", [], (err, rows) => {
    if (err) {
      console.error(`Error loading scheduled reminders: ${err.message}`);
      return;
    }

    rows.forEach((row) => {
      const reminderTime = new Date(row.reminder_time);
      if (reminderTime > new Date()) { // Переконайтесь, що час нагадування ще не минув
        scheduleReminder(row.chat_id, reminderTime, row.task);
      }
    });
  });
}

// Очищення стану користувача
function clearUserState(chatId) {
  if (userState[chatId]) {
    delete userState[chatId];
    console.log(`Стан для користувача ${chatId} очищено.`);
  }
}

// Функція для обробки часу нагадування
function handleReminder(chatId, data) {
  let reminderTime;

  if (data === "one_hour") {
    reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - 60 * 60 * 1000);
  } else if (data === "one_day") {
    reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - 24 * 60 * 60 * 1000);
  } else if (data === "custom_reminder") {
    userState[chatId].step = "waitingForCustomReminder";
    bot.sendMessage(chatId, "За скільки хвилин до задачі ви хочете отримати нагадування?");
    return;
  }

  scheduleReminder(chatId, reminderTime, userState[chatId].task);
  saveTask(chatId, userState[chatId].chosenDateTime);
  bot.sendMessage(chatId, "Задачу додано! Ви отримаєте нагадування в зазначений час.");
  clearUserState(chatId);
  
}

// Вітальне повідомлення
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привіт! Я допоможу тобі планувати задачі. Напиши /help для перегляду доступних команд."
  );
});

// Обробка скасування дії
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  if (userState[chatId]) {
    clearUserState(chatId);
    bot.sendMessage(chatId, "Дію скасовано.");
  } else {
    bot.sendMessage(chatId, "Немає активної дії для скасування.");
  }
});

// Команда для додавання задачі
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;

  if (userState[chatId] && userState[chatId].chosenDateTime) {
    bot.sendMessage(chatId, "Спочатку завершіть попередню дію.");
    return;
  }

  userState[chatId] = { step: "addingTask" };
  bot.sendMessage(chatId, "Напиши назву задачі (або /cancel для скасування):");
});

// Команда для перегляду задач
bot.onText(/\/tasks/, (msg) => {
  const chatId = msg.chat.id;

  db.all("SELECT id, task, date_time FROM tasks WHERE chat_id = ?", [chatId], (err, rows) => {
    if (err) {
      bot.sendMessage(chatId, "Сталася помилка при отриманні задач.");
      return;
    }

    if (rows.length === 0) {
      bot.sendMessage(chatId, "У вас немає задач.");
    } else {
      let taskList = "Ваші задачі:\n";
      rows.forEach((row) => {
        const date = new Date(row.date_time);
        const formattedDate = date.toLocaleDateString('uk-UA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedTime = date.toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });

        taskList += `ID: ${row.id}\nЗадача: ${row.task}\nДата: ${formattedDate}\nЧас: ${formattedTime}\n\n`;
      });
      bot.sendMessage(chatId, taskList);
    }
  });
});


// Один обробник для всіх повідомлень
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!userState[chatId]) return;

  const userStep = userState[chatId].step;
  console.log(`Крок користувача: ${userStep}`);

  if (userStep === "addingTask") {
    const task = msg.text;

    if (task === "/cancel") {
      clearUserState(chatId);
      bot.sendMessage(chatId, "Додавання задачі скасовано.");
      return;
    }

    userState[chatId].task = task;
    userState[chatId].step = "waitingForDate";
    bot.sendMessage(chatId, "Виберіть дату для задачі:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Сьогодні", callback_data: "today" }],
          [{ text: "Завтра", callback_data: "tomorrow" }],
          [{ text: "Інша дата", callback_data: "other_date" }],
        ],
      },
    });
  } else if (userStep === "waitingForManualDate") {
    const manualDate = new Date(msg.text);
    const now = new Date();

    if (manualDate.toString() === 'Invalid Date' || manualDate < now) {
      bot.sendMessage(chatId, "Неправильний формат або дата в минулому. Введіть дату у форматі YYYY-MM-DD.");
      return;
    }

    userState[chatId].chosenDate = manualDate;
    userState[chatId].step = "waitingForTime";
    sendTimeOptions(chatId);
  } else if (userStep === "waitingForCustomTime") {
    const customTime = msg.text;
    const isValidTime = /^\d{2}:\d{2}$/.test(customTime);

    const chosenDateTime = new Date(
      `${userState[chatId].chosenDate.toISOString().split("T")[0]}T${customTime}:00`
    );
    const now = new Date();

    console.log(`Дата і час задачі: ${chosenDateTime}`);

    if (!isValidTime || chosenDateTime < now) {
      bot.sendMessage(chatId, "Неправильний формат або час в минулому. Введіть час у форматі HH:MM.");
      return;
    }

    userState[chatId].chosenTime = customTime;
    userState[chatId].chosenDateTime = chosenDateTime;
    userState[chatId].step = "waitingForReminder";

    bot.sendMessage(chatId, "Коли ви хочете отримати нагадування?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "За годину", callback_data: "one_hour" }],
          [{ text: "За день", callback_data: "one_day" }],
          [{ text: "Свій час", callback_data: "custom_reminder" }],
        ],
      },
    });
  } else if (userStep === "waitingForCustomReminder") {
    const minutesBefore = parseInt(msg.text);
    if (isNaN(minutesBefore) || minutesBefore <= 0) {
      bot.sendMessage(chatId, "Будь ласка, введіть правильне число хвилин.");
      return;
    }

    const reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - minutesBefore * 60 * 1000);
    scheduleReminder(chatId, reminderTime, userState[chatId].task);
    saveTask(chatId, userState[chatId].chosenDateTime);
    bot.sendMessage(chatId, "Задачу додано! Ви отримаєте нагадування в зазначений час.");
    clearUserState(chatId);
  }
});

// Обробка callback даних
bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  if (userState[chatId] && userState[chatId].step === "waitingForDate") {
    const now = new Date();
    if (data === "today") {
      userState[chatId].chosenDate = now;
      userState[chatId].step = "waitingForTime";
      sendTimeOptions(chatId);
    } else if (data === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      userState[chatId].chosenDate = tomorrow;
      userState[chatId].step = "waitingForTime";
      sendTimeOptions(chatId);
    } else if (data === "other_date") {
      userState[chatId].step = "waitingForManualDate";
      bot.sendMessage(chatId, "Введіть дату у форматі YYYY-MM-DD.");
    }
  } else if (userState[chatId] && userState[chatId].step === "waitingForTime") {
    if (data === "custom_time") {
      userState[chatId].step = "waitingForCustomTime";
      bot.sendMessage(chatId, "Введіть час у форматі HH:MM.");
    } else {
      const chosenDateTime = new Date(
        `${userState[chatId].chosenDate.toISOString().split("T")[0]}T${data}:00`
      );
      userState[chatId].chosenTime = data;
      userState[chatId].chosenDateTime = chosenDateTime;
      userState[chatId].step = "waitingForReminder";

      bot.sendMessage(chatId, "Коли ви хочете отримати нагадування?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "За годину", callback_data: "one_hour" }],
            [{ text: "За день", callback_data: "one_day" }],
            [{ text: "Свій час", callback_data: "custom_reminder" }],
          ],
        },
      });
    }
  } else if (userState[chatId] && userState[chatId].step === "waitingForReminder") {
    handleReminder(chatId, data);
  }
});
