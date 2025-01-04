const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const BOT_TOKEN = '7712404901:AAFmA0FeK_NSxRw3O6SWRHUlAuSfgJ5NsLk';
const CLICKUP_API_KEY = 'pk_158692681_BDRAASUB1DTHX9I061Y9CT0HY4ITML27';
const CLICKUP_LIST_ID = '901804634528';

// Xafizs' list id 901804725083
// Veda Vectore list id 901804634528
const bot = new Telegraf(BOT_TOKEN);

const userLanguages = {};
const userRestaurants = {};
const userDescription = {};
const userContacts = {};
const userSelectedProblems = {};
const userPhotoUrls = {}
const userSteps = {};
const userTaskIds = {};

bot.telegram.setMyCommands([
    { command: 'start', description: 'Создание заявки' },
    // { command: 'stop', description: 'Отмена заявки' },
]);

const sendToClickUp = async ({ title, description, restaurant, clientRole, clientName, clientContact, ctx }) => {
    console.log(`client role${userContacts}  client name ${userContacts} client contact ${userContacts}`);
    const url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`;
    const data = {
        name: title,
        description: description,
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

        userTaskIds[ctx.from.id] = taskId;

        await addCommentToTask(taskId, `Restaurant: ${restaurant}`);
        await addCommentToTask(taskId, `Client Role: ${clientRole}`);
        await addCommentToTask(taskId, `Client Name: ${clientName}`);
        await addCommentToTask(taskId, `Client Contact: ${clientContact}`);

        assignUserToTask(taskId, '5725322');

        return response.data;
    } catch (error) {
        console.error('Error creating task in ClickUp:', error.response?.data || error.message);
        throw error;
    }
};

const addCommentToTask = async (taskId, commentText) => {
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

const monitorTaskStatus = (taskId, ctx) => {
    setInterval(() => {
        checkTaskStatus(taskId, ctx);
    }, 10000);  // Check every 10 seconds (or adjust as needed)
};

const updateTaskStatus = async (newStatus, ctx) => {
    const taskId = userTaskIds[ctx.from.id];  // Retrieve the taskId

    const url = `https://api.clickup.com/api/v2/task/${taskId}`;

    const data = {
        status: newStatus
    };
    console.log(data)

    // Log the API Key to ensure it's being set correctly (be cautious not to log in production)
    console.log(`Using API key: ${CLICKUP_API_KEY}`);
    console.log(`Updating task at URL: ${url}`);

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
        await ctx.reply(userLang === 'uz'
            ? `Muammo ${newStatus} holatiga o'zgartirildi.`
            : `Проблема обновлена на статус "${newStatus}".`);

        clearUserState(ctx.from.id);
    } catch (error) {
        const userLang = userLanguages[ctx.from.id];
        console.error('Error updating task status:', error.message);
        await ctx.reply(userLang === 'uz'
            ? 'Vazifa holatini yangilashda xatolik yuz berdi.'
            : 'Произошла ошибка при обновлении статуса задачи.');
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

        return response.data;
    } catch (error) {
        console.error('Error uploading photos to ClickUp:', error.response?.data || error.message);
        throw error;
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

const askForRestaurant = async (ctx, userLang) => {
    await ctx.reply(
        userLang === 'uz'
            ? 'Iltimos, restoran nomini yozib yuboring:'
            : 'Пожалуйста, напишите название ресторана:'
    );
};

const askForProblemDescription = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, kelib chiqqan muammoni batafsil tasvirlab bering:'
        : 'Пожалуйста, подробно опишите проблему с которой вы столкнулись:';
    await ctx.reply(prompt);
};

const askForProblemType = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, kelib chiqqan muammoni ruknini tanlang:'  // Uzbek version
        : 'Пожалуйста, выберите категорию проблемы с которой вы столкнулись:'; // Russian version

    // Send a message with an inline keyboard to choose problem type
    await ctx.reply(prompt, {
        reply_markup: {
            inline_keyboard: [
                [{ text: userLang === 'uz' ? 'Buyurtma bilan bog`liq xatolik' : 'Ошибка связанная с  заказом', callback_data: 'problem_Ошибка в заказе' }],
                [{ text: userLang === 'uz' ? 'QR kodli chek bilan bog`liq muammo' : 'Проблема с печатью кода с QR кодом', callback_data: 'problem_Ошибка в QR коде' }],
                [{ text: userLang === 'uz' ? 'Maxsulot MXIKi bilan bog`liq muammo' : 'Проблема с ИКПУ товаров', callback_data: 'problem_Ошибка в ИКПУ' }],
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

const askForClientRole = async (ctx, userLang) => {
    console.log("ask for client role");
    const prompt = userLang === 'uz'
        ? 'Lavozimingizni tanlang'
        : 'Укажите вашу должность';


    await ctx.reply(prompt, {
        reply_markup: {
            inline_keyboard: [
                [{ text: userLang === 'uz' ? 'Menejer' : 'Менеджер', callback_data: 'client_role_manager' }],
                [{ text: userLang === 'uz' ? 'Yordamchi' : 'Помощник', callback_data: 'client_role_assistant' }],
                [{ text: userLang === 'uz' ? 'Egasining o\'zi' : 'Владелец', callback_data: 'client_role_owner' }],
                [{ text: userLang === 'uz' ? 'Boshqa' : 'Другое', callback_data: 'client_role_other' }],
            ],
        },
    });
};

const handleRestaurantSelection = async (ctx, userInput) => {
    const userLang = userLanguages[ctx.from.id];
    const selectedRestaurant = userInput.trim();

    userRestaurants[ctx.from.id] = selectedRestaurant;

    // Log and notify the user about the selected restaurant
    console.log(`User ${ctx.from.id} selected restaurant: ${selectedRestaurant}`);
    await ctx.reply(
        userLang === 'uz'
            ? `Siz ${selectedRestaurant} muassasi nomidan so'rov yaratypasiz!`
            : `Вы создаете запрос от имени: ${selectedRestaurant}!`
    );

    // Proceed to the next step: ask for problem description
    await askForProblemDescription(ctx, userLang);
};

const handleDescriptionInput = async (ctx, inputText) => {
    const userLang = userLanguages[ctx.from.id];

    userDescription[ctx.from.id] = inputText.trim();
    console.log(`User ${ctx.from.id} provided description: ${inputText}`);
    userSteps[ctx.from.id] = 'client_role';  // Переходим к выбору роли клиента
    console.log("client_role choosing")

    await askForImageUpload(ctx, userLang);
};

const processTaskCreation = async (ctx) => {
    console.log(`this is descriptionnnnnnnnnnnn ${userDescription[ctx.from.id]}`)
    try {
        const userLang = userLanguages[ctx.from.id] || 'uz';

        // Get user details to send to ClickUp
        const title = userSelectedProblems[ctx.from.id] || 'Problem';
        const description = userDescription[ctx.from.id];
        const restaurant = userRestaurants[ctx.from.id];
        const clientRole = userContacts[ctx.from.id]?.firstName || 'Client';
        const clientName = userContacts[ctx.from.id]?.firstName || 'Client Name';
        const clientContact = userContacts[ctx.from.id]?.phoneNumber || 'Client Contact';

        // Create task by calling the function to send it to ClickUp
        const task = await sendToClickUp({
            title,
            description,
            restaurant,
            clientRole,
            clientName,
            clientContact,
            ctx
        });

        // Store the task ID in case you need to reference it later
        userTaskIds[ctx.from.id] = task.id;
        userSteps[ctx.from.id] = 'task_created';

        // Optional: Monitor task status or do something with the task
        monitorTaskStatus(task.id, ctx);

        // Inform the user the task has been created successfully
        // await ctx.reply(
        //     userLang === 'uz'
        //         ? 'Muammo va rasm muvaffaqiyatli yuborildi!'
        //         : 'Проблема и изображение успешно отправлены!'
        // );

        // Clear user state after task is created
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

const clearUserState = (userId) => {
    delete userLanguages[userId];
    delete userRestaurants[userId];
    delete userDescription[userId];
    delete userContacts[userId];
    delete userSelectedProblems[userId];
    delete userPhotoUrls[userId];
};


bot.start((ctx) => {
    userSteps[ctx.from.id] = 'language';  // Задаём начальный шаг
    console.log("lang")
    ctx.reply(
        `Assalomu alaykum, ${ctx.from.first_name || 'there'}! Veda Vector jamosining 24/7 qollab quvvatlash xizmatiga xush kelibsiz! Iltimos sizga qulay tilni tanlang:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Uzbek tili', callback_data: 'lang_uz' }],
                    [{ text: 'Русский', callback_data: 'lang_ru' }],
                ],
            },
        }
    );
});

bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    userSteps[ctx.from.id] = 'contact';
    console.log("contacts")
    userContacts[ctx.from.id] = {
        phoneNumber: contact.phone_number,
        firstName: contact.first_name,
        lastName: contact.last_name || '',
    };
    console.log('User Contact:', userContacts[ctx.from.id]);

    const userLang = userLanguages[ctx.from.id];
    if (userLang) {
        await askForProblemType(ctx, userLang); // Ask for problem type after contact info
    } else {
        await ctx.reply('Iltimos, tilni tanlang (Please select a language):');
    }
});

bot.on('photo', async (ctx) => {
    try {
        const userLang = userLanguages[ctx.from.id] || 'uz';

        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileId = photo.file_id;

        const fileDetails = await ctx.telegram.getFile(fileId);
        const filePath = fileDetails.file_path;

        userPhotoUrls[ctx.from.id] = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        await askForClientRole(ctx, userLang);

    } catch (error) {
        const userLang = userLanguages[ctx.from.id] || 'uz';
        console.error('Error processing photo:', error.message);
        await ctx.reply(
            userLang === 'uz'
                ? 'Rasmni qayta yuboring, xatolik yuz berdi.'
                : 'Отправьте изображение снова, произошла ошибка.'
        );
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const userLang = userLanguages[userId] || 'uz';
    const currentStep = userSteps[userId];
    console.log(data)

    if (data.startsWith('problem_solved_')) {
        if (data === 'problem_solved_yes') {
            await updateTaskStatus('complete', ctx);
            await ctx.answerCbQuery();

            await ctx.reply(
                userLang === 'uz'
                    ? 'Muammo hal. Rahmat!'
                    : 'Проблема решена. Спасибо!'
            );
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

    if (data.startsWith('problem_')) {
        userSelectedProblems[userId] = data.replace('problem_', '');
        userSteps[userId] = 'problem_type';

        await ctx.answerCbQuery();
        await ctx.reply(
            userLang === 'uz'
                ? 'Muammo rukni tanlandi. Iltimos, muassasa nomini kiriting:'
                : 'Категория проблемы выбрана. Пожалуйста, напишите название заведения:'
        );
        return;

    }

    if (data === 'lang_uz' || data === 'lang_ru') {
        const lang = data.split('_')[1];
        userLanguages[userId] = lang;

        await ctx.answerCbQuery();
        await ctx.reply(
            lang === 'uz'
                ? 'Til uzbek tiliga o\'zgardi! Iltimos, kontakt ma\'lumotlaringizni ulashing:'
                : 'Язык установлен на русский! Пожалуйста, поделитесь своими контактными данными:',
            {
                reply_markup: {
                    keyboard: [[{ text: lang === 'uz' ? 'Kontakt ulashish' : 'Поделиться контактом', request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            }
        );
        return;
    }

    if (currentStep === 'client_role') {
        if (data.startsWith('client_role_')) {
            const clientRole = data.replace('client_role_', '');

            userContacts[userId].role = clientRole;
            console.log(`User ${userId} selected client role: ${clientRole}`);

            await ctx.answerCbQuery();
            await processTaskCreation(ctx);
            await ctx.reply(
                userLang === 'uz'
                    ? `Siz ${clientRole} rolini tanladingiz. So'rov muvaffaqiyatli yaratildi.`
                    : `Вы выбрали роль ${clientRole}. Задача успешно создана.`
            );

            await ctx.reply(
                userLang === 'uz'
                    ? `Eng qisqa vaqtda xodimlarimiz aloqaga chiqishadi.`
                    : `В самое ближайшее время наши сотрудники выйдут на связь.`
            );
            console.log(`User ${userId} step changed to 'image'.`);

            // await askForImageUpload(ctx, userLang);
        } else {
            console.log(`Unexpected callback query data: ${data}`);
        }

        clearUserState(userId);
        return;
    }

    if (data === 'cancel_task_creation') {
        clearUserState(userId);
        await ctx.answerCbQuery();

        const userLang = userLanguages[userId] || 'uz';
        await ctx.reply(
            userLang === 'uz'
                ? 'So`rov yaratish jarayoni bekor qilindi.'
                : 'Процесс создания запроса отменен.'
        );
        return;
    }
    console.log(`Unhandled callback query: ${data}`);
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === 'lang_uz' || data === 'lang_ru') {
        const lang = data.split('_')[1];
        userLanguages[ctx.from.id] = lang;

        // Убираем инлайн-клавиатуру
        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch (error) {
            console.error('Ошибка при удалении кнопок:', error.message);
        }

        // Отвечаем на callback
        await ctx.answerCbQuery();

        // Отправляем новое сообщение с обычной клавиатурой
        await ctx.reply(
            lang === 'uz'
                ? 'Til uzbek tiliga o\'zgardi! Iltimos, kontakt ma\'lumotlaringizni ulashing:'
                : 'Язык установлен на русский! Пожалуйста, поделитесь своими контактными данными:',
            {
                reply_markup: {
                    keyboard: [
                        [{ text: lang === 'uz' ? 'Kontakt ulashish' : 'Поделиться контактом', request_contact: true }],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            }
        );
    }
});

bot.on('text', async (ctx) => {
    const currentStep = userSteps[ctx.from.id];
    console.log(`Current step: ${currentStep}`);
    if (currentStep === 'problem_type') {
        await handleRestaurantSelection(ctx, ctx.message.text);
        userSteps[ctx.from.id] = 'description';
    } else if (currentStep === 'description') {
        await handleDescriptionInput(ctx, ctx.message.text);
        userSteps[ctx.from.id] = 'client_role';
    } else if (currentStep === 'client_role') {
        console.log("hello client role")
    }
});

bot.launch()
    .then(() => console.log('Bot is running...'))
    .catch((err) => console.error('Failed to start bot:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
