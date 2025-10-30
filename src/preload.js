const { contextBridge, ipcRenderer } = require('electron');

// 'contextBridge' kullanarak ana dünya (renderer süreci) ile güvenli bir şekilde
// API'ler paylaşıyoruz. Bu, contextIsolation etkinleştirildiğinde en iyi pratiktir.
contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer'dan Main'e tek yönlü iletişim için
  send: (channel, data) => {
    // İzin verilen kanalları burada beyaz listeye alabilirsiniz
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Main'den Renderer'a tek yönlü iletişim için
  on: (channel, func) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      // Orijinal ipcRenderer.on'dan farklı olarak, event argümanını kaldırarak
      // sadece veriyi gönderiyoruz.
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});