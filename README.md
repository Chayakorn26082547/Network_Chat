# Chat Application - Monorepo Structure

This is a chat application built with Next.js frontend and Express.js backend using Socket.IO for real-time communication.

## Project Structure

```
TALKINGCHAT/
├── frontend/          # Next.js React application
│   ├── app/          # App router pages
│   ├── hooks/        # Custom React hooks
│   ├── public/       # Static assets
│   └── package.json
└── backend/          # Express.js + Socket.IO server
    ├── src/
    │   ├── server.ts # Main server file
    │   └── types.ts  # TypeScript type definitions
    └── package.json
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

#### Backend Setup

```bash
cd backend
npm install
```

#### Frontend Setup

```bash
cd frontend
npm install
```

### Running the Application

#### Start Backend Server

```bash
cd backend
npm run dev
```

The server will run on `http://localhost:3001`

#### Start Frontend (in a new terminal)

```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:3000`

### Frontend

- Next.js 16
- React 19
- TypeScript
- Socket.IO Client
- Tailwind CSS

### Backend

- Express.js
- Socket.IO
- TypeScript
- Node.js

## API Reference

### Socket Events

#### Client to Server

- `setUsername(data: string | { username: string; avatar?: string })` - Set user's username (and optional avatar URL)
- `message({username, text})` - Send a message
- `getPreviousMessages()` - Request message history
- `userLeft(username)` - Notify user is leaving

#### Server to Client

- `userJoined({username, users})` - Broadcast user joined
- `userLeft({username, users})` - Broadcast user left
- `message(messageData)` - Receive new message
- `previousMessages(messages)` - Receive message history
- `userList(users)` - Receive active users list

## Environment Variables

### Frontend (.env.local)

```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Backend (.env)

```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## Development

### Build Frontend

```bash
cd frontend
npm run build
```

### Build Backend

```bash
cd backend
npm run build
```

### Production

#### Backend

```bash
cd backend
npm run build
npm start
```

#### Frontend

```bash
cd frontend
npm run build
npm start
```
