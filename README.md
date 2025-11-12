# WeChat AI Tutor Bot

An AI-powered chatbot for WeChat that helps students learn Machine Learning concepts using DeepSeek API.

## Features

- Machine learning concept explanations
- Code and answer correction with feedback
- Practice exam generation
- Personalized study plans based on student performance
- OCR support for screenshots
- Conversation memory management

## Prerequisites

- Node.js (v14 or higher)
- WeChat Official Account (AppID and AppSecret)
- DeepSeek API key

## Installation

1. Clone the repository
```bash
git clone <your-repo-url>
cd wechat_bot
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Edit `.env` with your actual values:
```
WECHAT_APPID=your_wechat_appid
WECHAT_APPSECRET=your_wechat_appsecret
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
PORT=80
```

## Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
node server.js
```

The server will start on port 80 (or the port specified in `.env`).

## Project Structure

```
wechat_bot/
├── server.js              # Main server file
├── handleImages.js        # OCR image processing
├── memoryManager.js       # Conversation memory management
├── .env                   # Environment variables (not committed)
├── .env.example           # Environment template
├── logs/                  # User interaction logs
└── ocr/                   # OCR output storage
```

## License

ISC
