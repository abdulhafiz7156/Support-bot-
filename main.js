const axios = require('axios');
const FormData = require('form-data');
const { Telegraf } = require('telegraf');
const {message} = require("telegraf/filters");
const path = require('path');

const CLICKUP_LIST_ID = '901804634528';
const BOT_TOKEN = '7712404901:AAFmA0FeK_NSxRw3O6SWRHUlAuSfgJ5NsLk';
const CLICKUP_API_KEY = 'pk_158692681_BDRAASUB1DTHX9I061Y9CT0HY4ITML27';

// Xafiz list id 901804725083
// Veda Vectore list id 901804634528
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

const sendToClickUp = async ({ title, description, ctx }) => {
    console.log(`Creating task for problem type: ${title}`);
    const url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`;
    const data = {
        name: title,  // Title comes from the problem type selected
        description: description || 'No description provided', // Default to a simple message if no description is given
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        console.log('Task created successfully:', response.data.id);

        const taskId = response.data.id;

        userTaskIds[ctx.from.id] = taskId; // Save task ID in user state

        // Assign task to a default user or team member (can be changed later)
        assignUserToTask(taskId, '5725322'); // For example, assign to user with ID '5725322'

        return response.data;
    } catch (error) {
        console.error('Error creating task in ClickUp:', error.response?.data || error.message);
        throw error;
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

const checkTaskStatus = async (taskId, ctx) => {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: CLICKUP_API_KEY,
            },
        });

        const taskStatus = response.data.status.status;
        const userLang = userLanguages[ctx.from.id];

        console.log(`Task ${taskId} status: ${taskStatus}`);

        // Initialize user data if not present
        if (!userLanguages[ctx.from.id]) {
            userLanguages[ctx.from.id] = {
                language: 'en', // Default language can be set to 'en' or the detected language
                isTaskStatusChanged: false, // Set initial value to false
            };
        }

        // Check if the status is "Confirmation", or 2 or 3
        if (taskStatus === "confirmation" || taskStatus === "2" || taskStatus === "3") {
            // Avoid prompting multiple times by checking if the status update was already handled
            if (!userLanguages[ctx.from.id].isTaskStatusChanged) {
                await ctx.reply(
                    userLang === 'uz'
                        ? 'Muammo hal bo\'ldimi? Iltimos, tanlang:'
                        : 'Проблема решена? Пожалуйста, выберите:',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: userLang === 'uz' ? 'Ha' : 'Да', callback_data: 'problem_solved_yes' }],
                                [{ text: userLang === 'uz' ? 'Yo\'q' : 'Нет', callback_data: 'problem_solved_no' }],
                            ],
                        },
                    }
                );

                // Set flag to prevent further asking for status
                userLanguages[ctx.from.id].isTaskStatusChanged = true;
            }
        }
    } catch (error) {
        console.error('Error checking task status:', error.message);
    }
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
                Authorization: CLICKUP_API_KEY,
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
                Authorization: CLICKUP_API_KEY,
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
                Authorization: CLICKUP_API_KEY,
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
                [{ text: userLang === 'uz' ? 'Технический вопрос (Texnik savol)' : '', callback_data: 'problem_technicla' }],
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

const monitorTaskStatus = (taskId, ctx) => {
    setInterval(() => {
        checkTaskStatus(taskId, ctx);
    }, 10000);  // Check every 10 seconds (or adjust as needed)
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
        });

        await ctx.reply("Endi iltimos ma'lumot bering(rasm, text, video message, voice)")

        // If a photo URL exists, upload the photo to ClickUp
        if (userPhotoUrls[ctx.from.id]) {
            await uploadPhotoToClickUp(task.id, [userPhotoUrls[ctx.from.id]]);
        }

        // Update user step after task creation
        userSteps[ctx.from.id] = 'task_created';

        // Optionally, monitor the task status if required
        monitorTaskStatus(task.id, ctx);

        // Clear user state after task creation (to reset)
        clearUserState(ctx.from.id);

    } catch (error) {
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
                Authorization: CLICKUP_API_KEY,
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
    try {
        const userId = ctx.from.id;
        console.log("fakk ishladi")
        // Check if the user's step is 'create_request_yes'
        if (userSteps[userId] === 'create_request_yes') {
            console.log("fakk ishladiiiii")
            const groupMessage = ctx.message.text || ctx.message.caption; // Handle both text and caption (for photos, etc.)

            if (groupMessage) {
                console.log(`Message from group: ${groupMessage}`);

                // You can store this message in the task description or take other actions
                const taskDescription = groupMessage;

                // Now you can create the task with this message as the description
                await sendToClickUp({
                    title: 'Group Request', // Customize title as needed
                    description: taskDescription,
                    ctx
                });

                // After processing, clear the user's step to avoid repeated triggering
                userSteps[userId] = null;

                await ctx.reply("Your request has been submitted successfully!");
            }
        }
    } catch (error) {
        console.error('Error processing group message:', error);
    }
};

const askForRestaurant = async (ctx, userLang) => {
    await ctx.reply(
        userLang === 'uz'
            ? 'Iltimos, restoran nomini yozib yuboring:'
            : 'Пожалуйста, напишите название ресторана:'
    );
};

bot.command('create',async (ctx) => {
    userSteps[ctx.from.id] = 'want_to_create';
    const userLang = userLanguages[ctx.from.id] || 'uz';

    console.log("want_to_create");

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
        await askForRestaurant(ctx, userLang)
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

bot.on('message', (ctx) => {
    console.log("ishladi")
    console.log(ctx)
    handleGroupMessages(ctx)
});


bot.launch().then(() => {
    console.log('Bot started successfully.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
