const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Odaları ve şifrelerini tutacağımız dev veritabanımız
const rooms = {};

// Sadece aktif odaları dışarıya (lobiye) veren fonksiyon
function getActiveRooms() {
  const active = [];
  for (const [id, room] of Object.entries(rooms)) {
    if (room.users.length > 0) {
      active.push({ id, userCount: room.users.length, hasPassword: !!room.password });
    }
  }
  return active;
}

io.on('connection', (socket) => {
  // Lobiye ilk girenlere odaları göster
  socket.emit('active_rooms', getActiveRooms());

  // 1. ODA KURMA VEYA KATILMA (ŞİFRE KONTROLLÜ)
  socket.on('join_party', ({ partyId, username, password }) => {
    if (rooms[partyId]) {
      // Oda zaten varsa ŞİFREYİ kontrol et
      if (rooms[partyId].password && rooms[partyId].password !== password) {
        socket.emit('join_error', "❌ Yanlış şifre! Giremezsin.");
        return;
      }
    } else {
      // Oda yoksa YENİ ODA KUR
      rooms[partyId] = {
        password: password || "",
        hostId: socket.id,
        videoUrl: "https://www.youtube.com/watch?v=DzMrabVqiJE",
        users: []
      };
    }

    // Odaya alım işlemleri
    socket.join(partyId);
    rooms[partyId].users.push({ id: socket.id, name: username });
    socket.partyId = partyId; // Çıkışta bulabilmek için

    socket.emit('join_success', { partyId });

    // Odadakilere güncel listeyi yolla
    io.to(partyId).emit('room_state', {
      videoUrl: rooms[partyId].videoUrl,
      hostId: rooms[partyId].hostId,
      users: rooms[partyId].users
    });

    // LOBİDEKİLERE YENİ ODAYI DUYUR
    io.emit('active_rooms', getActiveRooms());
  });

  // 2. VİDEO VE SOHBET SENKRONİZASYONU
  socket.on('change_video', ({ partyId, videoUrl }) => {
    if (rooms[partyId] && rooms[partyId].hostId === socket.id) {
      rooms[partyId].videoUrl = videoUrl;
      io.to(partyId).emit('video_changed', { videoUrl, hostId: socket.id });
    }
  });

  socket.on('play_video', ({ partyId, time }) => socket.to(partyId).emit('command_play', time));
  socket.on('pause_video', ({ partyId }) => socket.to(partyId).emit('command_pause'));
  socket.on('send_message', (data) => io.to(data.partyId).emit('receive_message', data));

  // 3. WEBRTC (EKRAN PAYLAŞIMI)
  socket.on('webrtc_offer', ({ partyId, offer }) => socket.to(partyId).emit('webrtc_offer', { offer, senderId: socket.id }));
  socket.on('webrtc_answer', ({ partyId, answer }) => socket.to(partyId).emit('webrtc_answer', { answer, senderId: socket.id }));
  socket.on('webrtc_ice', ({ partyId, candidate }) => socket.to(partyId).emit('webrtc_ice', { candidate, senderId: socket.id }));

  // 4. BAĞLANTI KOPUNCA (Oda boşalırsa sil)
  socket.on('disconnect', () => {
    const partyId = socket.partyId;
    if (partyId && rooms[partyId]) {
      rooms[partyId].users = rooms[partyId].users.filter(u => u.id !== socket.id);
      
      if (rooms[partyId].users.length === 0) {
        delete rooms[partyId]; // Oda boşaldı, yok et
      } else {
        if (rooms[partyId].hostId === socket.id) {
          rooms[partyId].hostId = rooms[partyId].users[0].id; // Yetkiyi devret
        }
        io.to(partyId).emit('room_state', {
          videoUrl: rooms[partyId].videoUrl,
          hostId: rooms[partyId].hostId,
          users: rooms[partyId].users
        });
      }
      io.emit('active_rooms', getActiveRooms()); // Lobiye güncel halini yolla
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Sunucu aktif: ${PORT}`));
