const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const schedule = require("node-schedule");
const moment = require("moment-timezone");

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const userState = {}; // Stores user state

const db = new sqlite3.Database("./tasks.db");

// Handling polling errors
bot.on("polling_error", (error) => {
  console.error(`Polling error: ${error.code} - ${error.message}`);
});

// Load scheduled reminders when bot starts
loadScheduledReminders();

// Create table if it doesn't exist
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER, task TEXT, date_time TEXT, reminder_time TEXT, timezone TEXT)",
    (err) => {
      if (err) {
        console.error(`Error creating table: ${err.message}`);
      }
    }
  );
});

// Close database connection on exit
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err.message);
    }
    console.log("Database closed successfully.");
    process.exit(0);
  });
});

// Send time options to user
function sendTimeOptions(chatId) {
  bot.sendMessage(chatId, "Choose a time for the task or enter your own:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "09:00", callback_data: "09:00" }],
        [{ text: "12:00", callback_data: "12:00" }],
        [{ text: "18:00", callback_data: "18:00" }],
        [{ text: "Enter custom time", callback_data: "custom_time" }],
      ],
    },
  });
  userState[chatId].step = "waitingForTime";
}

// Send reminder options to user
function sendReminderOptions(chatId) {
  bot.sendMessage(chatId, "When would you like to receive a reminder?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "1 hour before", callback_data: "one_hour" }],
        [{ text: "1 day before", callback_data: "one_day" }],
        [{ text: "Custom time", callback_data: "custom_reminder" }],
      ],
    },
  });
  userState[chatId].step = "waitingForReminder";
}

// Send date options to user
function sendDateOptions(chatId) {
  bot.sendMessage(chatId, "When is this task scheduled?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Today", callback_data: "today" }],
        [{ text: "Tomorrow", callback_data: "tomorrow" }],
        [{ text: "Enter custom date", callback_data: "custom_date" }]
      ]
    }
  });
  userState[chatId].step = "waitingForDate";
}

// Schedule reminder with user's timezone
function scheduleReminder(chatId, reminderTime, task, timezone) {
  const reminderTimeInUserTz = moment.tz(reminderTime, timezone);
  const reminderTimeUtc = reminderTimeInUserTz.utc().toDate();

  const currentTime = new Date();
  if (reminderTimeUtc <= currentTime) {
    return; // Skip scheduling if reminder time is in the past
  }

  schedule.scheduleJob(reminderTimeUtc, () => {
    bot.sendMessage(chatId, `Reminder: ${task}`);
  });
}

// Save task to database (with timezone consideration)
function saveTask(chatId, task, dateTime, reminderTime) {
  const timezone = userState[chatId]?.timezone;

  if (!timezone) {
    console.error(`No timezone set for user ${chatId}`);
    return;
  }

  const dateTimeUtc = moment.tz(dateTime, timezone).utc().toISOString();
  const reminderTimeUtc = reminderTime ? moment.tz(reminderTime, timezone).utc().toISOString() : null;

  db.run(
    "INSERT INTO tasks (chat_id, task, date_time, reminder_time, timezone) VALUES (?, ?, ?, ?, ?)",
    [chatId, task, dateTimeUtc, reminderTimeUtc, timezone],
    (err) => {
      if (err) {
        console.error(`Error saving task: ${err.message}`);
      } else {
        console.log("Task successfully saved.");
      }
    }
  );
}

// Load scheduled reminders from database
function loadScheduledReminders() {
  db.all("SELECT chat_id, task, reminder_time, timezone FROM tasks WHERE reminder_time IS NOT NULL", [], (err, rows) => {
    if (err) {
      console.error(`Error loading scheduled reminders: ${err.message}`);
      return;
    }

    rows.forEach((row) => {
      const reminderTime = new Date(row.reminder_time);
      const timezone = row.timezone;

      if (reminderTime > new Date()) {
        scheduleReminder(row.chat_id, reminderTime, row.task, timezone);
      }
    });
  });
}

// Handle reminder settings
function handleReminder(chatId, data) {
  let reminderTime;

  if (data === "one_hour") {
    reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - 60 * 60 * 1000);
  } else if (data === "one_day") {
    reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - 24 * 60 * 60 * 1000);
  } else if (data === "custom_reminder") {
    userState[chatId].step = "waitingForCustomReminder";
    bot.sendMessage(chatId, "In how many minutes before the task would you like to receive a reminder?");
    return;
  }

  scheduleReminder(chatId, reminderTime, userState[chatId].task, userState[chatId].timezone);
  saveTask(chatId, userState[chatId].task, userState[chatId].chosenDateTime, reminderTime);
  bot.sendMessage(chatId, "Task added! You will receive a reminder at the specified time.");
  clearUserState(chatId);
}

// Handle date selection
function handleDateSelection(chatId, data) {
  let chosenDate;

  if (data === "today") {
    chosenDate = moment.tz(userState[chatId].timezone).format("YYYY-MM-DD");
  } else if (data === "tomorrow") {
    chosenDate = moment.tz(userState[chatId].timezone).add(1, 'days').format("YYYY-MM-DD");
  } else if (data === "custom_date") {
    bot.sendMessage(chatId, "Please enter the custom date in YYYY-MM-DD format.");
    userState[chatId].step = "waitingForCustomDate";
    return;
  }

  userState[chatId].chosenDate = chosenDate;
  sendTimeOptions(chatId);
}

// Handle time selection
function handleTimeSelection(chatId, data) {
  let chosenTime;

  if (data === "custom_time") {
    bot.sendMessage(chatId, "Please enter the custom time for your task in HH:MM format.");
    userState[chatId].step = "waitingForCustomTime";
    return;
  } else {
    chosenTime = data;
  }

  const chosenDateTime = `${userState[chatId].chosenDate} ${chosenTime}`;
  userState[chatId].chosenDateTime = moment.tz(chosenDateTime, "YYYY-MM-DD HH:mm", userState[chatId].timezone).toDate();

  sendReminderOptions(chatId);
}

// Clear user state
function clearUserState(chatId) {
  if (userState[chatId]) {
    delete userState[chatId];
  }
}

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.get("SELECT timezone FROM tasks WHERE chat_id = ?", [chatId], (err, row) => {
    if (err) {
      bot.sendMessage(chatId, "An error occurred. Please try again later.");
      return;
    }

    if (!row || !row.timezone) {
      userState[chatId] = { step: "waitingForTimezone" };
      bot.sendMessage(chatId, "Welcome! Please provide your timezone in the format 'Continent/City' (e.g., Europe/Kiev).");
    } else {
      userState[chatId] = { timezone: row.timezone };
      bot.sendMessage(chatId, `Welcome back! Your timezone is set to ${row.timezone}.`);
    }
  });
});

// Handle the /set_timezone command
bot.onText(/\/set_timezone/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: "waitingForTimezone" };
  bot.sendMessage(chatId, "Please provide your timezone in the format 'Continent/City' (e.g., Europe/Kiev).");
});

// Handle user messages for setting timezone or task details
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (userState[chatId] && userState[chatId].step === "waitingForTimezone") {
    const timezone = msg.text.trim();
if (moment.tz.zone(timezone)) {
  // Таймзона вірна
  db.run("UPDATE tasks SET timezone = ? WHERE chat_id = ?", [timezone, chatId], (err) => {
    if (err) {
      bot.sendMessage(chatId, "An error occurred while saving your timezone.");
      return;
    }

    userState[chatId].timezone = timezone;
    bot.sendMessage(chatId, `Timezone set to ${timezone}. You can now add tasks.`);
  });
} else {
  // Неправильний формат таймзони
  bot.sendMessage(chatId, "Invalid timezone format. Please try again.");
  console.log(`Invalid timezone: ${timezone}`);
}

  } else if (userState[chatId] && userState[chatId].step === "waitingForTaskDescription") {
    userState[chatId].task = msg.text.trim();
    sendDateOptions(chatId);
  } else if (userState[chatId] && userState[chatId].step === "waitingForCustomDate") {
    const date = msg.text.trim();
    if (moment(date, "YYYY-MM-DD", true).isValid()) {
      userState[chatId].chosenDate = date;
      sendTimeOptions(chatId);
    } else {
      bot.sendMessage(chatId, "Invalid date format. Please enter the date in YYYY-MM-DD format.");
    }
  } else if (userState[chatId] && userState[chatId].step === "waitingForCustomTime") {
    const time = msg.text.trim();
    if (moment(time, "HH:mm", true).isValid()) {
      const chosenDateTime = `${userState[chatId].chosenDate} ${time}`;
      userState[chatId].chosenDateTime = moment.tz(chosenDateTime, "YYYY-MM-DD HH:mm", userState[chatId].timezone).toDate();
      sendReminderOptions(chatId);
    } else {
      bot.sendMessage(chatId, "Invalid time format. Please enter the time in HH:MM format.");
    }
  } else if (userState[chatId] && userState[chatId].step === "waitingForCustomReminder") {
    const minutes = parseInt(msg.text.trim(), 10);
    if (!isNaN(minutes) && minutes > 0) {
      const reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - minutes * 60 * 1000);
      scheduleReminder(chatId, reminderTime, userState[chatId].task, userState[chatId].timezone);
      saveTask(chatId, userState[chatId].task, userState[chatId].chosenDateTime, reminderTime);
      bot.sendMessage(chatId, `Task added! You will receive a reminder ${minutes} minutes before the task.`);
      clearUserState(chatId);
    } else {
      bot.sendMessage(chatId, "Please enter a valid number of minutes.");
    }
  }
});

// Handle the /add command (now without task description)
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;

  if (!userState[chatId] || !userState[chatId].timezone) {
    bot.sendMessage(chatId, "Please set your timezone using /set_timezone before adding tasks.");
    return;
  }

  userState[chatId] = { step: "waitingForTaskDescription", timezone: userState[chatId].timezone };
  bot.sendMessage(chatId, "Please enter the description of the task.");
});

// Handle callback queries (date, time, reminder selection)
bot.on("callback_query", (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (userState[chatId].step === "waitingForDate") {
    handleDateSelection(chatId, data);
  } else if (userState[chatId].step === "waitingForTime") {
    handleTimeSelection(chatId, data);
  } else if (userState[chatId].step === "waitingForReminder") {
    handleReminder(chatId, data);
  }
});
