const { Telegraf } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = '7712404901:AAFmA0FeK_NSxRw3O6SWRHUlAuSfgJ5NsLk'; // Replace with your actual bot token
const CLICKUP_API_KEY = 'pk_158692681_BDRAASUB1DTHX9I061Y9CT0HY4ITML27'; // Replace with your ClickUp API key
const CLICKUP_LIST_ID = '901804634528'; // Replace with your ClickUp list ID

const bot = new Telegraf(BOT_TOKEN);

const userLanguages = {};
const userJobs = {};
const userRestaurants = {};
const userContacts = {};
const userSelectedProblems = {}; // Store selected problems for users


const sendToClickUp = async ({ title, description, restaurant, clientRole, clientName, clientContact }) => {
    const url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`;
    const data = {
        name: title,
        description,
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
        assignUserToTask(response.data.id, '5725322')
        return response.data;
    } catch (error) {
        console.error('Error creating task in ClickUp:', error.response?.data || error.message);
        throw error;
    }
};

const assignUserToTask = async (taskId, assigneeId) => {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const data = {
        assignees: {add: [assigneeId]},
        priority: 1,
    };
    console.log(data);
    try {
        const response = await axios.put(url, data, {
            headers: {
                Authorization: CLICKUP_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        console.log(`User with ID ${assigneeId} assigned to task ${taskId}:`);
        return response.data;
    } catch (error) {
        console.error(`Error assigning user to task ${taskId}:`, error.response?.data || error.message);
        throw error;
    }
};



const askForJob = async (ctx, userLang) => {
    const jobs = userLang === 'uz'
        ? [['Ofitsiant', 'job_waiter'], ['Direktor', 'job_director'], ['Tizim administratori', 'job_admin'], ['Menejer', 'job_manager']]
        : [['Официант', 'job_waiter'], ['Директор', 'job_director'], ['Системный администратор', 'job_admin'], ['Менеджер', 'job_manager']];

    const buttons = jobs.map(([text, data]) => [{ text, callback_data: data }]);

    await ctx.reply(
        userLang === 'uz' ? 'Iltimos, kasbingizni tanlang:' : 'Пожалуйста, выберите вашу профессию:',
        { reply_markup: { inline_keyboard: buttons } }
    );
};

// Функция для выбора ресторана
const askForRestaurant = async (ctx, userLang) => {
    await ctx.reply(
        userLang === 'uz'
            ? 'Iltimos, restoran nomini yozib yuboring:'
            : 'Пожалуйста, напишите название ресторана:'
    );
};


const handleJobSelection = async (ctx, data) => {
    const userLang = userLanguages[ctx.from.id];
    const job = data.replace('job_', '');
    const jobNames = {
        waiter: userLang === 'uz' ? 'Ofitsiant' : 'Официант',
        director: userLang === 'uz' ? 'Direktor' : 'Директор',
        admin: userLang === 'uz' ? 'Tizim administratori' : 'Системный администратор',
        manager: userLang === 'uz' ? 'Menejer' : 'Менеджер',
    };

    const selectedJob = jobNames[job];
    userJobs[ctx.from.id] = selectedJob;

    console.log(`User ${ctx.from.id} selected job: ${selectedJob}`);
    await ctx.answerCbQuery();
    await ctx.reply(userLang === 'uz'
        ? `Sizning kasbingiz: ${selectedJob}`
        : `Ваша профессия: ${selectedJob}`);

    // Переход к выбору ресторана
    await askForRestaurant(ctx, userLang);
};

const askForProblemType = async (ctx, userLang) => {
    const problems = userLang === 'uz'
        ? [['Hisobotlar', 'problem_test'], ['Buyurtma', 'problem_test2'], ['test 3', 'problem_test3'], ['test 4', 'problem_test4']]
        : [['Отчеты', 'problem_test'], ['Заказ', 'problem_test2'], ['тест 3', 'problem_test3'], ['тест 4', 'problem_test4']];
    console.log(problems)
    const buttons = problems.map(([text, data]) => [{ text, callback_data: data }]);

    await ctx.reply(
        userLang === 'uz' ? 'Iltimos, muammoni tanlang:' : 'Пожалуйста, выберите проблему:',
        { reply_markup: { inline_keyboard: buttons } }
    );
};

// Обработчик выбора ресторана (добавляем переход к выбору проблемы)
const handleRestaurantSelection = async (ctx, userInput) => {
    const userLang = userLanguages[ctx.from.id];
    const selectedRestaurant = userInput.trim();
    // Save the selected restaurant for the user
    userRestaurants[ctx.from.id] = selectedRestaurant;

    // Log and notify the user about the selected restaurant
    console.log(`User ${ctx.from.id} selected restaurant: ${selectedRestaurant}`);
    await ctx.reply(
        userLang === 'uz'
            ? `Siz ${selectedRestaurant} restoranidan yozmoqchisiz!`
            : `Вы хотите писать от ресторана: ${selectedRestaurant}!`
    );

    // Proceed to the next step, e.g., problem selection
    await askForProblemType(ctx, userLang);
};

// Обработчик выбора проблемы
const handleProblemSelection = async (ctx, data) => {
    const userLang = userLanguages[ctx.from.id];
    const problem = data.replace('problem_', '');
    const problemNames = {
        test: userLang === 'uz' ? 'Hisobotlar' : 'Отчеты',
        test2: userLang === 'uz' ? 'Buyurtma' : 'Заказ',
        test3: userLang === 'uz' ? 'test' : 'test',
        test4: userLang === 'uz' ? 'test' : 'test',
    };

    const selectedProblem = problemNames[problem];
    userSelectedProblems[ctx.from.id] = selectedProblem; // Store the problem

    console.log(`User ${ctx.from.id} selected problem: ${selectedProblem}`);
    await ctx.answerCbQuery();
    await ctx.reply(userLang === 'uz'
        ? `Siz muammoni tanladingiz: ${selectedProblem}`
        : `Вы выбрали проблему: ${selectedProblem}`);

    const prompt = userLang === 'uz'
        ? `Iltimos, ${selectedProblem} bo'yicha muammoni batafsil tasvirlab bering:`
        : `Пожалуйста, подробно опишите проблему с ${selectedProblem}:`;
    await ctx.reply(prompt);
};


// Стартовый обработчик
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

// Обработчик контактов
// Process contact sharing
bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    userContacts[ctx.from.id] = {
        phoneNumber: contact.phone_number,
        firstName: contact.first_name,
        lastName: contact.last_name || '',
    };
    console.log(contact);
    const userLang = userLanguages[ctx.from.id];

    console.log('User Contact:', userContacts[ctx.from.id]);

    if (userLang) {
        await askForJob(ctx, userLang);
    } else {
        await ctx.reply('Iltimos, tilni tanlang (Please select a language):');
    }
});
// Обработчик callback-запросов
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
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
        } else if (data.startsWith('job')) {
            await handleJobSelection(ctx, data);
        } else if (data.startsWith('rest')) {
            await handleRestaurantSelection(ctx, data);
        } else if (data.startsWith('problem')) {
            await handleProblemSelection(ctx, data);
        }
    } catch (error) {
        console.error('Error in callback query handling:', error);
        await ctx.reply('Xatolik yuz berdi.');
    }
});

bot.on('text', async (ctx) => {
    const userLang = userLanguages[ctx.from.id];
    const inputText = ctx.message.text;
    const parts = inputText.split(' - ');
    const restaurant = parts[0]?.trim();
    const description = parts[1]?.trim();
    const clientRole = userJobs[ctx.from.id];
    const clientContact = userContacts[ctx.from.id];
    const clientName = userContacts[ctx.from.id];
    const problemType = userSelectedProblems[ctx.from.id];

    if (!restaurant || !clientRole) {
        await ctx.reply(
            userLang === 'uz'
                ? 'Iltimos, oldin restoran va kasbingizni tanlang.'
                : 'Пожалуйста, сначала выберите ресторан и вашу профессию.'
        );
        return;
    }

    const title = `${problemType}`;

    try {
        await sendToClickUp({
            title,
            description,
            restaurant,
            clientRole,
            clientContact,
            clientName
        });

        await ctx.reply(
            userLang === 'uz'
                ? 'Muammo muvaffaqiyatli yuborildi!'
                : 'Проблема успешно отправлена!'
        );
    } catch {
        await ctx.reply(
            userLang === 'uz'
                ? 'Muammo yuborishda xatolik yuz berdi.'
                : 'Ошибка при отправке проблемы.'
        );
    }
});


// Запуск бота
bot.launch()
    .then(() => console.log('Bot is running...'))
    .catch((err) => console.error('Failed to start bot:', err));

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));