const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();
const redisClient = require('./config/redis'); // فایل اتصال به Redis
const connectDB = require('./config/db');  // فایل اتصال به MongoDB
const { sendToQueue } = require('./rabbitmq');

// مدل‌های MongoDB
const User = require('./models/User');
const Message = require('./models/Message');
const Group = require('./models/Group');
const GroupMessage = require('./models/GroupMessage');

// اتصال به MongoDB
connectDB();

// اتصال به Redis
(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (err) {
        console.error('Could not connect to Redis', err);
        process.exit(1); // پایان برنامه در صورت عدم موفقیت
    }
})();

// ایجاد اپلیکیشن Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.json());
app.use(express.json());

// مسیرهای API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoutes'));

// Socket.io
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // پیوستن به گروه
    socket.on('join_group', async (groupId) => {
        socket.join(groupId);
        console.log(`User ${socket.id} joined group ${groupId}`);
    });

    // ارسال پیام خصوصی
    socket.on('send_message', async (data) => {
        const { senderId, receiverId, content } = data;
        const message = new Message({ senderId, receiverId, content });
        await message.save();
        io.to(receiverId).emit('receive_message', message);
    });

    // ارسال پیام به گروه
    socket.on('send_group_message', async (data) => {
        const { groupId, senderId, content } = data;
        const groupMessage = new GroupMessage({ groupId, senderId, content });
        await groupMessage.save();
        io.to(groupId).emit('receive_group_message', groupMessage);
    });

    // ایجاد گروه
    socket.on('create_group', async (data) => {
        const { name, members } = data;
        const group = new Group({ name, members });
        await group.save();
        console.log('Group created:', group);
    });

    // مدیریت دسترسی
    socket.on('manage_permissions', async (data) => {
        const { groupId, userId, role } = data;
        const group = await Group.findById(groupId);
        if (group) {
            const permissionIndex = group.permissions.findIndex(p => p.userId.toString() === userId.toString());
            if (permissionIndex >= 0) {
                group.permissions[permissionIndex].role = role;
            } else {
                group.permissions.push({ userId, role });
            }
            await group.save();
            io.to(groupId).emit('permissions_updated', group);
            console.log('Permissions updated for group:', group);
        }
    });

    // قطع اتصال
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// پورت سرور
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});