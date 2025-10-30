// Gerekli modülleri içe aktar
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Ana pencereyi tutacak olan değişken
let mainWindow;

function createWindow() {
  // Yeni bir tarayıcı penceresi oluştur
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Ön yükleme betiği, renderer sürecine Node.js API'lerini güvenli bir şekilde sunar
      preload: path.join(__dirname, 'preload.js'),
      // nodeIntegration'ı kapatmak ve contextIsolation'ı açmak güvenlik için önemlidir.
      nodeIntegration: false, // false olmalı
      contextIsolation: true, // true olmalı
    },
  });

  // Pencereye yüklenecek HTML dosyası.
  // Artık 'public' klasöründeki doğru yolu işaret ediyoruz.
  mainWindow.loadFile(path.join(__dirname, '../public/index.html'));

  // Geliştirici araçlarını açmak için bu satırı kullanabilirsiniz
  // mainWindow.webContents.openDevTools();
}

// Bu metod, Electron başlatıldığında ve tarayıcı pencerelerini
// oluşturmaya hazır olduğunda çağrılır.
app.whenReady().then(() => {
  createWindow();

  // macOS'te, dock ikonuna tıklandığında ve başka pencere açık değilse
  // yeni bir pencere oluştur.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Tüm pencereler kapatıldığında uygulamadan çık (macOS hariç).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});