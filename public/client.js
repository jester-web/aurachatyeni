// public/client.js
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // WebRTC ile ilgili değişkenler
    let localStream;
    const peerConnections = {}; // { remoteSocketId: RTCPeerConnection }
    // Ses analizi için değişkenler
    let audioContext;
    let analyser;
    let speakingInterval;
    let mySocketId; // Mevcut istemcinin socket ID'sini saklamak için
    let isVoiceChatActive = false;
    let myUsername = ''; // Kendi kullanıcı adımızı saklamak için
    let isMuted = false; // Mute durumunu takip etmek için

    // HTML elementleri
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const nameInput = document.getElementById('name-input');
    const joinButton = document.getElementById('join-button');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');
    const userList = document.getElementById('user-list');
    const remoteAudiosContainer = document.getElementById('remote-audios'); // Uzak sesler için yeni kapsayıcı
    const toggleVoiceButton = document.getElementById('toggle-voice-button'); // Yeni düğme
    const toggleMuteButton = document.getElementById('toggle-mute-button'); // Mute düğmesi
    
    // Sohbete katılma
    joinButton.addEventListener('click', () => {
        const username = nameInput.value.trim();
        if (username) {
            myUsername = username; // Kullanıcı adını değişkene ata
            socket.emit('join chat', username);
            authContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContainer.style.display = 'flex'; // Flexbox'ı yeniden etkinleştir
            input.focus();
        }
    });

    // Bağlandıktan sonra kendi socket ID'mi sakla
    socket.on('connect', () => {
        mySocketId = socket.id;
    });
    
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinButton.click();
        }
    });

    // Mesaj gönderme
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            socket.emit('chat message', input.value);
            input.value = '';
        }
    });

    // Sunucudan mesaj alma
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        
        if (data.user === 'System') {
            item.classList.add('system');
            item.textContent = data.text;
        } else {
            item.innerHTML = `<strong>${data.user}</strong>${data.text}`;
            if (data.user === myUsername) {
                item.classList.add('own-message'); // Kendi mesajımızsa sınıf ekle
            }
        }
        
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight; // Otomatik aşağı kaydır
    });

    // Online kullanıcı listesini güncelleme
    // `onlineUsersMap` artık bir obje olacak: { socketId: username }
    socket.on('update user list', (onlineUsersMap) => {
        socket.onlineUsersMap = onlineUsersMap; // WebRTC mantığı için haritayı sakla
        userList.innerHTML = ''; // Listeyi temizle
        const currentOnlineUsers = Object.keys(peerConnections); // Şu anda peer bağlantısı olan kullanıcılar
        const newOnlineUsers = Object.keys(onlineUsersMap); // Şu anda çevrimiçi olan tüm kullanıcılar

        // Yeni kullanıcıları listeye ekle ve potansiyel olarak WebRTC bağlantılarını başlat
        newOnlineUsers.forEach(socketId => {
            if (socketId === mySocketId) {
                // Kendimizi de listeye ekleyelim ama farklı bir şekilde
                const item = document.createElement('li');
                item.textContent = `${onlineUsersMap[socketId]} (You)`;
                item.dataset.socketId = socketId;
                userList.appendChild(item);
                return;
            };

            const item = document.createElement('li');
            item.textContent = onlineUsersMap[socketId];
            item.dataset.socketId = socketId; // Konuşmacı göstergesi için ID ekle
            userList.appendChild(item);

            // Sesli sohbet aktifse ve bu yeni kullanıcıyla bağlantımız yoksa, bir bağlantı oluştur
            if (isVoiceChatActive && !peerConnections[socketId]) {
                console.log(`Yeni kullanıcı ${onlineUsersMap[socketId]} (${socketId}) katıldı. WebRTC bağlantısı başlatılıyor.`);
                createPeerConnection(socketId, true); // true çünkü biz aramayı başlatan tarafız
            }
        });

        // Ayrılan kullanıcıları peerConnections'dan ve ses öğelerinden kaldır
        currentOnlineUsers.forEach(socketId => {
            if (!newOnlineUsers.includes(socketId)) {
                console.log(`Kullanıcı ${onlineUsersMap[socketId] || socketId} ayrıldı. WebRTC bağlantısı kapatılıyor.`);
                if (peerConnections[socketId]) {
                    peerConnections[socketId].close();
                    delete peerConnections[socketId];
                }
                const audioEl = document.getElementById(`audio-${socketId}`);
                if (audioEl) {
                    audioEl.remove();
                }
            }
        });
    });

    // --- WebRTC Mantığı ---

    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }, // Google'ın genel STUN sunucuları
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    };

    toggleVoiceButton.addEventListener('click', toggleVoiceChat);
    toggleMuteButton.addEventListener('click', toggleMute);

    async function toggleVoiceChat() {
        if (!isVoiceChatActive) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                isVoiceChatActive = true;
                toggleVoiceButton.textContent = 'Stop Voice';
                toggleVoiceButton.style.backgroundColor = '#dc3545'; // Durdurmak için kırmızı renk
                toggleMuteButton.classList.remove('hidden'); // Mute düğmesini göster

                // Konuşma algılamayı başlat
                setupAudioAnalysis(localStream);

                // Şu anda çevrimiçi olan her kullanıcı için (kendimiz hariç) bir peer bağlantısı oluştur
                const currentOnlineUsersMap = socket.onlineUsersMap || {};
                for (const remoteSocketId in currentOnlineUsersMap) {
                    if (remoteSocketId !== mySocketId) {
                        createPeerConnection(remoteSocketId, true); // true çünkü biz aramayı başlatan tarafız
                    }
                }

            } catch (err) {
                console.error('Mikrofona erişim hatası:', err);
                alert('Mikrofon erişimi reddedildi veya kullanılamıyor.');
                isVoiceChatActive = false;
                toggleVoiceButton.textContent = 'Start Voice';
                toggleVoiceButton.style.backgroundColor = '#007bff';
            }
        } else {
            stopVoiceChat();
        }
    }

    function stopVoiceChat() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        // Ses analizi kaynaklarını temizle
        if (speakingInterval) clearInterval(speakingInterval);
        if (audioContext) audioContext.close();
        socket.emit('speaking', false); // Durduğumuzda haber ver
        
        // Mute düğmesini gizle ve sıfırla
        isMuted = false;
        toggleMuteButton.classList.add('hidden');
        toggleMuteButton.textContent = 'Mute';

        for (const socketId in peerConnections) {
            if (peerConnections[socketId]) {
                peerConnections[socketId].close();
                delete peerConnections[socketId];
            }
            const audioEl = document.getElementById(`audio-${socketId}`);
            if (audioEl) {
                audioEl.remove();
            }
        }
        isVoiceChatActive = false;
        toggleVoiceButton.textContent = 'Start Voice';
        toggleVoiceButton.style.backgroundColor = '#007bff';
        console.log('Sesli sohbet durduruldu.');
    }

    function toggleMute() {
        if (!localStream) return;

        isMuted = !isMuted;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !isMuted;
        }

        toggleMuteButton.textContent = isMuted ? 'Unmute' : 'Mute';

        // Eğer kullanıcı kendini sessize aldıysa, konuşma durumunu 'false' olarak gönder
        if (isMuted) socket.emit('speaking', false);
    }

    async function createPeerConnection(remoteSocketId, isInitiator) {
        console.log(`PeerConnection oluşturuluyor: ${remoteSocketId}, başlatan: ${isInitiator}`);
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[remoteSocketId] = pc;

        // Yerel ses akışını peer bağlantısına ekle
        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', { candidate: event.candidate, targetSocketId: remoteSocketId });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Uzak izleyici ${remoteSocketId} adresinden alındı`);
            const remoteAudio = document.createElement('audio');
            remoteAudio.id = `audio-${remoteSocketId}`;
            remoteAudio.autoplay = true;
            remoteAudio.srcObject = event.streams[0];
            remoteAudiosContainer.appendChild(remoteAudio);
        };

        if (isInitiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('webrtc-offer', { offer: pc.localDescription, targetSocketId: remoteSocketId });
                } catch (err) {
                    console.error('Teklif oluşturulurken hata:', err);
                }
            };
        }
        return pc;
    }

    // WebRTC Sinyalizasyon Dinleyicileri
    socket.on('webrtc-offer', async ({ offer, senderSocketId }) => {
        console.log(`Teklif alındı: ${senderSocketId}`);
        let pc = peerConnections[senderSocketId];
        if (!pc) {
            pc = await createPeerConnection(senderSocketId, false); // false çünkü biz aramayı başlatan taraf değiliz
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { answer: pc.localDescription, targetSocketId: senderSocketId });
    });

    socket.on('webrtc-answer', async ({ answer, senderSocketId }) => {
        console.log(`Cevap alındı: ${senderSocketId}`);
        const pc = peerConnections[senderSocketId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } else {
            console.warn(`Cevabı ayarlamak için ${senderSocketId} için PeerConnection bulunamadı.`);
        }
    });

    socket.on('webrtc-ice-candidate', async ({ candidate, senderSocketId }) => {
        // console.log(`ICE adayı alındı: ${senderSocketId}`); // Çok fazla log olmaması için yorum satırı yapıldı
        const pc = peerConnections[senderSocketId];
        if (pc && candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('Alınan ICE adayı eklenirken hata:', e);
            }
        } else {
            console.warn(`ICE adayı eklemek için ${senderSocketId} için PeerConnection bulunamadı.`);
        }
    });

    // --- Konuşmacı Göstergesi Mantığı ---

    function setupAudioAnalysis(stream) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 512;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let isCurrentlySpeaking = false;

        speakingInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            let sum = dataArray.reduce((a, b) => a + b, 0);
            let average = sum / bufferLength;

            // Eşik değeri (deneyerek ayarlanabilir)
            const speakingThreshold = 20; 

            // Kullanıcı kendini sessize almadıysa ve ses seviyesi eşiği aştıysa
            if (!isMuted && average > speakingThreshold && !isCurrentlySpeaking) {
                isCurrentlySpeaking = true;
                socket.emit('speaking', true);
                updateSpeakingIndicator(mySocketId, true);
            } else if ((isMuted || average <= speakingThreshold) && isCurrentlySpeaking) {
                isCurrentlySpeaking = false;
                socket.emit('speaking', false);
                updateSpeakingIndicator(mySocketId, false);
            }
        }, 200); // Her 200ms'de bir kontrol et
    }

    function updateSpeakingIndicator(socketId, isSpeaking) {
        const userListItem = document.querySelector(`li[data-socket-id="${socketId}"]`);
        if (userListItem) {
            if (isSpeaking) {
                userListItem.classList.add('speaking');
            } else {
                userListItem.classList.remove('speaking');
            }
        }
    }

    socket.on('user-speaking', ({ socketId, isSpeaking }) => {
        updateSpeakingIndicator(socketId, isSpeaking);
    });
});
