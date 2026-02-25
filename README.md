# Buzzer Comment API

Microservice untuk automated commenting di TikTok via GoLogin + Puppeteer.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Database**: PostgreSQL (via Prisma)
- **Queue**: Redis + BullMQ
- **Browser Automation**: GoLogin + Puppeteer

## Quick Start

### 1. Clone & Install

```bash
cd buzzer-comment-api
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start Services (PostgreSQL & Redis)

```bash
docker-compose up -d
```

### 4. Run Database Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start Development Server

```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/comments` | Submit batch comment job |
| GET | `/api/v1/comments/:job_id` | Get job status |
| GET | `/api/v1/accounts` | Get available accounts |
| GET | `/api/v1/health` | Health check |

## Add Buzzer Account

Sebelum bisa posting comment, kamu harus menambahkan akun TikTok yang sudah login di GoLogin:

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acc_001",
    "tiktok_username": "buzzer_01",
    "gologin_profile_id": "your_gologin_profile_id"
  }'
```

## Submit Comment Job

```bash
curl -X POST http://localhost:3000/api/v1/comments \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://www.tiktok.com/@username/video/1234567890",
    "comments": [
      {
        "id": "comment_001",
        "text": "Keren banget! 🔥",
        "delay_seconds": 0
      },
      {
        "id": "comment_002",
        "text": "Relate banget sih ini 😭",
        "delay_seconds": 60
      }
    ]
  }'
```

## Check Job Status

```bash
curl http://localhost:3000/api/v1/comments/{job_id} \
  -H "X-API-Key: your_api_key"
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # Fastify setup
├── config/               # Environment config
├── lib/                  # Prisma, Redis, Queue
├── middleware/           # Auth middleware
├── routes/               # API endpoints
├── services/             # Business logic
└── workers/              # BullMQ worker + bot
    └── bot/              # GoLogin + TikTok automation
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOLOGIN_API_TOKEN` | Token dari GoLogin API |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_KEY` | Static API key untuk authentication |
| `PORT` | Server port (default: 3000) |
