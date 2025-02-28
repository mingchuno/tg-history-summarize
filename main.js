import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import { OpenAI } from 'openai';
import input from 'input';
import moment from 'moment';
import pino from 'pino';

// Configure environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'your_bot_token_here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your_openai_api_key_here';
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || 'your_api_hash_here';
const SESSION_STRING = process.env.SESSION_STRING || '';

// Set up OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Initialize Telegram bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Telethon client for accessing chat history
const client = new TelegramClient(new StringSession(SESSION_STRING), API_ID, API_HASH, {
  connectionRetries: 5,
});

// Setup logging with Pino
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: process.env.NODE_ENV !== 'production',
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Start the Telegram client
 */
async function startTelegramClient() {
  await client.start({
    phoneNumber: async () => await input.text('Please enter your phone number: '),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: err => logger.error(`Error starting Telegram client: ${err}`),
  });

  // Save the session string to reuse it later
  // logger.info(`Session string: ${client.session.save()}`);
}

/**
 * Get the ID of the currently logged-in Telegram user
 */
async function getLoggedInUserId() {
  try {
    const me = await client.getMe();
    return me.id.toString();
  } catch (error) {
    logger.error(`Error getting logged-in user: ${error}`);
    return null;
  }
}

/**
 * Check if the bot context user is the same as the logged-in Telegram user
 * @param {Object} ctx - The Telegraf context object
 * @param {string} commandName - The name of the command being checked
 * @returns {Promise<boolean>} - True if authorized, false otherwise
 */
async function isAuthorizedUser(ctx, commandName) {
  // Get the bot context user ID (user who sent the command)
  const botContextUserId = ctx.from.id.toString();

  // Get the logged-in Telegram client user ID
  const loggedInUserId = await getLoggedInUserId();

  // Check if the IDs match
  if (botContextUserId !== loggedInUserId) {
    ctx.reply(
      `Error: You are not authorized to use this command. Only the account owner can ${commandName}.`
    );
    logger.info(
      `Unauthorized ${commandName} attempt by user ${botContextUserId}. Logged-in user is ${loggedInUserId}`
    );
    return false;
  }

  return true;
}

/**
 * List all dialogs (chats, channels, groups) that the user is part of
 */
async function listAllDialogs() {
  try {
    const dialogs = await client.getDialogs({ limit: 10 });
    return dialogs.map(dialog => ({
      id: dialog.entity.id.toString(),
      name: dialog.entity.title || dialog.entity.firstName || 'Unknown',
      type: dialog.entity.className || 'Unknown',
      username: dialog.entity.username || 'N/A',
    }));
  } catch (error) {
    logger.error(`Error listing dialogs: ${error}`);
    return [];
  }
}

const MAX_CHAT_HISTORY_HOURS = 48;
const MAX_CHAT_HISTORY_LIMIT = 1000;

/**
 * Get chat history from a group for the specified number of hours
 */
async function getChatHistory(groupIdentifier) {
  try {
    logger.info(`Getting chat history for: ${groupIdentifier}`);

    // Determine if the identifier is a link, username, or ID
    let entity;

    if (groupIdentifier.startsWith('https://t.me/') || groupIdentifier.startsWith('@')) {
      // It's a link or username
      entity = await client.getInputEntity(groupIdentifier);
    } else {
      // It's a numeric ID - convert to BigInt
      let id;
      try {
        id = BigInt(groupIdentifier);
      } catch (error) {
        logger.error(`Invalid ID format: ${groupIdentifier}`);
        throw new Error(`Invalid ID format: ${groupIdentifier}. Please use a valid numeric ID.`);
      }

      // For debugging
      logger.info(`Attempting to resolve entity with ID: ${id}`);

      // Try different entity types and formats
      try {
        // First, try to get the entity directly from dialogs
        const dialogs = await client.getDialogs();
        for (const dialog of dialogs) {
          if (dialog.entity.id.toString() === groupIdentifier) {
            entity = dialog.inputEntity;
            logger.info(`Found entity in dialogs with ID: ${groupIdentifier}`);
            break;
          }
        }

        if (!entity) {
          throw new Error(
            `Could not find entity with ID: ${groupIdentifier}. Please make sure the ID is correct and you have access to it.`
          );
        }
      } catch (error) {
        logger.error(`Error during entity resolution: ${error.message}`);
        throw error;
      }
    }

    logger.info(`Successfully resolved entity`);

    // Calculate the time threshold as a moment object
    const timeThreshold = moment().subtract(MAX_CHAT_HISTORY_HOURS, 'hours');

    // Get messages from the specified time period
    const messages = await client.getMessages(entity, { limit: MAX_CHAT_HISTORY_LIMIT });

    return messages
      .filter(message => message.message)
      .filter(message => {
        const messageDate = moment(message.date * 1000); // Convert seconds to milliseconds
        return messageDate.isAfter(timeThreshold);
      })
      .map(message => ({
        sender: message.sender?.username || 'Unknown',
        text: message.message,
        date: moment(message.date * 1000).format('YYYY-MM-DD HH:mm:ss'),
      }));
  } catch (error) {
    logger.error(`Error getting chat history: ${error}`);
    return [];
  }
}

/**
 * Use OpenAI API to summarize the chat messages
 */
async function summarizeText(messages) {
  if (!messages || messages.length === 0) {
    return 'No messages found in the specified time period.';
  }

  // Format messages for the prompt
  const formattedMessages = messages
    .map(msg => `${msg.date} - ${msg.sender}: ${msg.text}`)
    .join('\n');

  // Create the prompt for OpenAI
  const prompt = `
    請總結以下的Telegram聊天記錄並使用中文回應。不少於500字。
    重點：
      - 主要討論主題，討論頻次或重要性從高到低排序
      - 關鍵決定或結論，提及的任何行動項目或後續行動
      - 誰人參與了這些討論，由參與度高到低排序
      - 分析主要參與討論者的語氣和情緒，按1為最消極，10為最積極，5為中立，給予評分及評論
    聊天記錄：
    ${formattedMessages}
  `;

  try {
    // Get summary from OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Or any suitable model
      messages: [
        {
          role: 'developer',
          content:
            'You are a helpful assistant that summarizes Telegram chat histories concisely and accurately.',
        },
        { role: 'user', content: prompt },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error(`Error with OpenAI API: ${error}`);
    return `Error generating summary: ${error.message}`;
  }
}

// Define bot commands
bot.start(ctx => {
  const user = ctx.from;
  ctx.reply(
    `Hi ${user.first_name}! I'm a chat summary bot. Use /summarize [group_link] to get a summary of the last 48 hours in that group.`
  );
});

bot.help(ctx => {
  ctx.reply(
    'Commands:\n' +
      '/start - Start the bot\n' +
      '/help - Show this help message\n' +
      '/list - List all your chats, channels and groups\n' +
      `/summarize [group_link_or_id] - Summarize the last ${MAX_CHAT_HISTORY_HOURS} hours or last ${MAX_CHAT_HISTORY_LIMIT} messages of chat in the specified group`
  );
});

bot.command('list', async ctx => {
  // Check if user is authorized
  if (!(await isAuthorizedUser(ctx, 'list chats'))) {
    return;
  }

  // Let the user know the bot is working
  ctx.reply('Fetching your chats, channels, and groups. This may take a moment...');

  try {
    // Get all dialogs
    const dialogs = await listAllDialogs();

    // Check if we got any dialogs
    if (!dialogs.length) {
      ctx.reply("Could not retrieve any chats. Please ensure you're logged in properly.");
      return;
    }

    // Format dialogs for display with a limit to avoid message length issues
    const formattedMessage = 'Your chats, channels and groups:\n\n';

    const formattedChunk = dialogs
      .map(
        dialog =>
          `ID: ${dialog.id}\nName: ${dialog.name}\nType: ${dialog.type}\nUsername: ${dialog.username}\n`
      )
      .join('\n');

    await ctx.reply(`${formattedMessage}${formattedChunk}`);

    // Add instructions for using the IDs
    await ctx.reply('To summarize a chat, use /summarize [ID] with one of the IDs listed above.');
  } catch (error) {
    logger.error(`Error processing list command: ${error}`);
    ctx.reply(`Error: ${error.message}`);
  }
});

bot.command('summarize', async ctx => {
  const args = ctx.message.text.split(' ').slice(1);

  if (!args.length) {
    ctx.reply('Please provide a group link or ID. Usage: /summarize [group_link_or_id]');
    return;
  }

  // Check if user is authorized
  if (!(await isAuthorizedUser(ctx, 'summarize chats'))) {
    return;
  }

  const groupIdentifier = args[0];

  // Let the user know the bot is working
  ctx.reply(`Fetching and summarizing messages for ${groupIdentifier}. This may take a moment...`);

  try {
    // Get chat history
    const messages = await getChatHistory(groupIdentifier);

    // Check if we got any messages
    if (!messages.length) {
      ctx.reply(
        'Could not retrieve any messages. Please check the group link/ID and ensure the bot has access to the group.'
      );
      return;
    }

    // Get summary
    const summary = await summarizeText(messages);

    // Send summary to the user
    ctx.reply(
      `Summary of the last ${MAX_CHAT_HISTORY_HOURS} hours or last ${MAX_CHAT_HISTORY_LIMIT} messages in the group:\n\n${summary}`
    );
  } catch (error) {
    logger.error(`Error processing summarize command: ${error}`);
    ctx.reply(`Error: ${error.message}`);
  }
});

// Start the bot
async function main() {
  try {
    // Start the Telegram client
    await startTelegramClient();

    // Log out the session string to save it
    logger.info('Telegram client started');

    // Launch the bot
    await bot.launch();
    logger.info('Bot started');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    logger.error(`Error starting bot: ${error}`);
  }
}

// Run the main function
main();
