const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const activeSessions = new Map();

// Helper function
const getSession = (sessionId) => {
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      users: new Map(),
      canvasData: null,
      messages: []
    });
  }
  return activeSessions.get(sessionId);
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeSessions: activeSessions.size
  });
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Join session
  socket.on('join-session', (data) => {
    const { sessionId, user } = data;
    socket.join(sessionId);
    
    const session = getSession(sessionId);
    session.users.set(socket.id, { ...user, id: socket.id });
    
    // Send current state to new user
    socket.emit('canvas-state', {
      canvasData: session.canvasData,
      users: Array.from(session.users.values()),
      messages: session.messages
    });
    
    // Notify others
    socket.to(sessionId).emit('user-joined', { ...user, id: socket.id });
    io.to(sessionId).emit('users-update', Array.from(session.users.values()));
  });
  
  // Handle drawing
  socket.on('draw', (data) => {
    socket.broadcast.emit('draw', { ...data, userId: socket.id });
  });
  
  // Handle canvas update
  socket.on('canvas-update', (data) => {
    const session = activeSessions.get(data.sessionId);
    if (session) {
      session.canvasData = data.canvasData;
    }
    socket.broadcast.emit('canvas-update', data);
  });
  
  // Handle chat messages
  socket.on('chat-message', (data) => {
    const session = activeSessions.get(data.sessionId);
    if (session) {
      session.messages.push(data);
    }
    io.to(data.sessionId).emit('chat-message', data);
  });
  
  // Handle cursor movement
  socket.on('cursor-move', (data) => {
    socket.broadcast.emit('cursor-move', { ...data, userId: socket.id });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up user from all sessions
    activeSessions.forEach((session, sessionId) => {
      if (session.users.has(socket.id)) {
        const user = session.users.get(socket.id);
        session.users.delete(socket.id);
        
        io.to(sessionId).emit('user-left', { userId: socket.id });
        io.to(sessionId).emit('users-update', Array.from(session.users.values()));
        
        if (session.users.size === 0) {
          activeSessions.delete(sessionId);
        }
      }
    });
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});