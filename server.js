const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const schedule = require("node-schedule");
const moment = require("moment-timezone");

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true, request: { debug: true } });
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
}

// Function to schedule reminder (adjusted for timezone)
function scheduleReminder(chatId, reminderTime, task, timezone) {
  console.log(`Original reminderTime: ${reminderTime}`);
  console.log(`User timezone: ${timezone}`);

  const reminderTimeInUserTz = moment.tz(reminderTime, timezone);
  console.log(`Reminder time in user timezone: ${reminderTimeInUserTz.format()}`);
  
  const reminderTimeUtc = reminderTimeInUserTz.utc().toDate();
  console.log(`Reminder time in UTC: ${reminderTimeUtc}`);
  
  const currentTime = new Date();
  console.log(`Current time: ${currentTime}`);
  
  if (reminderTimeUtc <= currentTime) {
    console.log(`Reminder time ${reminderTimeUtc} is in the past. Skipping scheduling.`);
    return;
  }
  
  schedule.scheduleJob(reminderTimeUtc, () => {
    console.log(`Sending reminder for ${task} at ${new Date()}`);
    bot.sendMessage(chatId, `Reminder: ${task}`);
  });
}





// Save task to database (adjusted for timezone)
function saveTask(chatId, chosenDateTime, reminderTime) {
  if (!(chosenDateTime instanceof Date) || isNaN(chosenDateTime)) {
    console.error("Invalid chosenDateTime:", chosenDateTime);
    return;
  }
  if (!(reminderTime instanceof Date) || isNaN(reminderTime)) {
    console.error("Invalid reminderTime:", reminderTime);
    return;
  }

  const timezone = userState[chatId]?.timezone;
  console.log(`Timezone for user ${chatId}: ${timezone}`);

  if (!timezone) {
    console.error("Timezone is undefined. Cannot save task.");
    return;
  }

  // Convert times to UTC before saving
  const chosenDateTimeUtc = moment.tz(chosenDateTime, timezone).utc().toISOString();
  const reminderTimeUtc = moment.tz(reminderTime, timezone).utc().toISOString();

  db.run(
    "INSERT INTO tasks (chat_id, task, date_time, reminder_time, timezone) VALUES (?, ?, ?, ?, ?)",
    [chatId, userState[chatId].task, chosenDateTimeUtc, reminderTimeUtc, timezone],
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
      
      console.log(`Loaded reminder time: ${reminderTime}`);
      console.log(`Loaded timezone: ${timezone}`);
      
      if (reminderTime > new Date()) {
        scheduleReminder(row.chat_id, reminderTime, row.task, timezone);
      }
    });
  });
}




// Clear user state
function clearUserState(chatId) {
  if (userState[chatId]) {
    delete userState[chatId];
    console.log(`State for user ${chatId} cleared.`);
  }
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
  saveTask(chatId, userState[chatId].chosenDateTime, reminderTime);
  bot.sendMessage(chatId, "Task added! You will receive a reminder at the specified time.");
  clearUserState(chatId);
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
// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  db.get("SELECT timezone FROM tasks WHERE chat_id = ?", [chatId], (err, row) => {
    if (err) {
      console.error(`Error fetching timezone: ${err.message}`);
      bot.sendMessage(chatId, "An error occurred. Please try again later.");
      return;
    }
    
    if (!row || !row.timezone) {
      userState[chatId] = { step: "waitingForTimezone" };
      bot.sendMessage(chatId, "Welcome! Please provide your timezone in the format 'Continent/City' (e.g., Europe/Kiev).");
    } else {
      console.log(`Timezone for user ${chatId} is ${row.timezone}`);
      userState[chatId] = { timezone: row.timezone }; // Ensure timezone is set in userState
      bot.sendMessage(chatId, `Welcome back! Your timezone is set to ${row.timezone}.`);
    }
  });
});



// Handle the /set_timezone command
bot.onText(/\/set_timezone/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: "waitingForTimezone" };
  bot.sendMessage(
    chatId,
    "Please provide your timezone in the format 'Continent/City' (e.g., Europe/Kiev).\n\nHere are a few common timezones you can use:\n- Europe/Kiev\n- Europe/London\n- America/New_York\n- Asia/Tokyo"
  );
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (userState[chatId] && userState[chatId].step === "waitingForTimezone") {
    const timezone = msg.text;

    if (moment.tz.names().includes(timezone)) {
      console.log(`Valid timezone received: ${timezone}`);
      db.run("UPDATE tasks SET timezone = ? WHERE chat_id = ?", [timezone, chatId], (err) => {
        if (err) {
          console.error(`Error updating timezone: ${err.message}`);
          bot.sendMessage(chatId, "An error occurred while saving your timezone.");
          return;
        }
        // Ensure timezone is also set in userState
        userState[chatId].timezone = timezone;
        bot.sendMessage(chatId, `✅ Timezone set to ${timezone}.`);
        clearUserState(chatId);
      });
    } else {
      bot.sendMessage(chatId, `❌ Invalid timezone: "${timezone}". Please enter a valid timezone in the format 'Continent/City'.`);
    }
  }
});


// Add task command
bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;

  if (userState[chatId] && userState[chatId].step) {
    bot.sendMessage(chatId, "Please complete the previous action first.");
    return;
  }

  userState[chatId] = { step: "waitingForTaskName" };
  bot.sendMessage(chatId, "Enter the task name (or /cancel to cancel):");
});

// Handle incoming messages for task name
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // Step: waiting for task name
  if (userState[chatId] && userState[chatId].step === "waitingForTaskName") {
    const taskName = msg.text;

    if (taskName === "/cancel") {
      clearUserState(chatId);
      bot.sendMessage(chatId, "Action canceled.");
      return;
    }

    userState[chatId].task = taskName;
    userState[chatId].step = "waitingForTaskDate";
    bot.sendMessage(chatId, "Enter the task date in the format YYYY-MM-DD (or /cancel to cancel):");
    return;
  }

  // Step: waiting for task date
  if (userState[chatId] && userState[chatId].step === "waitingForTaskDate") {
    const taskDate = msg.text;

    if (taskDate === "/cancel") {
      clearUserState(chatId);
      bot.sendMessage(chatId, "Action canceled.");
      return;
    }

    if (!moment(taskDate, "YYYY-MM-DD", true).isValid()) {
      bot.sendMessage(chatId, "Invalid date format. Please enter the date in the format YYYY-MM-DD.");
      return;
    }

    userState[chatId].taskDate = taskDate;
    userState[chatId].step = "waitingForTaskTime";
    bot.sendMessage(chatId, "Enter the task time in the format HH:mm (or /cancel to cancel):");
    return;
  }

  // Step: waiting for task time
  if (userState[chatId] && userState[chatId].step === "waitingForTaskTime") {
    const taskTime = msg.text;

    if (taskTime === "/cancel") {
      clearUserState(chatId);
      bot.sendMessage(chatId, "Action canceled.");
      return;
    }

    if (!moment(taskTime, "HH:mm", true).isValid()) {
      bot.sendMessage(chatId, "Invalid time format. Please enter the time in the format HH:mm.");
      return;
    }

    userState[chatId].taskTime = taskTime;
    const dateTimeString = `${userState[chatId].taskDate} ${userState[chatId].taskTime}`;
    const chosenDateTime = moment.tz(dateTimeString, userState[chatId].timezone);

    if (!chosenDateTime.isValid()) {
      bot.sendMessage(chatId, "Invalid date or time. Please try again.");
      return;
    }

    userState[chatId].chosenDateTime = chosenDateTime.toDate();
    sendReminderOptions(chatId);
  }

  // Handle custom reminder time input
  if (userState[chatId] && userState[chatId].step === "waitingForCustomReminder") {
    const customMinutes = parseInt(msg.text, 10);
    if (isNaN(customMinutes)) {
      bot.sendMessage(chatId, "Invalid input. Please enter a number.");
      return;
    }

    const reminderTime = new Date(userState[chatId].chosenDateTime.getTime() - customMinutes * 60 * 1000);
    scheduleReminder(chatId, reminderTime, userState[chatId].task, userState[chatId].timezone);
    saveTask(chatId, userState[chatId].chosenDateTime, reminderTime);
    bot.sendMessage(chatId, "Task added! You will receive a reminder at the specified time.");
    clearUserState(chatId);
  }
});

// View tasks command
bot.onText(/\/tasks/, (msg) => {
  const chatId = msg.chat.id;

  db.all("SELECT id, task, date_time, timezone FROM tasks WHERE chat_id = ?", [chatId], (err, rows) => {
    if (err) {
      bot.sendMessage(chatId, "Error fetching tasks.");
      return;
    }

    if (rows.length === 0) {
      bot.sendMessage(chatId, "You have no tasks.");
    } else {
      let taskList = "Your tasks:\n";
      rows.forEach((row) => {
        const dateTimeInUserTz = moment.tz(row.date_time, row.timezone).format('YYYY-MM-DD HH:mm');
        taskList += `ID: ${row.id}\nTask: ${row.task}\nDate and Time: ${dateTimeInUserTz} (${row.timezone})\n\n`;
      });
      bot.sendMessage(chatId, taskList);
    }
  });
});

// Cancel action command
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  if (userState[chatId]) {
    clearUserState(chatId);
    bot.sendMessage(chatId, "Action canceled.");
  } else {
    bot.sendMessage(chatId, "No active action to cancel.");
  }
});
// Handle callback queries for reminder options
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (userState[chatId] && userState[chatId].step === "waitingForReminder") {
    handleReminder(chatId, data);
  }
});
