# CLAUDE.md - Telegram History Summarizer

## Commands
- Start: `npm start` or `node main.js`
- Development with auto-reload: `npm run dev`
- Install dependencies: `npm install`
- Add new dependency: `npm install --save <dependency-name>`
- Add dev dependency: `npm install --save-dev <dependency-name>`

## Code Style Guidelines
- Module system: ESM (import/export) not CommonJS (require)
- Use camelCase for variables and functions
- Use PascalCase for classes and constructors
- Organize imports at the top, grouped by external/internal
- Use async/await pattern for asynchronous code
- Include JSDoc comments for functions
- Error handling: Use try/catch blocks with custom error messages
- Logging: Use the logger object (info/error levels)
- Environment variables: Load from .env file using dotenv

## Project Structure
- Single file application with modular functions
- Telegram bot uses Telegraf framework
- API client uses Telegram/TelegramClient library
- OpenAI integration for chat summarization