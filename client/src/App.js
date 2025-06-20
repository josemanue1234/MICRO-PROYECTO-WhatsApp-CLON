import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import './App.css';

const socket = io('http://192.168.1.73:3001');

function App() {
  // Estados para el login
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Estados para el chat
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [location, setLocation] = useState(null);
  
  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleLogin = () => {
    if (username.trim()) {
      setIsLoggedIn(true);
      socket.emit('set_username', username);
    }
  };

  // Funciones auxiliares mejoradas para nombres de usuario
  const getSafeUserName = (user) => {
    if (!user) return 'Usuario desconocido';
    if (user.name && typeof user.name === 'string') {
      return user.name;
    }
    if (user.id && typeof user.id === 'string') {
      return `Usuario_${user.id.slice(0, 4)}`;
    }
    return 'Usuario';
  };

  const getSafeUserAvatar = (user) => {
    const name = getSafeUserName(user);
    return name.charAt(0).toUpperCase();
  };

  // Efectos
  useEffect(() => {
    const handleNewMessage = (data) => {
      setMessages((prev) => [...prev, {
        ...data,
        timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    };

    const handleUsersUpdated = (usersList) => {
      const safeUsers = (usersList || []).map(user => ({
        id: user?.id || Math.random().toString(36).substr(2, 9),
        name: user?.name || `Usuario_${Math.random().toString(36).substr(2, 4)}`,
        phone: user?.phone || '',
        status: user?.status || 'online'
      }));
      setUsers(safeUsers);
    };

    const handleNotification = (notification) => {
      setNotifications((prev) => [...prev, {
        from: notification.from || 'Sistema',
        message: notification.message || 'Notificación'
      }]);
      setTimeout(() => {
        setNotifications((prev) => prev.slice(1));
      }, 5000);
    };

    const handleUserTyping = (userId) => {
      const user = users.find(u => u.id === userId);
      if (user) {
        const userName = getSafeUserName(user);
        setTypingUsers((prev) => [...new Set([...prev, userName])]);
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter(name => name !== userName));
        }, 2000);
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('users_updated', handleUsersUpdated);
    socket.on('notification', handleNotification);
    socket.on('user_typing', handleUserTyping);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('users_updated', handleUsersUpdated);
      socket.off('notification', handleNotification);
      socket.off('user_typing', handleUserTyping);
    };
  }, [users]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Funciones del chat
  const sendMessage = () => {
    if ((message.trim() || file || location) && selectedUser) {
      const messageData = {
        from: socket.id,
        fromName: username,
        fromPhone: phoneNumber,
        to: selectedUser.id,
        message: message.trim(),
        type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (file) {
        uploadFile(messageData);
      } else if (location) {
        sendLocation(messageData);
      } else {
        socket.emit('send_message', messageData);
        setMessage('');
      }
    }
  };

  const uploadFile = async (messageData) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://192.168.100.45:3001/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      messageData.message = data.url;
      messageData.type = file.type.startsWith('image/') ? 'image' : 'file';
      
      socket.emit('send_message', messageData);
      setFile(null);
      setMessage('');
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const sendLocation = (messageData) => {
    messageData.message = JSON.stringify(location);
    messageData.type = 'location';
    socket.emit('send_message', messageData);
    setLocation(null);
    setMessage('');
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    } else if (selectedUser) {
      socket.emit('typing', selectedUser.id);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const shareLocation = () => {
    if (navigator.geolocation) {
      setShowLocationModal(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          setNotifications([...notifications, {
            from: 'Sistema',
            message: 'No se pudo obtener la ubicación'
          }]);
          setShowLocationModal(false);
        }
      );
    } else {
      setNotifications([...notifications, {
        from: 'Sistema',
        message: 'Geolocalización no soportada por tu navegador'
      }]);
    }
  };

  const renderMessageContent = (msg) => {
    const senderInfo = msg.fromName 
      ? `${msg.fromName}${msg.fromPhone ? ` (${msg.fromPhone})` : ''}`
      : 'Remitente desconocido';

    return (
      <div className="message-content-container">
        <div className="message-from">{senderInfo}</div>
        <div className="message-content">
          {(() => {
            switch (msg.type) {
              case 'image':
                return <img src={msg.message} alt="Imagen enviada" className="message-image" />;
              case 'file':
                return (
                  <a href={msg.message} download className="file-message">
                    <i className="file-icon"></i> Descargar archivo
                  </a>
                );
              case 'location':
                try {
                  const loc = JSON.parse(msg.message);
                  return (
                    <a 
                      href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="location-message"
                    >
                      <i className="location-icon">📍</i> Ver ubicación en mapa
                      <div className="location-coords">
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </div>
                    </a>
                  );
                } catch (e) {
                  return "Ubicación compartida";
                }
              default:
                return msg.message;
            }
          })()}
        </div>
      </div>
    );
  };

  // Pantalla de login mejorada (sin logo)
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Chat App</h1>
          <p className="welcome-text">Conéctate con tus amigos y familiares</p>
          
          <div className="input-group">
            <label>Nombre de usuario</label>
            <input
              type="text"
              placeholder="Ingresa tu nombre"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="input-group">
            <label>Número de teléfono (opcional)</label>
            <input
              type="tel"
              placeholder="Ingresa tu número"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <button 
            onClick={handleLogin} 
            className="login-button"
            disabled={!username.trim()}
          >
            Iniciar sesión
          </button>

          <p className="terms-text">
            Al iniciar aceptas nuestros <button className="terms-link" onClick={(e) => e.preventDefault()}>Términos</button>
          </p>
        </div>
      </div>
    );
  }

  // Pantalla principal del chat
  return (
    <div className="chat-app">
      <div className="chat-header">
        <div className="chat-title">Chat App</div>
        <div className="chat-status">Conectado como {username}</div>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <div className="current-user">
            <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
            <div className="user-name">{username}</div>
            {phoneNumber && <div className="user-phone">{phoneNumber}</div>}
          </div>

          <div className="users-list">
            {users.filter(user => user.id !== socket.id).map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="user-avatar">{getSafeUserAvatar(user)}</div>
                <span className={`user-status ${user.status || 'offline'}`}></span>
                <div className="user-info">
                  <span className="user-name">{getSafeUserName(user)}</span>
                  {user.phone && <span className="user-phone-small">{user.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-main">
          {selectedUser ? (
            <>
              <div className="chat-header-secondary">
                <div className="selected-user-info">
                  <div className="user-avatar">{getSafeUserAvatar(selectedUser)}</div>
                  <div>
                    <div className="selected-user-name">{getSafeUserName(selectedUser)}</div>
                    {selectedUser.phone && <div className="selected-user-phone">{selectedUser.phone}</div>}
                    <div className="selected-user-status">
                      {typingUsers.includes(getSafeUserName(selectedUser)) 
                        ? 'escribiendo...' 
                        : selectedUser.status || 'offline'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="messages">
                {messages
                  .filter((msg) => 
                    (msg.from === socket.id && msg.to === selectedUser.id) || 
                    (msg.to === socket.id && msg.from === selectedUser.id)
                  )
                  .map((msg, index) => (
                    <div
                      key={index}
                      className={`message ${msg.from === socket.id ? 'sent' : 'received'}`}
                    >
                      {renderMessageContent(msg)}
                      <div className="message-info">
                        <span className="message-time">
                          {msg.timestamp}
                        </span>
                        {msg.from === socket.id && (
                          <span className="message-status">
                            {msg.read ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="message-input-area">
                <div className="input-buttons">
                  <button
                    className="emoji-button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    😊
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker-container">
                      <EmojiPicker onEmojiClick={onEmojiClick} />
                    </div>
                  )}

                  <button
                    className="location-button"
                    onClick={shareLocation}
                    title="Compartir ubicación"
                  >
                    📍
                  </button>

                  <input
                    type="file"
                    style={{ display: 'none' }}
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />

                  <button
                    className="attach-button"
                    onClick={() => fileInputRef.current.click()}
                  >
                    📎
                  </button>
                </div>

                <input
                  type="text"
                  placeholder={`Escribe un mensaje a ${getSafeUserName(selectedUser)}`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                />

                <button className="send-button" onClick={sendMessage}>
                  Enviar
                </button>
              </div>
            </>
          ) : (
            <div className="no-chat-selected">
              <div className="no-chat-content">
                <div className="no-chat-icon">💬</div>
                <h2>Selecciona un contacto</h2>
                <p>Elige un usuario de la lista para comenzar a chatear</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showLocationModal && (
        <div className="location-modal">
          <div className="modal-content">
            <h3>Compartir Ubicación</h3>
            {location ? (
              <>
                <p>¿Compartir esta ubicación?</p>
                <div className="location-preview">
                  <a 
                    href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Ver en mapa
                  </a>
                  <div>Latitud: {location.lat.toFixed(6)}</div>
                  <div>Longitud: {location.lng.toFixed(6)}</div>
                  <div>Precisión: ~{Math.round(location.accuracy)} metros</div>
                </div>
                <div className="modal-buttons">
                  <button onClick={() => {
                    sendLocation({
                      from: socket.id,
                      fromName: username,
                      to: selectedUser.id,
                      type: 'location',
                      timestamp: new Date().toLocaleTimeString()
                    });
                    setShowLocationModal(false);
                  }} className="confirm-button">
                    Compartir
                  </button>
                  <button onClick={() => {
                    setLocation(null);
                    setShowLocationModal(false);
                  }} className="cancel-button">
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="loading-location">
                <div className="spinner"></div>
                <p>Obteniendo ubicación...</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="notifications">
        {notifications.map((notif, idx) => (
          <div key={idx} className="notification">
            {notif.from}: {notif.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;