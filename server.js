const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

io.on('connection', (socket) => {
  // 1. ODAYA GİRİŞ
  socket.on('join_party', ({ partyId, username }) => {
    socket.join(partyId);
    
    if (!rooms[partyId]) {
      rooms[partyId] = {
        videoUrl: "https://www.youtube.com/watch?v=DzMrabVqiJE",
        hostId: socket.id, // Odayı kuran Başkan!
        users: []
      };
    }
    
    rooms[partyId].users.push({ id: socket.id, name: username || "Misafir" });

    // Herkese odanın son durumunu yolla
    io.to(partyId).emit('room_state', {
      videoUrl: rooms[partyId].videoUrl,
      hostId: rooms[partyId].hostId,
      users: rooms[partyId].users
    });
  });

  // 2. VİDEO DEĞİŞİMİ
  socket.on('change_video', ({ partyId, videoUrl }) => {
    if (rooms[partyId]) {
      rooms[partyId].videoUrl = videoUrl;
      rooms[partyId].hostId = socket.id; // Videoyu değiştiren otomatik Başkan olur!
      io.to(partyId).emit('video_changed', { videoUrl, hostId: socket.id });
    }
  });

  // 3. RAVE SENKRONİZASYONU (BAŞLAT/DURDUR)
  socket.on('play_video', ({ partyId, time }) => {
    if (rooms[partyId] && rooms[partyId].hostId === socket.id) {
      socket.to(partyId).emit('command_play', time);
    }
  });

  socket.on('pause_video', ({ partyId }) => {
    if (rooms[partyId] && rooms[partyId].hostId === socket.id) {
      socket.to(partyId).emit('command_pause');
    }
  });

  // 4. SOHBET (CHAT) SİSTEMİ
  socket.on('send_message', ({ partyId, sender, text }) => {
    io.to(partyId).emit('receive_message', { sender, text, time: new Date().toLocaleTimeString() });
  });

  // 5. ÇIKIŞ
  socket.on('disconnect', () => {
    for (const partyId in rooms) {
      rooms[partyId].users = rooms[partyId].users.filter(u => u.id !== socket.id);
      if (rooms[partyId].users.length === 0) {
        delete rooms[partyId];
      } else if (rooms[partyId].hostId === socket.id) {
        rooms[partyId].hostId = rooms[partyId].users[0].id; // Başkan çıkarsa yetkiyi sıradakine devret
        io.to(partyId).emit('room_state', rooms[partyId]);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server ${PORT} aktif!`));