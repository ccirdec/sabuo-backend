// index.js
const express = require('express');
const midtransClient = require('midtrans-client');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- KONFIGURASI FIREBASE ADMIN ---
// Unduh file serviceAccountKey.json dari Project Settings > Service accounts di Firebase
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- KONFIGURASI MIDTRANS ---
const snap = new midtransClient.Snap({
    isProduction: false, // Set ke true jika sudah live
    serverKey: process.env.MIDTRANS_SERVER_KEY, 
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// --- ENDPOINT UNTUK MEMBUAT TRANSAKSI QRIS ---
app.post('/create-transaction', async (req, res) => {
    try {
        const { orderId, totalPrice, items, customerDetails } = req.body;

        const parameter = {
            "payment_type": "qris",
            "transaction_details": {
                "order_id": orderId, // ID pesanan yang unik
                "gross_amount": totalPrice
            },
            "item_details": items,
            "customer_details": customerDetails
        };

        const transaction = await snap.createTransaction(parameter);
        res.status(200).json(transaction);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- ENDPOINT UNTUK MENERIMA NOTIFIKASI PEMBAYARAN (WEBHOOK) ---
app.post('/payment-notification', async (req, res) => {
    try {
        const notificationJson = req.body;
        const statusResponse = await snap.transaction.notification(notificationJson);
        
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`Transaksi ID ${orderId}: ${transactionStatus}`);

        if (transactionStatus == 'capture' || transactionStatus == 'settlement') {
            if (fraudStatus == 'accept') {
                // Pembayaran berhasil! Update status pesanan di Firestore.
                const orderRef = db.collection('orders').doc(orderId);
                await orderRef.update({ status: 'Dikemas' });
                
                // Di sini juga tempatnya untuk mengurangi stok barang
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});