const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Socket.IO
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Almacenamiento de usuarios
const users = new Map();

// Endpoint para subir archivos
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    url: `/uploads/${req.file.filename}`,
    type: req.file.mimetype.startsWith('image/') ? 'image' : 'file'
  });
});

// Manejo de conexiones Socket.IO
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Registrar usuario
  socket.on('set_username', (userData) => {
    const userInfo = {
      id: socket.id,
      name: userData.name || `Usuario_${socket.id.slice(0, 5)}`,
      phone: userData.phone || 'Sin número',
      status: 'online',
      lastSeen: new Date(),
      avatarColor: `#${Math.floor(Math.random()*16777215).toString(16)}`
    };
    
    users.set(socket.id, userInfo);
    io.emit('users_updated', Array.from(users.values()));
  });

  // Manejar mensajes
  socket.on('send_message', (msg) => {
    const sender = users.get(socket.id);
    if (!sender) return;

    const messageData = {
      from: socket.id,
      fromName: sender.name,
      fromPhone: sender.phone,
      to: msg.to,
      message: msg.message,
      type: msg.type || 'text',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false
    };

    // Enviar mensaje al destinatario
    if (msg.to === 'all') {
      io.emit('new_message', messageData);
    } else {
      socket.to(msg.to).emit('new_message', messageData);
      socket.emit('new_message', messageData); // Eco para el remitente
      
      // Marcar como leído si el receptor está en la conversación
      const receiver = users.get(msg.to);
      if (receiver && receiver.currentChat === socket.id) {
        messageData.read = true;
        socket.to(msg.to).emit('message_read', messageData);
      }
    }
  });

  // Notificar que está escribiendo
  socket.on('typing', (userId) => {
    const sender = users.get(socket.id);
    if (sender) {
      socket.to(userId).emit('user_typing', socket.id);
    }
  });

  // Manejar cambio de chat activo
  socket.on('set_current_chat', (chatId) => {
    const user = users.get(socket.id);
    if (user) {
      user.currentChat = chatId;
    }
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      user.status = 'offline';
      user.lastSeen = new Date();
      io.emit('users_updated', Array.from(users.values()));
      
      setTimeout(() => {
        if (users.get(socket.id)?.status === 'offline') {
          users.delete(socket.id);
          io.emit('users_updated', Array.from(users.values()));
        }
      }, 300000); // 5 minutos
    }
  });
});

// Verificar estado de usuarios cada 30 segundos
setInterval(() => {
  const now = new Date();
  users.forEach(user => {
    if (user.status === 'online' && (now - new Date(user.lastSeen)) > 60000) {
      user.status = 'away';
      io.emit('users_updated', Array.from(users.values()));
    }
  });
}, 30000);

// Iniciar servidor
server.listen(3001, '192.168.1.73', () => {
  console.log('Servidor corriendo en http://192.168.1.73:3001');
});