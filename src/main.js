const axios = require('axios');
const FormData = require('form-data');
const Task = require('./models/Task');  // Import the simplified Task model
const { Telegraf } = require('telegraf');
const {message} = require("telegraf/filters");
const mysql = require('mysql2');
const fetch = require('node-fetch'); // Assuming you're using node-fetch for HTTP requests
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

const roles = {
    'client_role_manager': {
        uz: 'Menejer',
        ru: 'Менеджер'
    },
    'client_role_assistant': {
        uz: 'Yordamchi',
        ru: 'Помощник'
    },
    'client_role_owner': {
        uz: 'Egasining o\'zi',
        ru: 'Владелец'
    },
    'client_role_other': {
        uz: 'Boshqa',
        ru: 'Другое'
    }
};

bot.telegram.setMyCommands([
    { command: 'create', description: 'Создание заявки' },
    { command: 'stop', description: 'Отмена заявки' },
]);

const sendToClickUp = async ({ title, description, selectedProblem, ctx, chatId, chatDescription }) => {
    let listId;

    if (selectedProblem === 'financial') {
        listId = process.env.TECH_LIST_ID;
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
    }

    const url = `https://api.clickup.com/api/v2/list/${listId}/task`;

    const data = {
        name: title,
        description: description || 'No description provided',
    };

    const headers = {
        'Authorization': process.env.CLICKUP_API_KEY,
        'Content-Type': 'application/json',
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
        });

        const responseData = await response.json();

        if (response.ok) {
            console.log('Task created successfully:', responseData);

            // Save task ID and chat ID to MySQL
            const taskId = responseData.id;  // Task ID from ClickUp response

            const query = 'INSERT INTO tasks (taskId, chatId) VALUES (?, ?)';
            pool.execute(query, [taskId, chatId], (err, results) => {
                if (err) {
                    console.error('Error saving task to MySQL:', err);
                    throw new Error('Error saving task to MySQL');
                }

                console.log('Task saved to MySQL:', results);
            });

            // Return the task data, including the ID
            return { taskId, chatId };
        } else {
            console.error('Error creating task:', responseData);
            throw new Error('Error creating task in ClickUp');
        }
    } catch (error) {
        console.error('Error making request to ClickUp API:', error);
        throw new Error('Error processing request');
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

const askForFeedback = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Muammo hal etildi. Iltimos, xizmatimizni baholang (1 dan 5 gacha):'
        : 'Проблема решена. Пожалуйста, оцените наш сервис от 1 до 5:';

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

const addCommentToTask = async (taskId, commentText) => {
    console.log(commentText)
    const url = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
    const data = {
        comment_text: commentText,  // The content of the comment
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

const updateTaskStatus = async (newStatus, ctx) => {
    const taskId = userTaskIds[ctx.from.id];  // Retrieve the taskId

    const url = `https://api.clickup.com/api/v2/task/${taskId}`;

    const data = {
        status: newStatus
    };
    console.log(data)

    try {
        const response = await axios.put(url, data, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        console.log(response);

        const userLang = userLanguages[ctx.from.id];

        console.log(`Task ${taskId} status updated to "${newStatus}"`);

        if (newStatus === 'complete') {
            await ctx.reply(
                userLang === 'uz'
                    ? 'Muammo hal. Rahmat!'
                    : 'Проблема решена. Спасибо!'
            );

            await askForFeedback(ctx, userLang);
        }

        clearUserState(ctx.from.id);
    } catch (error) {
        const userLang = userLanguages[ctx.from.id];
        console.error('Error updating task status:', error.message);
        await ctx.reply(userLang === 'uz'
            ? 'Vazifa holatini yangilashda xatolik yuz berdi.'
            : 'Произошла ошибка при обновлении статуса задачи.');
    }
};

const assignUserToTask = async (taskId, assigneeId) => {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const data = {
        assignees: { add: [assigneeId] },
        priority: 1,
    };

    try {
        const response = await axios.put(url, data, {
            headers: {
                Authorization: process.env.CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        console.log(`User with ID ${assigneeId} assigned to task ${taskId}`);
        return response.data;
    } catch (error) {
        console.error(`Error assigning user to task ${taskId}:`, error.response?.data || error.message);
        throw error;
    }
};

const askForProblemType = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, kelib chiqqan muammoni ruknini tanlang:'  // Uzbek version
        : 'Пожалуйста, выберите категорию проблемы с которой вы столкнулись:'; // Russian version

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

const askForImageUpload = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, muammoni tasvirlaydigan rasmni yuboring:'
        : 'Пожалуйста, отправьте изображение (скриншот), в котором можно увидеть ошибку:';
    await ctx.reply(prompt);
};

const sendWaitingMessage = async (ctx, userLang) => {
    const waitingText = userLang === 'uz'
        ? 'Iltimos, kuting... So\'rov yaratilmoqda.'
        : 'Пожалуйста, подождите... Запрос создается.';

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

        const chat = await ctx.telegram.getChat(ctx.chat.id); // Get chat details
        const chatDescription = chat.description || 'Нету описании группы';

        const task = await sendToClickUp({
            title,
            description: chatDescription,
            ctx,
            chatId: ctx.chat.id,
            selectedProblem: userSelectedProblems[ctx.from.id],
            chatDescription: chatDescription,
        });

        await ctx.reply("Endi iltimos ma'lumot bering(rasm, text, video message, voice)")

        // If a photo URL exists, upload the photo to ClickUp
        if (userPhotoUrls[ctx.from.id]) {
            await uploadPhotoToClickUp(task.id, [userPhotoUrls[ctx.from.id]]);
        }

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

const uploadPhotoToClickUp = async (taskId, photoUrls) => {
    console.log(photoUrls);
    const url = `https://api.clickup.com/api/v2/task/${taskId}/attachment`;
    const formData = new FormData();
    for (const photoUrl of photoUrls) {
        if (!photoUrl) {
            console.error('Invalid photo URL:', photoUrl);
            continue;  // Skip if URL is invalid
        }
        console.log(`Downloading photo from URL: ${photoUrl}`);
        // Use axios to download the image from the URL
        try {
            const response = await axios.get(photoUrl, { responseType: 'stream' });
            // Create a filename for the attachment (you can extract it from the URL or generate it)
            const fileName = path.basename(photoUrl);
            // Append the downloaded image to FormData
            formData.append('attachment', response.data, fileName);
        } catch (err) {
            console.error(`Error downloading image from URL ${photoUrl}:`, err.message);
        }
    }
    try {
        // Now post the formData to ClickUp to upload the image
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: process.env.CLICKUP_API_KEY,
            },
        });
        console.log('Photos uploaded successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error uploading photos to ClickUp:', error.response?.data || error.message);
        throw error;
    }
};

const saveFeedbackToClickUp = async (userId, feedbackText, rating) => {
    const taskId = userTaskIds[userId];  // Получаем ID задачи пользователя

    console.log(`monovi ishlayabdi ${feedbackText} ${rating} monoviyam`);
    const ratingComment = `User feedback: ${rating} stars`;
    await addCommentToTask(taskId, ratingComment); // Добавляем комментарий с рейтингом

    const feedbackComment = `User feedback (text): ${feedbackText}`;
    await addCommentToTask(taskId, feedbackComment); // Добавляем текст отзыва как комментарий
};

const handleGroupMessages = async (ctx) => {
    const userId = ctx.from.id;
    console.log(userId);
    console.log("faak ishladi");
};

const getChatIdByTaskId = (taskId) => {
    const task = tasks.find(t => t.taskId === taskId);
    return task ? task.chatId : null;
};

bot.command('create',async (ctx) => {
    const userId = ctx.from.id;
    const chat_id = ctx.chat.id;
    bot.chatId = chat_id;
    console.log("Received message from chat_id:", chat_id);
    if (userSteps[userId] === 'task_created' || userSteps[userId] === 'waiting' || userSteps[userId] === 'problem_type') {
        await ctx.reply(
            `Sizda hozirda ochiq so\'rov mavjud. Iltimos, uni yakunlang yoki kuting.
                 
               
У вас уже есть открытая заявка. Пожалуйста, завершите её или подождите.`
        );
        return;
    }


    userSteps[ctx.from.id] = 'want_to_create';


    await ctx.reply(
        `Assalomu alaykum, ${ctx.from.first_name || 'hurmatli foydalanuvchi'}! Veda Vector jamosining 24/7 qo‘llab-quvvatlash xizmatiga xush kelibsiz! 
        
        
Здравствуйте, ${ctx.from.first_name || 'уважаемый пользователь'}! Добро пожаловать в круглосуточную поддержку команды Veda Vector!`
    );


    await ctx.reply(
        `Siz yangi so'rov yaratmoqchimisiz? Iltimos, "Ha" yoki "Yo'q" deb javob bering.
        \n
Вы хотите создать новый запрос? Пожалуйста, ответьте "Да" или "Нет".`,
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

bot.command('stop',async (ctx) => {
    const userId = ctx.from.id;
    const userLang = userLanguages[userId] || 'uz';

    clearUserState(userId);

    if (userSteps[userId] !== 'task_created') {
        await ctx.reply(
            userLang === 'uz'
                ? 'Hozirgi vaqtda hech qanday ariza mavjud emas.'
                : 'В данный момент нет активных заявок.'
        );
        return;
    }

    await ctx.reply(
        userLang === 'uz'
            ? 'Sizning arizangiz bekor qilindi. Yangi yaratish uchun /create ni bosing.'
            : 'Ваша заявка была отменена. Чтобы создать новое нажмите на /create .'
    );
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
        \n
Заявка успешно создано, пожалуйста опишите:`
        );
        await processTaskCreation(ctx)
        return;
    }

    if (data.startsWith('feedback_')) {
        userFeedbacks[userId] = { rating };
        console.log(userFeedbacks[userId]);
        const rating = parseInt(data.split('_')[1], 10);

        await ctx.answerCbQuery();
        await ctx.reply(
            userLang === 'uz'
                ? `Rahmat! Siz ${rating} ball bilan baholadingiz. Iltimos, xizmatimiz haqidagi fikrlaringizni yozing:`
                : `Спасибо! Вы оценили нас на ${rating} баллов. Пожалуйста, напишите свой отзыв о нашем сервисе:`
        );

        userSteps[userId] = 'feedback_text';
        return;
    }

    if (currentStep === 'client_role') {
        if (data.startsWith('client_role_')) {
            const clientRole = data;
            const roleName = roles[clientRole][userLang];

            userContacts[userId].role = clientRole;
            console.log(`User ${userId} selected client role: ${roleName}`);
            userContacts[userId].role = roles[clientRole]?.[userLang] || 'Unknown role';

            await ctx.answerCbQuery(); // Подтверждаем клик
            await processTaskCreation(ctx); // Продолжаем процесс создания заявки

            await ctx.reply(
                userLang === 'uz'
                    ? `Siz ${roleName} rolini tanladingiz. So'rov muvaffaqiyatli yaratildi.`
                    : `Вы выбрали роль ${roleName}. Задача успешно создана.`
            );

            await ctx.reply(
                userLang === 'uz'
                    ? `Eng qisqa vaqtda xodimlarimiz aloqaga chiqishadi.`
                    : `В самое ближайшее время наши сотрудники выйдут на связь.`
            );
            console.log(`User ${userId} step changed to 'image'.`);

        } else {
            console.log(`Unexpected callback query data: ${data}`);
        }
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
Процесс создания запроса отменен. Чтобы создать новое нажмите на /create.`
        );
    }

    if (data.startsWith('problem_solved_')) {
        if (data === 'problem_solved_yes') {
            await updateTaskStatus('complete', ctx);
            await ctx.answerCbQuery();

        } else if (data === 'problem_solved_no') {
            await updateTaskStatus('in progress', ctx);
            await ctx.answerCbQuery();

            // Notify the user
            await ctx.reply(
                userLang === 'uz'
                    ? 'Muammo hali hal qilinmagan. Iltimos, yana bir bor tekshirib ko\'ring.'
                    : 'Проблема еще не решена. Пожалуйста, проверьте еще раз.'
            );
        }

        // Clear the user state (optional, based on your flow)
        clearUserState(userId);
        return;
    }

    console.log(`Unhandled callback query: ${data}`);
});

bot.on(message('text'), async (ctx) => {
    console.log("Message received");
    console.log("Chat Type:", ctx.chat.type);
    console.log("Message:", ctx.message);

        console.log("Group message received:", ctx.message.text);

        await handleGroupMessages(ctx);
});

bot.launch().then(() => {
    console.log('Bot started successfully.');
});

module.exports = {
    bot,
    getChatIdByTaskId,
    processTaskCreation,
    sendToClickUp
};

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));