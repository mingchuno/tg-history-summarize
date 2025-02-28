import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import { OpenAI } from 'openai';
import input from 'input';
import { NewMessage } from 'telegram/events/NewMessage.js';
import moment from 'moment';

// Configure environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'your_bot_token_here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your_openai_api_key_here';
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || 'your_api_hash_here';
const BOT_USERNAME = process.env.BOT_USERNAME || 'your_bot_username_here';
const SESSION_STRING = process.env.SESSION_STRING || '';

// Set up OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Initialize Telegram bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Telethon client for accessing chat history
const client = new TelegramClient(
  new StringSession(SESSION_STRING),
  API_ID,
  API_HASH,
  { connectionRetries: 5 }
);

// Setup logging
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

/**
 * Start the Telegram client
 */
async function startTelegramClient() {
  await client.start({
    phoneNumber: async () => await input.text('Please enter your phone number: '),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => logger.error(`Error starting Telegram client: ${err}`)
  });

  // Save the session string to reuse it later
  logger.info(`Session string: ${client.session.save()}`);
}

/**
 * List all dialogs (chats, channels, groups) that the user is part of
 */
async function listAllDialogs() {
  try {
    const dialogs = await client.getDialogs({limit:10});
    return dialogs.map(dialog => ({
      id: dialog.entity.id.toString(),
      name: dialog.entity.title || dialog.entity.firstName || 'Unknown',
      type: dialog.entity.className || 'Unknown',
      username: dialog.entity.username || 'N/A'
    }))
  } catch (error) {
    logger.error(`Error listing dialogs: ${error}`);
    return [];
  }
}

/**
 * Get chat history from a group for the specified number of hours
 */
async function getChatHistory(groupIdentifier, hours = 48) {
  try {
    // Determine if the identifier is a link or ID
    let channel;
    if (groupIdentifier.startsWith('https://t.me/') || groupIdentifier.startsWith('@')) {
      // It's a link or username
      channel = await client.getEntity(groupIdentifier);
    } else {
      // It's a channel ID
      channel = await client.getEntity(BigInt(groupIdentifier));
    }

    logger.info(channel)

    // Calculate the time threshold as a moment object
    const timeThreshold = moment().subtract(hours, 'hours');

    // Get messages from the specified time period
    const messages = [];
    const messagesIterator = client.iterMessages(BigInt(groupIdentifier), { limit: 2000 });

    for await (const message of messagesIterator) {
      // Convert Telegram date (milliseconds) to moment for comparison
      const messageDate = moment(message.date * 1000); // Convert seconds to milliseconds
      // Compare using moment's isBefore method
      if (messageDate.isBefore(timeThreshold)) {
        break;
      }

      if (message.message) {  // Only include messages with text
        messages.push({
          sender: message.senderId ? message.senderId.toString() : 'Unknown',
          text: message.message,
          date: messageDate.format('YYYY-MM-DD HH:mm:ss')
        });
      }
    }

    return messages;
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
    return "No messages found in the specified time period.";
  }

  // Format messages for the prompt
  const formattedMessages = messages.map(msg => `${msg.date} - ${msg.sender}: ${msg.text}`).join('\n');

  // Create the prompt for OpenAI
  const prompt = `
    請總結過去48小時的Telegram聊天記錄。請用中文回應。
    重點：
      - 主要討論主題
      - 關鍵決定或結論
      - 提出的重要問題或議題
      - 提及的任何行動項目或後續行動
    聊天記錄：
    ${formattedMessages}
  `;

  try {
    // Get summary from OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // Or any suitable model
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes Telegram chat histories concisely and accurately." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error(`Error with OpenAI API: ${error}`);
    return `Error generating summary: ${error.message}`;
  }
}

// Define bot commands
bot.start((ctx) => {
  const user = ctx.from;
  ctx.reply(`Hi ${user.first_name}! I'm a chat summary bot. Use /summarize [group_link] to get a summary of the last 48 hours in that group.`);
});

bot.help((ctx) => {
  ctx.reply(
    "Commands:\n" +
    "/start - Start the bot\n" +
    "/help - Show this help message\n" +
    "/list - List all your chats, channels and groups\n" +
    "/summarize [group_link_or_id] - Summarize the last 48 hours of chat in the specified group"
  );
});

bot.command('list', async (ctx) => {
  // Let the user know the bot is working
  ctx.reply("Fetching your chats, channels, and groups. This may take a moment...");

  try {
    // Get all dialogs
    const dialogs = await listAllDialogs();

    console.log(dialogs)
    // Check if we got any dialogs
    if (!dialogs.length) {
      ctx.reply("Could not retrieve any chats. Please ensure you're logged in properly.");
      return;
    }

    // Format dialogs for display with a limit to avoid message length issues
    const formattedMessage = "Your chats, channels and groups:\n\n";

    const formattedChunk = dialogs.map(dialog =>
      `ID: \`${dialog.id}\`\nName: ${dialog.name}\nType: ${dialog.type}\nUsername: ${dialog.username}\n`
    ).join('\n');

    await ctx.reply(`${formattedMessage}${formattedChunk}`);

    // Add instructions for using the IDs
    await ctx.reply("To summarize a chat, use /summarize [ID] with one of the IDs listed above.");
  } catch (error) {
    logger.error(`Error processing list command: ${error}`);
    ctx.reply(`Error: ${error.message}`);
  }
});

bot.command('summarize', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);

  if (!args.length) {
    ctx.reply("Please provide a group link or ID. Usage: /summarize [group_link_or_id]");
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
      ctx.reply("Could not retrieve any messages. Please check the group link/ID and ensure the bot has access to the group.");
      return;
    }

    // Get summary
    const summary = await summarizeText(messages);

    // Send summary to the user
    ctx.reply(`Summary of the last 48 hours in the group:\n\n${summary}`, {
      parse_mode: 'Markdown'
    });
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
