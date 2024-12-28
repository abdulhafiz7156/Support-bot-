const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');  // Import the path module
const fs = require('fs'); // To read the image file
const FormData = require('form-data'); // Import FormData

const BOT_TOKEN = '7712404901:AAFmA0FeK_NSxRw3O6SWRHUlAuSfgJ5NsLk'; // Replace with your actual bot token
const CLICKUP_API_KEY = 'pk_158692681_BDRAASUB1DTHX9I061Y9CT0HY4ITML27'; // Replace with your ClickUp API key
const CLICKUP_LIST_ID = '901804634528'; // Replace with your ClickUp list ID

const bot = new Telegraf(BOT_TOKEN);

const userLanguages = {};
const userRestaurants = {};
const userDescription = {};
const userContacts = {};
const userSelectedProblems = {}; // Store selected problems for users
const userPhotoUrls = {}

const sendToClickUp = async ({ title, description, restaurant, clientRole, clientName, clientContact }) => {
    const url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`;
    const data = {
        name: title,  // Now using title as the task name (previously was description)
        description: description,  // Now using description as the task description (previously was title)
        custom_fields: [
            { id: "b619ca30-a6ec-4fe6-ad17-06252e843228", value: restaurant },
            { id: "2320802e-4249-4f48-8c13-4db19b241f18", value: clientRole },
            { id: "2c203044-2753-405a-810c-3d912cd360fc", value: String(clientContact) },
            { id: "cbcfedc8-356a-4050-9256-bfd317780b1e", value: String(clientName) },
        ],
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        console.log('Task created successfully:', response.data.id);
        assignUserToTask(response.data.id, '5725322');

        return response.data;
    } catch (error) {
        console.error('Error creating task in ClickUp:', error.response?.data || error.message);
        throw error;
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
        ? 'Iltimos, muammoni batafsil tasvirlab bering:'
        : 'Пожалуйста, подробно опишите проблему:';
    await ctx.reply(prompt);
};

const askForProblemType = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, muammo turini tanlang:'  // Uzbek version
        : 'Пожалуйста, выберите тип проблемы:'; // Russian version

    // Send a message with an inline keyboard to choose problem type
    await ctx.reply(prompt, {
        reply_markup: {
            inline_keyboard: [
                [{ text: userLang === 'uz' ? 'Zakazda xatolik' : 'Ошибка в заказе', callback_data: 'problem_Ошибка в заказе' }],
                [{ text: userLang === 'uz' ? 'QR kod bilan xatolik' : 'Ошибка в QR коде', callback_data: 'problem_Ошибка в QR коде' }],
                [{ text: userLang === 'uz' ? 'IKPU bilan xatolik' : 'Ошибка в ИКПУ', callback_data: 'problem_Ошибка в ИКПУ' }],
            ],
        },
    });
};

const askForImageUpload = async (ctx, userLang) => {
    const prompt = userLang === 'uz'
        ? 'Iltimos, muammoni tasvirlaydigan rasmni yuboring:'
        : 'Пожалуйста, отправьте изображение, которое иллюстрирует проблему:';
    await ctx.reply(prompt);
};

const handleRestaurantSelection = async (ctx, userInput) => {
    const userLang = userLanguages[ctx.from.id];
    const selectedRestaurant = userInput.trim();

    userRestaurants[ctx.from.id] = selectedRestaurant;

    // Log and notify the user about the selected restaurant
    console.log(`User ${ctx.from.id} selected restaurant: ${selectedRestaurant}`);
    await ctx.reply(
        userLang === 'uz'
            ? `Siz ${selectedRestaurant} restoranidan yozmoqchisiz!`
            : `Вы хотите писать от ресторана: ${selectedRestaurant}!`
    );

    // Proceed to the next step: ask for problem description
    await askForProblemDescription(ctx, userLang);
};
const handleDescriptionInput = async (ctx, inputText) => {
    const userLang = userLanguages[ctx.from.id];
    const restaurant = userRestaurants[ctx.from.id];
    const clientContact = userContacts[ctx.from.id]?.phoneNumber;
    const clientName = userContacts[ctx.from.id]?.firstName;
    const clientRole = userContacts[ctx.from.id]?.firstName;
    const problemType = userSelectedProblems[ctx.from.id];

    // Save the description input
    userDescription[ctx.from.id] = inputText.trim();
    console.log(`User ${ctx.from.id} provided description: ${inputText}`);

    // Ask for the image before creating the task
    await askForImageUpload(ctx, userLang);
};

// Step 3: Handle photo upload correctly by saving the URL
bot.on('photo', async (ctx) => {
    try {
        const userLang = userLanguages[ctx.from.id] || 'uz'; // Default to Uzbek if not defined
        console.log("Received photo(s):", ctx.message.photo);

        // Get the highest resolution photo (last in the array)
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileId = photo.file_id;
        console.log(`File ID: ${fileId}`);

        // Get file details from Telegram API
        const fileDetails = await ctx.telegram.getFile(fileId);
        const filePath = fileDetails.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // Log the file URL for debugging
        console.log("File URL:", fileUrl);

        // Save the file URL for later use (when creating tasks in ClickUp)
        userPhotoUrls[ctx.from.id] = fileUrl;
        console.log("User's photo URL saved:", userPhotoUrls[ctx.from.id]);

        // After image is uploaded, create the task and upload the image to ClickUp
        const title = userSelectedProblems[ctx.from.id] || 'Problem';
        const description = userDescription[ctx.from.id];
        const restaurant = userRestaurants[ctx.from.id];
        const clientRole = userContacts[ctx.from.id]?.firstName;
        const clientName = userContacts[ctx.from.id]?.firstName;
        const clientContact = userContacts[ctx.from.id]?.phoneNumber;

        // Create the task
        const task = await sendToClickUp({
            title,
            description,
            restaurant,
            clientRole,
            clientName,
            clientContact,
        });

        // Upload the photo after task creation
        if (userPhotoUrls[ctx.from.id]) {
            await uploadPhotoToClickUp(task.id, [userPhotoUrls[ctx.from.id]]);
            await ctx.reply(userLang === 'uz' ? 'Muammo va rasm muvaffaqiyatli yuborildi!' : 'Проблема и изображение успешно отправлены!');
        } else {
            await ctx.reply(userLang === 'uz' ? 'Muammo muvaffaqiyatli yuborildi, ammo rasm yuborilmadi.' : 'Проблема успешно отправлена, но изображение не было отправлено.');
        }

        // Clear user state after completing the task
        clearUserState(ctx.from.id);
    } catch (error) {
        const userLang = userLanguages[ctx.from.id] || 'uz';  // Default to Uzbek if not defined
        console.error('Error processing photo:', error.message);
        await ctx.reply(userLang === 'uz' ? 'Rasmni qayta yuboring, xatolik yuz berdi.' : 'Отправьте изображение снова, произошла ошибка.');
    }
});



const clearUserState = (userId) => {
    delete userLanguages[userId];
    delete userRestaurants[userId];
    delete userDescription[userId];
    delete userContacts[userId];
    delete userSelectedProblems[userId];
    delete userPhotoUrls[userId]; // Ensure this is not being cleared prematurely
};

bot.start((ctx) => {
    ctx.reply(
        `Assalomu alaykum, ${ctx.from.first_name || 'there'}! Veda Vector jamosining 24/7 telegram botiga xush kelibsiz! Iltimos tilni tanlang:`,
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

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userLang = userLanguages[ctx.from.id];

    if (data.startsWith('problem_')) {
        userSelectedProblems[ctx.from.id] = data.replace('problem_', ''); // Save selected problem type

        await ctx.answerCbQuery();
        await ctx.reply(
            userLang === 'uz'
                ? 'Muammo turi tanlandi. Iltimos, restoran nomini kiriting:'
                : 'Тип проблемы выбран. Пожалуйста, напишите название заведении:',
        );
    } else if (data === 'lang_uz' || data === 'lang_ru') {
        const lang = data.split('_')[1];
        userLanguages[ctx.from.id] = lang;
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
    }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === 'lang_uz' || data === 'lang_ru') {
        const lang = data.split('_')[1];
        userLanguages[ctx.from.id] = lang;
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
    }
});

bot.on('text', async (ctx) => {
    const userLang = userLanguages[ctx.from.id];
    const restaurant = userRestaurants[ctx.from.id];

    if (!restaurant) {
        await handleRestaurantSelection(ctx, ctx.message.text);
    } else {
        await handleDescriptionInput(ctx, ctx.message.text);
    }
});

bot.launch()
    .then(() => console.log('Bot is running...'))
    .catch((err) => console.error('Failed to start bot:', err));

// Graceful shutdown on termination
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
