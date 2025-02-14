const axios = require('axios');
const FormData = require('form-data');
const Task = require('./models/Task');
const { Telegraf } = require('telegraf');
const {message} = require("telegraf/filters");
const mysql = require('mysql2');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const path = require('path');
const BOT_TOKEN = '7712404901:AAFmA0FeK_NSxRw3O6SWRHUlAuSfgJ5NsLk';

const bot = new Telegraf(BOT_TOKEN);
const userSteps = {};
const userTaskIds = {};
const userContacts = {};
const userLanguages = {};
const userPhotoUrls = {}
const userFeedbacks = {};
const userRestaurants = {};
const userDescription = {};
const userSelectedProblems = {};

let tasks = [];


bot.telegram.setMyCommands([
    { command: 'create', description: 'Создание заявки' },
    { command: 'stop', description: 'Отмена заявки' },
    { command: 'finish', description: 'Удалить задание' },
]);

const sendToClickUp = async ({ title, description, selectedProblem, ctx, chatId, chatDescription }) => {
    let listId;
    console.log(`eee ${chatDescription} or i have ${chatId}??`);
    const folderId = '90183057235';

    if (selectedProblem === 'financial') {
        const lists = await getClickUpListsForFolder(folderId);
        console.log(lists[0].name === chatDescription);
        const matchingList = lists.find(list => list.name === chatDescription);

        if (!matchingList) {
            await ctx.reply('Не найден соответствующий список для указанного чата. Проверьте данные.');
            throw new Error('No matching list found');
        }

        listId = matchingList.id;

        const data = {
            name: 'Заявка от клиента',
            description: chatDescription, // Now the description is the chat name
        };

        const createTaskUrl = `https://api.clickup.com/api/v2/list/${listId}/task`;

        try {
            const createTaskResponse = await fetch(createTaskUrl, {
                method: 'POST',
                headers: {
                    'Authorization': process.env.CLICKUP_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const createTaskResponseData = await createTaskResponse.json();

            if (createTaskResponse.ok) {
                console.log('Task created successfully:', createTaskResponseData);

                const taskId = createTaskResponseData.id;
                const query = 'INSERT INTO tasks (taskId, chatId) VALUES (?, ?)';
                pool.execute(query, [taskId, chatId], (err, results) => {
                    if (err) {
                        console.error('Error saving task to MySQL:', err);
                        throw new Error('Error saving task to MySQL');
                    }
                    console.log('Task saved to MySQL:', results);
                });

                return { taskId, chatId };
            } else {
                console.error('Error creating task:', createTaskResponseData);
                throw new Error('Error creating task in ClickUp');
            }
        } catch (error) {
            console.error('Error creating task in ClickUp API:', error);
            throw new Error('Error creating task');
        }

    } else {
        switch (selectedProblem) {
            case 'technical':
                listId = process.env.TECH_LIST_ID;
                break;
            case 'material':
                listId = process.env.MAT_LIST_ID;
                break;
            default:
                throw new Error(`Invalid problem type: ${selectedProblem}`);
        }

        const data = {
            name: "Заявка от клиента",
            description: chatDescription, // Now the description is the chat name
            priority: 1
        };

        const headers = {
            'Authorization': process.env.CLICKUP_API_KEY,
            'Content-Type': 'application/json',
        };

        const url = `https://api.clickup.com/api/v2/list/${listId}/task`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data),
            });

            const responseData = await response.json();

            if (response.ok) {
                console.log('Task created successfully:', responseData);

                const taskId = responseData.id;
                const query = 'INSERT INTO tasks (taskId, chatId) VALUES (?, ?)';
                pool.execute(query, [taskId, chatId], (err, results) => {
                    if (err) {
                        console.error('Error saving task to MySQL:', err);
                        throw new Error('Error saving task to MySQL');
                    }
                    console.log('Task saved to MySQL:', results);
                });

                return { taskId, chatId };
            } else {
                console.error('Error creating task:', responseData);
                throw new Error('Error creating task in ClickUp');
            }
        } catch (error) {
            console.error('Error making request to ClickUp API:', error);
            throw new Error('Error processing request');
        }
    }
};

const getClickUpListsForFolder = async (folderId) => {
    const url = `https://api.clickup.com/api/v2/folder/${folderId}/list`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': process.env.CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            }
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error('Error fetching lists:', responseData);
            throw new Error('Error fetching lists from ClickUp');
        }

        // Return the lists from the folder
        return responseData.lists || [];
    } catch (error) {
        console.error('Error fetching lists from ClickUp API:', error);
        throw new Error('Error fetching lists from ClickUp');
    }
};

const deleteTaskFromClickUp = async (taskId) => {
    const deleteTaskUrl = `https://api.clickup.com/api/v2/task/${taskId}`;

    try {
        const response = await fetch(deleteTaskUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': process.env.CLICKUP_API_KEY,
            },
        });

        if (response.ok) {
            console.log(`Task with ID ${taskId} deleted successfully from ClickUp.`);
        } else {
            const responseData = await response.json();
            console.error('Error deleting task:', responseData);
            throw new Error('Error deleting task in ClickUp');
        }
    } catch (error) {
        console.error('Error in deleteTaskFromClickUp:', error);
        throw new Error('Failed to delete task from ClickUp');
    }
};

const deleteTask = async (ctx) => {
    const chatId = ctx.chat.id;

    try {
        const taskId = await getLatestTaskId(chatId);

        if (!taskId) {
            console.log('No task found for chatId:', chatId);
            await ctx.reply('No active task found to delete.');
            return;
        }

        await deleteTaskFromClickUp(taskId);

        const deleteQuery = 'DELETE FROM tasks WHERE taskId = ?';
        await pool.execute(deleteQuery, [taskId]);

        console.log(`Task with ID ${taskId} deleted successfully from database.`);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.reply('Xatolik yuz berdi.');
    }
};

const clearUserState = (userId) => {
    delete userLanguages[userId];
    delete userRestaurants[userId];
    delete userDescription[userId];
    delete userContacts[userId];
    delete userSelectedProblems[userId];
    delete userPhotoUrls[userId];
};

const askForFeedback = async (ctx) => {
    const prompt = `Muammo hal etildi. Iltimos, xizmatimizni baholang (1 dan 5 gacha): 
    
Проблема решена. Пожалуйста, оцените наш сервис от 1 до 5:`;



    await ctx.reply(prompt, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '⭐️', callback_data: 'feedback_1' }],
                [{ text: '⭐️⭐️', callback_data: 'feedback_2' }],
                [{ text: '⭐️⭐️⭐️', callback_data: 'feedback_3' }],
                [{ text: '⭐️⭐️⭐️⭐️', callback_data: 'feedback_4' }],
                [{ text: '⭐️⭐️⭐️⭐️⭐️', callback_data: 'feedback_5' }],
            ],
        },
    });
};

const addCommentToTask = async (taskId, commentText, isFromTelegram = false) => {
    const commentWithTag = isFromTelegram ? `Telegram \n${commentText}` : commentText;

    const url = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
    const data = {
        comment_text: commentWithTag,
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        console.log(`Comment added to task ${taskId}: ${commentText}`);
    } catch (error) {
        console.error(`Error adding comment to task ${taskId}:`, error.response?.data || error.message);
    }
};

const askForProblemType = async (ctx, userLang) => {
    const prompt = `Iltimos, kelib chiqqan muammoni ruknini tanlang: 
    
Пожалуйста, выберите категорию проблемы с которой вы столкнулись:`;


    await ctx.reply(prompt, {
        reply_markup: {
            inline_keyboard: [
                [{ text: userLang === 'uz' ? 'Технический вопрос (Texnik savol)' : '', callback_data: 'problem_technical' }],
                [{ text: userLang === 'uz' ? 'Вопрос к фин отделу (Moliya bo\'limi uchun savol)' : '', callback_data: 'problem_financial' }],
                [{ text: userLang === 'uz' ? 'Вопрос к мат отделу (Material bo\'limi uchun savol)' : '', callback_data: 'problem_material' }],
            ],
        },
    });
};

const saveFeedbackToClickUp = async (chatId, feedbackText, rating) => {
    const taskId = await getLatestTaskId(chatId);
    if (!taskId) {
        console.error('Task ID not found.');
        return;
    }

    console.log(`Сохраняем отзыв: ${feedbackText} с рейтингом ${rating}`);
    const ratingComment = `User feedback rate: ${rating} звезд`;
    await addCommentToTask(taskId, ratingComment);

    const feedbackComment = `User feedback: ${feedbackText}`;
    await addCommentToTask(taskId, feedbackComment);
};

const sendWaitingMessage = async (ctx) => {
    const waitingText = `Iltimos, kuting... So\'rov yaratilmoqda. 
    
Пожалуйста, подождите... Запрос создается.`;

    // Отправить сообщение о том, что нужно подождать
    const sentMessage = await ctx.reply(waitingText);

    // Сохраняем ID сообщения, чтобы потом удалить его
    userSteps[ctx.from.id] = { ...userSteps[ctx.from.id], waitingMessageId: sentMessage.message_id };
};

const processTaskCreation = async (ctx) => {
    try {
        const userLang = userLanguages[ctx.from.id] || 'uz';

        await sendWaitingMessage(ctx, userLang);

        const title = userSelectedProblems[ctx.from.id] || 'Problem';

        const chat = await ctx.telegram.getChat(ctx.chat.id);
        const chatDescription = chat.title || 'Нету описании группы';
        console.log(chat, chatDescription, 'here we are bro');

        const task = await sendToClickUp({
            title,
            description: chatDescription,
            ctx,
            chatId: ctx.chat.id,
            selectedProblem: userSelectedProblems[ctx.from.id],
            chatDescription: chatDescription,
        });

        await ctx.reply(`Iltimos, ma’lumot bering (rasm, matn, video xabar, ovozli xabar).
        
Пожалуйста, предоставьте информацию (фото, текст, видео-сообщение, голосовое сообщение).`)


        userSteps[ctx.from.id] = 'task_created';

        clearUserState(ctx.from.id);

    } catch (error) {
        console.log(error);
        const userLang = userLanguages[ctx.from.id] || 'uz';
        console.error('Error processing task creation:', error.message);
        await ctx.reply(
            userLang === 'uz'
                ? 'So`rov yaratishda xatolik yuz berdi.'
                : 'Произошла ошибка при создании запроса.'
        );
    }
};

const uploadPhotoToClickUp = async (taskId, photoUrls, userName) => {
    const url = `https://api.clickup.com/api/v2/task/${taskId}/attachment`;
    const formData = new FormData();

    console.log(`Downloading photo from URL: ${photoUrls}`);
    try {
        const response = await axios.get(photoUrls, { responseType: 'stream' });
        const fileName = path.basename(photoUrls);
        await addCommentToTask(taskId,  `Sent by ${userName} (${fileName})`);

        formData.append('attachment', response.data, fileName);
        console.log(`Appended photo: ${fileName}`);

    } catch (err) {
        console.error(`Error downloading image from URL ${photoUrls}:`, err.message);
        throw err;
    }

    try {
        // Add comment with the user's name
        const commentText = `Sent by ${userName}: Photo from ClickUp`;
        formData.append('comment', commentText);
        console.log(`Appended comment: ${commentText}`);

        // Post the data to ClickUp API
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: process.env.CLICKUP_API_KEY,
            },
        });

        console.log('Photo uploaded successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error uploading photo to ClickUp:', error.response?.data || error.message);
        throw error;
    }
};

const uploadVoiceToClickUp = async (taskId, voiceUrl, userName) => {
    console.log("Uploading voice message to ClickUp:", voiceUrl);

    const url = `https://api.clickup.com/api/v2/task/${taskId}/attachment`;
    const formData = new FormData();

    try {
        const response = await axios.get(voiceUrl, { responseType: 'stream' });
        const fileName = `voice_message_${Date.now()}.ogg`;
        await addCommentToTask(taskId,  `Sent by ${userName} (${fileName})`);
        formData.append('attachment', response.data, fileName);

        console.log(`Appended voice: ${fileName}`);

        // Add a comment to indicate the sender
        const commentText = `Sent by ${userName}: Voice message from ClickUp`;
        formData.append('comment', commentText);
        console.log(`Appended comment: ${commentText}`);

        // Post the data to ClickUp API
        const clickUpResponse = await axios.post(url, formData, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'multipart/form-data',
            },
        });

        console.log('Voice uploaded successfully:', clickUpResponse.data);
    } catch (error) {
        console.error('Error uploading voice to ClickUp:', error.response?.data || error.message);
    }
};

const uploadVideoToClickUp = async (taskId, videoUrl, userName) => {
    console.log("Uploading video message to ClickUp:", videoUrl);

    const url = `https://api.clickup.com/api/v2/task/${taskId}/attachment`;
    const formData = new FormData();

    try {
        const response = await axios.get(videoUrl, { responseType: 'stream' });

        const fileName = `video_message_${Date.now()}.mp4`;
        await addCommentToTask(taskId,  `Sent by ${userName} (${fileName})`);

        formData.append('attachment', response.data, fileName);

        console.log(`Appended video: ${fileName}`);

        const commentText = `Sent by ${userName}: Video from ClickUp`;
        formData.append('comment', commentText);
        console.log(`Appended comment: ${commentText}`);

        const clickUpResponse = await axios.post(url, formData, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'multipart/form-data',
            },
        });

        console.log('Video uploaded successfully:', clickUpResponse.data);
    } catch (error) {
        console.error('Error uploading video to ClickUp:', error.response?.data || error.message);
    }
};

const uploadFileToClickUp = async (taskId, fileUrl, fullName, fileName) => {
    try {
        console.log(`Uploading file "${fileName}" to ClickUp for task ID: ${taskId}`);

        // Download the file from Telegram URL
        const response = await axios.get(fileUrl, { responseType: 'stream' });

        // Prepare the form data
        const form = new FormData();
        form.append('attachment', response.data, fileName); // Add the file as an attachment
        form.append('name', fileName); // Add the file name

        // Send the POST request to ClickUp
        await axios.post(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, form, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY, // Ensure API key is correctly set
                ...form.getHeaders(), // Include headers for multipart/form-data
            },
        });

        console.log("File uploaded successfully to ClickUp.");
    } catch (error) {
        console.error("Error uploading file to ClickUp:", error.response?.data || error.message);
        throw new Error("Failed to upload the file to ClickUp.");
    }
};

const handleGroupMessages = async (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        console.log('Message is not from a group or supergroup. Ignoring message.');
        return;
    }

    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    console.log(`Received message from ${fullName} in chat ${chatId}: ${userMessage}`);

    const commentText = `Sent by ${fullName}: ${userMessage}`;

    const taskId = await getLatestTaskId(chatId);

    if (taskId) {
        await addCommentToTask(taskId, commentText);
    } else {
        console.log("No task found for this chatId.");
    }
};

const getChatIdByTaskId = (taskId) => {
    const task = tasks.find(t => t.taskId === taskId);
    return task ? task.chatId : null;
};

const askForCompletionConfirmation = async (chatId) => {
    const userLang = userLanguages[chatId] || 'uz';

    const message = `Muammo  tasdiqlash holatida. Iltimos, muammo hal qilinganini tasdiqlaysizmi? 
        
Задача  в статусе 'подтверждение'. Пожалуйста, подтвердите, завершена ли задача?`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Ha (Да)', callback_data: 'task_completed_yes' },
                    { text: 'Yo\'q (Нет)', callback_data: 'task_completed_no' }
                ]
            ]
        }
    };

    try {
        // Send the message with Inline Buttons
        await bot.telegram.sendMessage(chatId, message, keyboard);
        console.log('Confirmation message sent to user.');
    } catch (error) {
        console.error('Error sending confirmation message:', error);
    }
};

const taskTimestamps = {};

const updateTaskStatus = async (newStatus, chatId, ctx) => {
    try {
        const taskId = await getLatestTaskId(chatId);
        console.log(taskId);
        if (!taskId) {
            throw new Error('No task ID found for the user.');
        }

        const url = `https://api.clickup.com/api/v2/task/${taskId}`;
        const data = { status: newStatus };

        await axios.put(url, data, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        console.log(`Task ${taskId} status updated to "${newStatus}"`);

        const userLang = userLanguages[chatId];

        if (newStatus === 'in progress') {
            taskTimestamps[chatId] = new Date();
            console.log("Task start time saved:", formatDate(taskTimestamps[chatId]));

            await ctx.reply(`Muammo hali hal qilinmagan. Iltimos, yana bir bor tekshirib ko\'ring. 
            
Проблема еще не решена. Пожалуйста, проверьте еще раз.`);
        }

        if (newStatus === 'complete') {
            // Fetch createdAt from database
            const query = 'SELECT createdAt FROM tasks WHERE taskId = ?';
            pool.execute(query, [taskId], async (err, results) => {
                if (err) {
                    console.error('Error fetching task timestamps:', err);
                    throw new Error('Error fetching task timestamps from MySQL');
                }

                if (results.length === 0) {
                    console.log('No timestamps found for taskId:', taskId);
                    return;
                }

                const { createdAt } = results[0];
                console.log('Fetched createdAt:', createdAt);

                if (createdAt) {
                    const finishedAt = new Date(); // Get current timestamp
                    console.log("Setting finishedAt:", finishedAt);

                    const updateQuery = 'UPDATE tasks SET finishedAt = ? WHERE taskId = ?';
                    pool.execute(updateQuery, [finishedAt, taskId], async (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating finishedAt:', updateErr);
                            return;
                        }

                        const duration = calculateTimeDifference(new Date(createdAt), finishedAt);

                        const commentText = `Sent by bot: ✅ Задача выполнена!  
📅 Время начала: ${formatDate(createdAt)}  
⏳ Время завершения: ${formatDate(finishedAt)}  
⌛ Потрачено времени: ${duration}`;

                        console.log(commentText);
                        await addCommentToTask(taskId, commentText, false);
                    });
                } else {
                    console.log("createdAt missing for taskId:", taskId);
                }
            });

            await ctx.reply(userLang === 'uz'
                ? 'Muammo hal. Rahmat!'
                : 'Проблема решена. Спасибо!');

            await askForFeedback(ctx, userLang);
        }

        clearUserState(ctx.from.id);
    } catch (error) {
        const userLang = userLanguages[chatId];
        console.error('Error updating task status:', error.message);
        await ctx.reply(userLang === 'uz'
            ? 'Vazifa holatini yangilashda xatolik yuz berdi.'
            : 'Произошла ошибка при обновлении статуса задачи.');
    }
};

const formatDate = (date) => {
    return date.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
};

const calculateTimeDifference = (start, end) => {
    const diffMs = Math.abs(end - start); // Difference in milliseconds
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours} hours and ${minutes} minutes`;
};

const getLatestTaskId = async (chatId) => {
    return new Promise((resolve, reject) => {
        pool.execute(
            'SELECT taskId FROM tasks WHERE chatId = ? ORDER BY `createdAt` DESC LIMIT 1',
            [chatId],
            (err, results) => {
                if (err) {
                    console.error("Error querying database:", err);
                    reject(err);
                } else if (results.length === 0) {
                    console.log(`No task found for chatId ${chatId}`);
                    resolve(null);
                } else {
                    const taskId = results[0].taskId;
                    console.log(`Found latest taskId ${taskId} for chatId ${chatId}`);
                    resolve(taskId);
                }
            }
        );
    });
};


bot.command('create',async (ctx) => {
    const userId = ctx.from.id;
    const chat_id = ctx.chat.id;

    console.log(userSteps[userId]);
    bot.chatId = chat_id;
    console.log("Received message from chat_id:", chat_id);
    if (userSteps[userId] === 'task_created' || userSteps[userId] === 'waiting' || userSteps[userId] === 'problem_type') {
        await ctx.reply(
            `Sizda hozirda ochiq so\'rov mavjud. Iltimos, uni yakunlang yoki kuting.
                 
               
У вас уже есть открытая заявка. Пожалуйста, завершите её или дождитесь её обработки.`
        );
        return;
    }


    userSteps[ctx.from.id] = 'want_to_create';


    await ctx.reply(
        `Assalomu alaykum, ${ctx.from.first_name || 'hurmatli foydalanuvchi'}! Veda Vector jamosining 24/7 qo‘llab-quvvatlash xizmatiga xush kelibsiz! 
        
        
Здравствуйте, ${ctx.from.first_name || 'уважаемый пользователь'}! Добро пожаловать в круглосуточную поддержку команды Veda Vector!
`
    );


    await ctx.reply(
        `Siz yangi so'rov yaratmoqchimisiz? Iltimos, "Ha" yoki "Yo'q" deb javob bering.
        \n
Вы хотите создать новый запрос? Пожалуйста, ответьте “Да” или “Нет”.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Ha (Да)', callback_data: 'create_request_yes' }],
                    [{ text: 'Yo\'q (Нет)', callback_data: 'create_request_no' }],
                ],
            },
        }
    );
});

bot.command('stop', async (ctx) => {
    const userId = ctx.from.id;
    const userLang = userLanguages[userId] || 'uz';

    if (userSteps[userId] === 'task_created') {await ctx.reply(
            userLang === 'uz'
                ? 'Sizning arizangiz allaqachon yaratilgan. Uni bekor qilish uchun /finish buyrug‘idan foydalaning.'
                : 'Ваша заявка уже создана. Чтобы отменить её, используйте команду /finish.'
        );
        return;
    }

    if (
        userSteps[userId] === 'problem_type' ||
        userSteps[userId] === 'waiting'
    ) {
        clearUserState(userId);

        await ctx.reply(
            userLang === 'uz'
                ? 'Sizning arizangiz bekor qilindi. Yangi yaratish uchun /create ni bosing.'
                : 'Ваша заявка была отменена. Чтобы создать новое нажмите на /create.'
        );

        userSteps[userId] = 'canceled';
    } else {
        await ctx.reply(
            userLang === 'uz'
                ? 'Kechirasiz, hozirgi holatda arizani bekor qilib bo‘lmaydi.'
                : 'Извините, в текущем состоянии заявку невозможно отменить.'
        );
    }
});

bot.command('finish', async (ctx) => {
    const userId = ctx.from.id;
    const userLang = userLanguages[userId] || 'uz';

    if (userSteps[userId] === 'task_created') {
        await ctx.reply(
            userLang === 'uz'
                ? 'Sizning arizangizni bekor qilishni istaysizmi?'
                : 'Вы уверены, что хотите закрыть заявку?',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: userLang === 'uz' ? 'Ha' : 'Да', callback_data: 'finish_yes' },
                            { text: userLang === 'uz' ? 'Yo‘q' : 'Нет', callback_data: 'finish_no' },
                        ],
                    ],
                },
            }
        );
    } else {
        await ctx.reply(
            userLang === 'uz'
                ? 'Hozirgi vaqtda yakunlanadigan ariza mavjud emas.'
                : 'На данный момент нет активной заявки для завершения.'
        );
    }
});


bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const currentStep = userSteps[userId];
    const userLang = userLanguages[userId] || 'uz';

    if (data.startsWith('problem_')) {
        userSelectedProblems[userId] = data.replace('problem_', '');
        userSteps[userId] = 'problem_type';

        await ctx.answerCbQuery();
        await ctx.reply(
            `Muammo yaratildi tasvirlab bering iltimos:
            
Заявка успешно создано, пожалуйста опишите:`
        );
        await processTaskCreation(ctx)
        return;
    }

    if (data.startsWith('feedback_')) {
        const rating = parseInt(data.split('_')[1], 10);
        userFeedbacks[userId] = { rating };
        console.log(userFeedbacks[userId]);

        await ctx.answerCbQuery();
        await ctx.reply(`Rahmat! Siz ${rating} ball bilan baholadingiz. Iltimos, xizmatimiz haqidagi fikrlaringizni yozing:
        
Спасибо! Вы оценили нас на ${rating} баллов. Пожалуйста, напишите свой отзыв о нашем сервисе:`);

        userSteps[userId] = 'feedback_text';
        return;
    }

    if (data === 'create_request_yes') {
        userSteps[userId] = 'problem_type';

        await ctx.answerCbQuery();
        await askForProblemType(ctx, userLang);
    }

    else if (data === 'create_request_no') {
        clearUserState(userId);

        await ctx.answerCbQuery();
        await ctx.reply(
            `Sizning arizangiz bekor qilindi. Yangi yaratish uchun /create ni bosing.
            \n
Процесс создания запроса отменен. Чтобы создать новое нажмите на /create.
`
        );
    }

    if (data.startsWith('task_completed_')) {
        const chatId = ctx.chat.id;
        if (data === 'task_completed_yes') {
            await updateTaskStatus('complete', chatId, ctx);
            console.log('clicked yes')
            await ctx.answerCbQuery();

        } else if (data === 'task_completed_no') {
            await updateTaskStatus('in progress', chatId, ctx);
            console.log('clicked no')
            await ctx.answerCbQuery();


            clearUserState(userId);
            return;
        }

    }
    if (data === 'finish_yes') {
        await clearUserState(userId);
        await ctx.answerCbQuery();
        await deleteTask(ctx);

        await ctx.reply(
            userLang === 'uz'
                ? 'Arizangiz muvaffaqiyatli yakunlandi.'
                : 'Ваша заявка успешно завершена.'
        );

        userSteps[userId] = 'deleted'
    } else if (data === 'finish_no') {
        await ctx.answerCbQuery();

        await ctx.reply(
            userLang === 'uz'
                ? 'Arizangiz o‘z holicha qoldirildi.'
                : 'Ваша заявка осталась без изменений.'
        );
    }

    console.log(`Unhandled callback query: ${data}`);
});

bot.on(message('text'), async (ctx) => {
    console.log("Group message received:", ctx.message.text);
    const userId = ctx.from.id;
    const currentStep = userSteps[userId];
    console.log(userSteps[userId]);
    const chatId = ctx.chat.id;
    await handleGroupMessages(ctx);

    if (currentStep === 'feedback_text') {
        const feedbackText = ctx.message.text;
        const rating = userFeedbacks[ctx.from.id]?.rating;
        console.log(`Feedback rating: ${rating}`);

        if (!rating) {
            await ctx.reply(
                `Baho topilmadi. Iltimos, fikr qoldirishdan oldin xizmatni baholang.
                
Оценка не найдена. Пожалуйста, поставьте оценку сервису перед тем, как оставить отзыв.                 
                `
            );
            return;
        }

        await saveFeedbackToClickUp(chatId, feedbackText, rating);
        await ctx.reply(`Fikr-mulohazangiz qabul qilindi. Rahmat!
        
Ваш отзыв принят. Спасибо!`
        );
        clearUserState(ctx.from.id);
    }
});

bot.on('photo', async (ctx) => {
    console.log("Received a photo in group chat:", ctx.message.photo);

    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    console.log("Photo File ID:", fileId);

    try {
        const file = await bot.telegram.getFile(fileId);
        const filePath = file.file_path;

        const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        console.log("Photo URL from Telegram:", photoUrl);

        const chatId = ctx.chat.id;
        console.log("Chat ID:", chatId);

        const taskId = await getLatestTaskId(chatId);
        if (!taskId) {
            console.log("No task found for chatId:", chatId);
            return;
        }
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();


        await uploadPhotoToClickUp(taskId, photoUrl, fullName);

    } catch (error) {
        console.error("Error processing photo:", error);
        ctx.reply("There was an error sending your photo to ClickUp.");
    }
});

bot.on('voice', async (ctx) => {
    console.log("Received a voice message in group chat:", ctx.message.voice);

    const fileId = ctx.message.voice.file_id;
    console.log("Voice File ID:", fileId);

    try {
        const file = await bot.telegram.getFile(fileId);
        const filePath = file.file_path;

        const voiceUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        console.log("Voice URL from Telegram:", voiceUrl);

        const chatId = ctx.chat.id;
        console.log("Chat ID:", chatId);

        const taskId = await getLatestTaskId(chatId);
        if (!taskId) {
            console.log("No task found for chatId:", chatId);
            return;
        }
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();


        await uploadVoiceToClickUp(taskId, voiceUrl, fullName);

    } catch (error) {
        console.error("Error processing voice message:", error);
        ctx.reply("There was an error sending your voice message to ClickUp.");
    }
});

bot.on('video', async (ctx) => {
    console.log("Received a video message in group chat:", ctx.message.video);

    const fileId = ctx.message.video.file_id;
    console.log("Video File ID:", fileId);

    try {
        const file = await bot.telegram.getFile(fileId);
        const filePath = file.file_path;

        const videoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        console.log("Video URL from Telegram:", videoUrl);

        const chatId = ctx.chat.id;
        console.log("Chat ID:", chatId);

        const taskId = await getLatestTaskId(chatId);
        if (!taskId) {
            console.log("No task found for chatId:", chatId);
            return;
        }
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();

        await uploadVideoToClickUp(taskId, videoUrl, fullName);
    } catch (error) {
        console.error("Error processing video message:", error);
        ctx.reply("There was an error sending your video message to ClickUp.");
    }
});

bot.on('video_note', async (ctx) => {
    console.log("Received a video message in group chat:", ctx.message.video);

    const fileId = ctx.message.video_note.file_id;
    console.log("Video File ID:", fileId);

    try {
        const file = await bot.telegram.getFile(fileId);
        const filePath = file.file_path;

        const videoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        console.log("Video URL from Telegram:", videoUrl);

        const chatId = ctx.chat.id;
        console.log("Chat ID:", chatId);

        const taskId = await getLatestTaskId(chatId);
        if (!taskId) {
            console.log("No task found for chatId:", chatId);
            return;
        }
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();


        await uploadVideoToClickUp(taskId, videoUrl, fullName);
    } catch (error) {
        console.error("Error processing video message:", error);
        ctx.reply("There was an error sending your video message to ClickUp.");
    }
});

bot.on('document', async (ctx) => {
    console.log("Received a document in group chat:", ctx.message.document);

    const fileId = ctx.message.document.file_id;
    console.log("Document File ID:", fileId);

    try {
        const file = await bot.telegram.getFile(fileId);
        const filePath = file.file_path;

        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        console.log("Document URL from Telegram:", fileUrl);

        const chatId = ctx.chat.id;
        console.log("Chat ID:", chatId);

        console.log(`everthing is okay ${fileUrl}`)

        const taskId = await getLatestTaskId(chatId);
        if (!taskId) {
            console.log("No task found for chatId:", chatId);
            return;
        }
        const firstName = ctx.from.first_name || '';
        const lastName = ctx.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();

        const fileName = ctx.message.document.file_name;
        const fileExtension = fileName.split('.').pop().toLowerCase();


        if (['txt', 'xlsx', 'pdf'].includes(fileExtension)) {
            await uploadFileToClickUp(taskId, fileUrl, fullName, fileName);
        } else {
            console.log("Unsupported file type:", fileExtension);
            ctx.reply("Этот тип файла не поддерживается.");
        }

    } catch (error) {
        console.error("Error processing document:", error);
        ctx.reply("There was an error sending your document to ClickUp.");
    }
});

bot.launch().then(() => {
    console.log('Bot started successfully.');
});

module.exports = {
    bot,
    getChatIdByTaskId,
    processTaskCreation,
    sendToClickUp,
    askForCompletionConfirmation,
};

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));