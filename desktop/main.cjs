'use strict';

const path = require('path');
const net = require('net');
const { app, BrowserWindow, dialog } = require('electron');

let mainWindow;
let localServer;

function freePort(start = 3210) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', error => {
      if (error.code === 'EADDRINUSE') resolve(freePort(start + 1));
      else reject(error);
    });
    probe.listen(start, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function start() {
  const port = await freePort();
  process.env.ARCADI_DESKTOP = '1';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.NO_OPEN = '1';
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'dades');

  const { applyStartupCopy } = require('../startup-copy.js');
  applyStartupCopy();
  localServer = require('../server.js').server;
  applyStartupCopy();
  await new Promise((resolve, reject) => {
    if (localServer.listening) return resolve();
    localServer.once('listening', resolve);
    localServer.once('error', reject);
  });

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: 'ARCADI GESTIO RESTAURANT',
    backgroundColor: '#f4eee3',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(start).catch(error => {
  dialog.showErrorBox('ARCADI GESTIO RESTAURANT', `No s'ha pogut iniciar el programa.\n\n${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (localServer?.listening) localServer.close();
});

