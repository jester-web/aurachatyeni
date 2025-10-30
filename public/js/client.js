// public/client.js
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // WebRTC ile ilgili değişkenler
    let localStream;
    let localVideoStream;
    let localScreenStream;
    const peerConnections = {}; // { remoteSocketId: RTCPeerConnection }
    // Ses analizi için değişkenler
    let audioContext;
    let analyser;
    let speakingInterval;
    let mySocketId; // Mevcut istemcinin socket ID'sini saklamak için
    let isVoiceChatActive = false;
    let myUsername = ''; // Kendi kullanıcı adımızı saklamak için
    let isMuted = false; // Mute durumunu takip etmek için
    // Yazma göstergesi için değişkenler
    let typingTimer;
    const typingTimeout = 1500; // 1.5 saniye

    // HTML elementleri
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const nameInput = document.getElementById('name-input');
    const avatarUrlInput = document.getElementById('avatar-url-input');
    const joinButton = document.getElementById('join-button');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');
    const userList = document.getElementById('user-list');
    const remoteAudiosContainer = document.getElementById('remote-audios'); // Uzak sesler için yeni kapsayıcı
    const videoGrid = document.getElementById('video-grid'); // Ekran paylaşımları için yeni kapsayıcı
    const typingIndicator = document.getElementById('typing-indicator'); // Yazma göstergesi
    const toggleVoiceButton = document.getElementById('toggle-voice-button'); // Yeni düğme
    const toggleVideoButton = document.getElementById('toggle-video-button'); // Video düğmesi
    const toggleScreenButton = document.getElementById('toggle-screen-button'); // Ekran paylaşma düğmesi
    const toggleMuteButton = document.getElementById('toggle-mute-button'); // Mute düğmesi
    const themeToggleButton = document.getElementById('theme-toggle-button');
    
    // Sohbete katılma
    joinButton.addEventListener('click', () => {
        const username = nameInput.value.trim();
        const avatarUrl = avatarUrlInput.value.trim();
        if (username) {
            myUsername = username; // Kullanıcı adını değişkene ata
            // Sunucuya kullanıcı adı ve avatar URL'sini bir obje olarak gönder
            socket.emit('join chat', { username, avatarUrl });
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
        const message = input.value;
        if (message) {
            // Özel mesaj komutunu kontrol et: /w username message
            if (message.startsWith('/w ')) {
                const parts = message.split(' ');
                const recipientUsername = parts[1];
                const privateMessage = parts.slice(2).join(' ');
                if (recipientUsername && privateMessage) {
                    socket.emit('private message', { recipientUsername, message: privateMessage });
                }
            } else {
            socket.emit('chat message', input.value);
            }
            input.value = '';
        }
    });

    // Sunucudan mesaj alma
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        
        if (data.user === 'System') {
            item.classList.add('system');
            item.textContent = data.text;
        } else if (data.type === 'private') {
            item.classList.add('private-message');
            const direction = data.user === myUsername ? `to ${data.recipient}` : `from ${data.user}`;
            item.innerHTML = `
                <div class="message-content">
                    <strong>Whisper ${direction}</strong>
                    <span>${data.text}</span>
                </div>`;
        } else {
            // Varsayılan avatar
            const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NkY2RjZCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgMyAwIDEuNjYtMS4zNCAzLTMgMy0xLjY2IDAtMy0xLjM0LTMtMyAwLTEuNjYgMS4zNC0zIDMtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHM1Ljk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==';
            const avatarSrc = data.avatarUrl || data.avatarURL || defaultAvatar;
            const timestamp = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <img src="${avatarSrc}" class="avatar" alt="${data.user}" onerror="this.src='${defaultAvatar}'">
                <div class="message-content">
                    <div class="message-header"><strong>${data.username || data.user}</strong><span class="timestamp">${timestamp}</span></div>
                    <span>${data.text}</span>
                </div>`;
            if ((data.username || data.user) === myUsername) {
                item.classList.add('own-message'); // Kendi mesajımızsa sınıf ekle
            }
        }
        
        messages.prepend(item); // Mesajları üste ekle (CSS ile ters çevrildiği için altta görünecek)
        // messages.scrollTop = messages.scrollHeight; // Artık buna gerek yok
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
                const userData = onlineUsersMap[socketId];
                const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NkY2RjZCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgMyAwIDEuNjYtMS4zNCAzLTMgMy0xLjgeIDAtMy0xLjM0LTMtMyAwLTEuNjYgMS4zNC0zIDMtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHM1Ljk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==';
                const avatarSrc = userData.avatarUrl || defaultAvatar;
                const item = document.createElement('li');
                item.innerHTML = `<img src="${avatarSrc}" class="avatar" onerror="this.src='${defaultAvatar}'"> <span>${userData.username} (You)</span>`;
                item.dataset.socketId = socketId;
                userList.appendChild(item);
                return;
            };

            const userData = onlineUsersMap[socketId];
            const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NkY2RjZCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgMyAwIDEuNjYtMS4zNCAzLTMgMy0xLjY2IDAtMy0xLjM0LTMtMyAwLTEuNjYgMS4zNC0zIDMtM3ptMCAxNC4yYy0yLjUgMC00LjcxLTEuMjgtNi0zLjIyLjAzLTEuOTkgNC0zLjA4IDYtMy4wOHM1Ljk3IDEuMDkgNiAzLjA4Yy0xLjI5IDEuOTQtMy41IDMuMjItNiAzLjIyeiIvPjwvc3ZnPg==';
            const avatarSrc = userData.avatarUrl || defaultAvatar;
            const item = document.createElement('li');
            item.innerHTML = `<img src="${avatarSrc}" class="avatar" onerror="this.src='${defaultAvatar}'"> <span>${userData.username}</span>`;
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
    themeToggleButton.addEventListener('click', toggleTheme);
    toggleVideoButton.addEventListener('click', toggleVideo);
    toggleScreenButton.addEventListener('click', toggleScreenShare);

    async function toggleVoiceChat() {
        if (!isVoiceChatActive) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                isVoiceChatActive = true;
                toggleVoiceButton.textContent = 'Stop Voice';
                toggleVoiceButton.style.backgroundColor = '#dc3545'; // Durdurmak için kırmızı renk
                toggleVideoButton.classList.remove('hidden');
                toggleScreenButton.classList.remove('hidden'); // Ekran paylaşma düğmesini göster
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
        toggleVideoButton.classList.add('hidden');
        toggleScreenButton.classList.add('hidden');

        if (localScreenStream) {
            stopScreenSharing();
        }

        if (localVideoStream) {
            stopVideo();
        }

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

    async function toggleVideo() {
        if (!localVideoStream) {
            try {
                localVideoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                
                // Kendi videomuzu gride ekle
                addLocalVideo(localVideoStream);

                // Videoyu tüm peer'lara ekle
                for (const socketId in peerConnections) {
                    const sender = peerConnections[socketId].addTrack(localVideoStream.getVideoTracks()[0], localVideoStream);
                    peerConnections[socketId].videoSender = sender;
                }
                toggleVideoButton.textContent = 'Stop Video';
            } catch (err) {
                console.error('Video alınamadı:', err);
                localVideoStream = null;
            }
        } else {
            stopVideo();
        }
    }

    function stopVideo() {
        if (!localVideoStream) return;

        // Tüm peer'lardan video track'i kaldır
        for (const socketId in peerConnections) {
            const pc = peerConnections[socketId];
            if (pc.videoSender) {
                pc.removeTrack(pc.videoSender);
                delete pc.videoSender;
            }
        }

        localVideoStream.getTracks().forEach(track => track.stop());
        localVideoStream = null;
        toggleVideoButton.textContent = 'Start Video';

        // Yerel video elementini kaldır
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.remove();
        }
    }

    async function toggleScreenShare() {
        if (!localScreenStream) {
            try {
                localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                
                // Ekran paylaşımını tüm peer'lara ekle
                for (const socketId in peerConnections) {
                    const sender = peerConnections[socketId].addTrack(localScreenStream.getVideoTracks()[0], localScreenStream);
                    // Sender'ı saklayarak daha sonra removeTrack yapabiliriz.
                    peerConnections[socketId].screenSender = sender;
                }

                // Kullanıcı tarayıcı arayüzünden paylaşımı durdurduğunda
                localScreenStream.getVideoTracks()[0].onended = () => {
                    stopScreenSharing();
                };

                toggleScreenButton.textContent = 'Stop Sharing';
            } catch (err) {
                console.error('Ekran paylaşılamadı:', err);
                localScreenStream = null;
            }
        } else {
            stopScreenSharing();
        }
    }

    function stopScreenSharing() {
        if (!localScreenStream) return;

        // Tüm peer'lardan track'i kaldır
        for (const socketId in peerConnections) {
            const pc = peerConnections[socketId];
            if (pc.screenSender) {
                pc.removeTrack(pc.screenSender);
                delete pc.screenSender;
            }
        }

        localScreenStream.getTracks().forEach(track => track.stop());
        localScreenStream = null;
        toggleScreenButton.textContent = 'Share Screen';

        // Diğerlerine paylaşımın bittiğini haber ver
        socket.emit('stop-screen-share');
    }


    async function createPeerConnection(remoteSocketId, isInitiator) {
        console.log(`PeerConnection oluşturuluyor: ${remoteSocketId}, başlatan: ${isInitiator}`);
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[remoteSocketId] = pc;

        // Yerel ses akışını peer bağlantısına ekle
        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }
        // Eğer video zaten aktifse, yeni katılan kullanıcıya da gönder
        if (localVideoStream) {
            const sender = pc.addTrack(localVideoStream.getVideoTracks()[0], localVideoStream);
            pc.videoSender = sender;
        }
        // Eğer ekran paylaşımı zaten aktifse, yeni katılan kullanıcıya da gönder
        if (localScreenStream) {
            const sender = pc.addTrack(localScreenStream.getVideoTracks()[0], localScreenStream);
            pc.screenSender = sender;
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', { candidate: event.candidate, targetSocketId: remoteSocketId });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Uzak izleyici ${remoteSocketId} adresinden alındı`);
            if (event.track.kind === 'audio') {
                const remoteAudio = document.createElement('audio');
                remoteAudio.id = `audio-${remoteSocketId}`;
                remoteAudio.autoplay = true;
                remoteAudio.srcObject = event.streams[0];
                remoteAudiosContainer.appendChild(remoteAudio);
            } else if (event.track.kind === 'video') {
                // Gelen video akışının kendi ekran paylaşımımız olup olmadığını kontrol et
                // Eğer öyleyse, gösterme (zaten yerel olarak gösteriliyor olabilir)
                if (localScreenStream && event.streams[0].id === localScreenStream.id) {
                    return;
                }
                if (localVideoStream && event.streams[0].id === localVideoStream.id) {
                    return;
                }

                const videoWrapper = document.createElement('div');
                videoWrapper.className = 'video-wrapper';
                videoWrapper.id = `video-${remoteSocketId}`;
                const remoteVideo = document.createElement('video');
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true; // iOS için önemli
                remoteVideo.srcObject = event.streams[0];
                const nameLabel = document.createElement('div');
                nameLabel.className = 'video-label';
                nameLabel.textContent = socket.onlineUsersMap[remoteSocketId]?.username || 'User';
                videoWrapper.append(remoteVideo, nameLabel);
                videoGrid.appendChild(videoWrapper);
            }
        };

        // Peer bağlantısı kapandığında video elementini kaldır
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                const videoWrapper = document.getElementById(`video-${remoteSocketId}`);
                if (videoWrapper) {
                    videoWrapper.remove();
                }
                const audioEl = document.getElementById(`audio-${remoteSocketId}`);
                if (audioEl) {
                    audioEl.remove();
                }
                delete peerConnections[remoteSocketId];
            }
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

    function addLocalVideo(stream) {
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper local-video';
        videoWrapper.id = 'local-video';
        const localVideo = document.createElement('video');
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        localVideo.muted = true; // Kendi sesimizi duymamak için
        localVideo.srcObject = stream;
        const nameLabel = document.createElement('div');
        nameLabel.className = 'video-label';
        nameLabel.textContent = `${myUsername} (You)`;
        videoWrapper.append(localVideo, nameLabel);
        videoGrid.prepend(videoWrapper); // Kendi videomuzu başa ekle
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

    // Bir kullanıcı ekran paylaşımını durdurduğunda
    socket.on('user-stopped-sharing', ({ socketId }) => {
        const videoWrapper = document.getElementById(`video-${socketId}`);
        if (videoWrapper) {
            videoWrapper.remove();
        }
    });

    // --- Emoji Seçici Mantığı ---
    const emojiButton = document.getElementById('emoji-button');
    let emojiPicker;

    emojiButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!emojiPicker) {
            emojiPicker = document.createElement('emoji-picker');
            document.body.appendChild(emojiPicker);
            emojiPicker.addEventListener('emoji-click', e => {
                input.value += e.detail.unicode;
            });
            emojiPicker.classList.add('light'); // Veya 'dark'
            emojiPicker.style.position = 'absolute';
            emojiPicker.style.bottom = '80px';
            emojiPicker.style.right = '20px';
        }
        emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        if (emojiPicker) {
            emojiPicker.classList.add('hidden');
        }
    });

    // --- Kullanıcı Yazıyor Mantığı ---
    input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        socket.emit('typing');
        typingTimer = setTimeout(() => socket.emit('stop_typing'), typingTimeout);
    });

    socket.on('user_is_typing', ({ username }) => typingIndicator.textContent = `${username} yazıyor...`);
    socket.on('user_stopped_typing', () => typingIndicator.textContent = '');

    // --- Tema Değiştirme Mantığı ---
    function toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDarkMode = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }

    // Sayfa yüklendiğinde kayıtlı temayı uygula
    (function applySavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    })();

});
