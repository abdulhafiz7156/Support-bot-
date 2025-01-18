const mysql = require('mysql2');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Set up the MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Task model using MySQL queries
const Task = {
    // Insert a new task into the database
    create: (taskId, chatId, callback) => {
        const query = 'INSERT INTO tasks (taskId, chatId) VALUES (?, ?)';
        pool.execute(query, [taskId, chatId], (err, results) => {
            if (err) {
                return callback(err);
            }
            callback(null, results);
        });
    },

    // Get a task by taskId
    findByTaskId: (taskId, callback) => {
        const query = 'SELECT * FROM tasks WHERE taskId = ?';
        pool.execute(query, [taskId], (err, results) => {
            if (err) {
                return callback(err);
            }
            callback(null, results[0]);
        });
    },

    // Optionally, you can also add a method to list tasks or delete tasks, if needed
};

// Export the Task model
module.exports = Task;
