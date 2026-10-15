const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');

const app = express();
app.use(express.json());

// Independent Baileys gateway: prints QR, accepts send via HTTP
app.get('/status', (req, res) => res.json({ status: 'independent-baileys-local', mode: 'qr-ready' }));

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) console.log('SCAN QR:', qr);
        if (connection === 'open') console.log('Baileys connection open - WA gateway active');
        if (connection === 'close') console.log('Baileys connection close');
    });
    sock.ev.on('creds.update', saveCreds);
    console.log('Baileys gateway started - local QR mode');
}
start();

app.listen(4000, () => console.log('Gateway HTTP on 4000 - ready for Baileys QR session'));

