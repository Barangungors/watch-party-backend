// Render Backend Kodun (index.js veya server.js)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// AĞ VERİTABANI: Odaları ve şifreleri burada tutacağız
const activeRooms = {}; 

// Sadece güvenli bilgileri (şifresiz hallerini) lobiye göndermek için filtre
function getPublicRooms() {
  const publicRooms = [];
  for (const [roomId, roomData] of Object.entries(activeRooms)) {
    publicRooms.push({
      id: roomId,
      userCount: roomData.users.length,
      isLocked: !!roomData.password // Şifre varsa true, yoksa false döner
    });
  }
  return publicRooms;
}

io.on('connection', (socket) => {
  console.log(`Yeni Ajan Bağlandı: ${socket.id}`);

  // 1. Yeni bağlanana aktif odaları (Radarı) gönder
  socket.emit('active_rooms_update', getPublicRooms());

  // 2. Odaya Katılma ve Şifre Kontrolü
  socket.on('join_party', (data) => {
    const { partyId, username, password } = data;

    // Oda yoksa YENİ ODA KUR (Kuran kişi Host/Kral olur)
    if (!activeRooms[partyId]) {
      activeRooms[partyId] = {
        password: password || null,
        hostId: socket.id,
        users: []
      };
    } else {
      // Oda varsa ŞİFRE KONTROLÜ YAP
      if (activeRooms[partyId].password && activeRooms[partyId].password !== password) {
        socket.emit('room_error', 'Erişim Reddedildi: Yanlış Şifre!');
        return;
      }
    }

    // Ajanı odaya ekle
    socket.join(partyId);
    activeRooms[partyId].users.push({ id: socket.id, name: username });
    
    // Odaya başarıyla girildiğini bildir
    socket.emit('room_joined', partyId);

    // Odadakileri güncelle
    io.to(partyId).emit('room_state', {
      hostId: activeRooms[partyId].hostId,
      users: activeRooms[partyId].users
    });

    // Lobideki herkese "Yeni oda açıldı/Kişi katıldı" bilgisini gönder
    io.emit('active_rooms_update', getPublicRooms());
  });

  // 3. Mesajlaşma
  socket.on('send_message', (data) => {
    io.to(data.partyId).emit('receive_message', { sender: data.sender, text: data.text });
  });

  // 4. Video Kontrolleri
  socket.on('play_video', (data) => {
    socket.to(data.partyId).emit('command_play', data.time);
  });
  
  socket.on('pause_video', (data) => {
    socket.to(data.partyId).emit('command_pause');
  });

  // 5. Bağlantı Kopması (Çıkış)
  socket.on('disconnect', () => {
    for (const roomId in activeRooms) {
      const room = activeRooms[roomId];
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1); // Kullanıcıyı sil
        
        if (room.users.length === 0) {
          delete activeRooms[roomId]; // Oda boşaldıysa odayı sil
        } else if (room.hostId === socket.id) {
          room.hostId = room.users[0].id; // Kral çıktıysa, sıradakini Kral yap
        }
        
        // Kalanlara ve lobiye güncel durumu bildir
        io.to(roomId).emit('room_state', { hostId: room?.hostId, users: room?.users || [] });
        io.emit('active_rooms_update', getPublicRooms());
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`Siber Sunucu Port ${PORT} Üzerinde Aktif!`); });
