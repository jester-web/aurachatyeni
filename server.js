// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Frontend dosyalarını sunmak için public klasörünü kullan
app.use(express.static('public'));

let onlineUsers = {}; // Online kullanıcıları saklamak için bir nesne

// Bir istemci bağlandığında çalışacak kod
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // Yeni kullanıcı katıldığında
    socket.on('join chat', ({ username, avatarUrl }) => {
        socket.userData = { username, avatarUrl }; // Kullanıcı verilerini sakla
        onlineUsers[socket.id] = { username, avatarUrl };
        console.log(`${username} sohbete katıldı.`);

        // Tüm istemcilere yeni kullanıcı listesini gönder
            io.emit('update user list', onlineUsers); // Artık {socketId: username} objesini gönderiyoruz

        // Yeni katılan kullanıcıya hoş geldin mesajı gönder
            socket.emit('chat message', { user: 'System', text: `Sohbete hoş geldin, ${username}!` });

        // Diğer kullanıcılara yeni birinin katıldığını bildir
            socket.broadcast.emit('chat message', { user: 'System', text: `${username} sohbete katıldı.` });
    });

    // Bir istemci mesaj gönderdiğinde
    socket.on('chat message', (msg) => {
        // Mesajı gönderen dahil tüm istemcilere yayınla
        io.emit('chat message', { user: socket.userData.username, avatarUrl: socket.userData.avatarUrl, text: msg, type: 'public' });
    });

    // Özel mesaj gönderme
    socket.on('private message', ({ recipientUsername, message }) => {
        const recipientSocket = Object.values(io.sockets.sockets).find(
            s => s.userData && s.userData.username === recipientUsername
        );

        if (recipientSocket) {
            // Gönderene ve alıcıya özel mesajı gönder
            recipientSocket.emit('chat message', { user: socket.userData.username, avatarUrl: socket.userData.avatarUrl, text: message, type: 'private', recipient: recipientUsername });
            socket.emit('chat message', { user: socket.userData.username, avatarUrl: socket.userData.avatarUrl, text: message, type: 'private', recipient: recipientUsername });
        } else {
            socket.emit('chat message', { user: 'System', text: `Kullanıcı bulunamadı: ${recipientUsername}` });
        }
    });

    // Bir istemci bağlantıyı kestiğinde
    socket.on('disconnect', () => {
        if (socket.userData) {
            console.log(`${socket.userData.username} ayrıldı.`);
            delete onlineUsers[socket.id];

            // Tüm istemcilere güncel kullanıcı listesini gönder
                io.emit('update user list', onlineUsers); // Artık {socketId: username} objesini gönderiyoruz

            // Diğer kullanıcılara ayrıldığını bildir
            io.emit('chat message', { user: 'System', text: `${socket.userData.username} sohbetten ayrıldı.` });
        }
    });

        // WebRTC Sinyalizasyon olayları
        socket.on('webrtc-offer', ({ offer, targetSocketId }) => {
            console.log(`Offer from ${socket.userData.username} (${socket.id}) to ${targetSocketId}`);
            socket.to(targetSocketId).emit('webrtc-offer', { offer, senderSocketId: socket.id });
        });

        socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
            console.log(`Answer from ${socket.userData.username} (${socket.id}) to ${targetSocketId}`);
            socket.to(targetSocketId).emit('webrtc-answer', { answer, senderSocketId: socket.id });
        });

        socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId }) => {
            // console.log(`ICE Candidate from ${socket.userData.username} (${socket.id}) to ${targetSocketId}`); // Çok fazla log olmaması için yorum satırı yapıldı
            socket.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, senderSocketId: socket.id });
        });

        // Konuşmacı göstergesi olayı
        socket.on('speaking', (isSpeaking) => {
            socket.broadcast.emit('user-speaking', { socketId: socket.id, isSpeaking });
        });

        // Ekran paylaşımını durdurma olayı
        socket.on('stop-screen-share', () => {
            socket.broadcast.emit('user-stopped-sharing', { socketId: socket.id });
        });

        // Kullanıcı yazıyor olayları
        socket.on('typing', () => {
            socket.broadcast.emit('user_is_typing', { username: socket.userData.username });
        });

        socket.on('stop_typing', () => {
            socket.broadcast.emit('user_stopped_typing', { username: socket.userData.username });
        });

});

server.listen(PORT, () => {
        console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
