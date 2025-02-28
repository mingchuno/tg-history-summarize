# Telegram History Summarizer

A Node.js application that summarizes Telegram chat history using OpenAI's GPT models.

## Features

- Connect to Telegram using both bot API and client API
- List all available chats, channels, and groups
- Retrieve chat history for a specified time period
- Summarize chat history using OpenAI's GPT models

## Prerequisites

- Node.js 20 or higher
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Telegram API ID and API Hash (from [my.telegram.org](https://my.telegram.org))
- OpenAI API Key

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=your_openai_api_key
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
SESSION_STRING=optional_session_string
```

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tg-history-summarize-nodejs.git
cd tg-history-summarize-nodejs

# Install dependencies
npm install
```

## Running Locally

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Docker

### Building and Running with Docker

```bash
# Build the Docker image
docker build -t tg-history-summarize .

# Run the container
docker run -d --name telegram-bot \
  -e TELEGRAM_BOT_TOKEN=your_bot_token \
  -e OPENAI_API_KEY=your_openai_key \
  -e TELEGRAM_API_ID=your_api_id \
  -e TELEGRAM_API_HASH=your_api_hash \
  -e SESSION_STRING=your_session_string \
  tg-history-summarize
```

### Using Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

## CI/CD Pipeline

This project includes a GitHub Actions workflow that:

1. Runs linting checks on all branches and pull requests
2. Builds the Docker image for all branches and pull requests
3. Pushes the Docker image to GitHub Container Registry (ghcr.io) when changes are merged to the main branch

The workflow is defined in `.github/workflows/ci-cd.yml`.

## Usage

Once the bot is running, you can interact with it through Telegram:

- `/start` - Start the bot
- `/help` - Show help message
- `/list` - List all your chats, channels, and groups
- `/summarize [group_link_or_id]` - Summarize the last 48 hours of chat in the specified group

## License

ISC
