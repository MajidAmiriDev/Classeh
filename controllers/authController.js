const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const redisClient = require('../redis');
const { sendToQueue } = require('../rabbitmq');

// ثبت‌نام کاربر
exports.register = async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (user) {
            const eventData = { type: 'USER_REGISTERED', data: { error: 'User already exists' } };
            await sendToQueue('user_events', eventData);
            return res.status(400).json({ msg: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user = new User({ phone, password: hashedPassword });
        await user.save();
        const eventData = { type: 'USER_REGISTERED', data: { success: 'User registered successfully' } };
        await sendToQueue('user_events', eventData);
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        res.status(500).send('Server error');
    }
};

// ارسال کد OTP
exports.sendOtp = async (req, res) => {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `otp:${phone}`;
    const otpCooldownKey = `otpCooldown:${phone}`;
    const otpExpires = 10 * 60; // مدت زمان اعتبار کد OTP (10 دقیقه به ثانیه)
    const otpCooldown = 2 * 60; // مدت زمان معطلی (2 دقیقه به ثانیه)

    try {
        console.log('Received OTP request for phone - OTP:', phone + ' --- ' + otp);

        // بررسی اینکه آیا در 2 دقیقه اخیر کد ارسال شده است یا نه
        const cooldown = await redisClient.get(otpCooldownKey);

        if (cooldown) {
            console.log('Cooldown active, rejecting request');
            const eventData = { type: 'Cooldown_OTP', data: { error: 'Cooldown active, rejecting request' } };
            await sendToQueue('user_events', eventData);
            return res.status(400).json({ msg: 'کد قبلا ارسال شده، لطفا بعدا دوباره امتحان کنید' });
        }

        console.log('No cooldown, proceeding to check OTP');

        // بررسی اینکه آیا کد قبلی هنوز معتبر است یا نه
        const existingOtp = await redisClient.get(otpKey);

        if (!existingOtp) {
            console.log('No existing OTP, generating and sending new OTP');
            let eventData = { type: 'Cooldown_OTP', data: { error: 'No existing OTP, generating and sending new OTP' } };
            await sendToQueue('user_events', eventData);
            // ذخیره کد OTP و زمان انقضا در Redis
            await redisClient.setEx(otpKey, otpExpires, otp);
            await redisClient.setEx(otpCooldownKey, otpCooldown, '1');

            // ارسال کد OTP از طریق پیامک (مثلا با کاوه نگار)
            console.log(otp)
            // await axios.post('https://api.kavenegar.com/v1/your-api-key/sms/send', {
            //     receptor: phone,
            //     message: `Your OTP code is ${otp}`
            // });
            console.log('OTP sent successfully');
            eventData = { type: 'Cooldown_OTP', data: { error: 'OTP sent successfully' } };
            console.log('OTP sent successfully');
            return res.status(200).json({ msg: 'کد OTP ارسال شد' });
        } else {
            console.log('OTP already exists, rejecting request');
            eventData = { type: 'Cooldown_OTP', data: { error: 'OTP sent successfully' } };
            console.log('OTP already exists, rejecting request');
            return res.status(400).json({ msg: 'کد قبلا ارسال شده و هنوز معتبر است' });
        }
    } catch (err) {
        console.error('Error in sendOtp function:', err);
        res.status(500).json({ msg: 'Server error' });
    }
};
// ورود با OTP
exports.loginWithOtp = async (req, res) => {
    const { phone, otp } = req.body;
    const otpKey = `otp:${phone}`;
    const otpExpires = 10 * 60; // مدت زمان اعتبار کد OTP (10 دقیقه)

    try {
        const storedOtp = await redisClient.get(otpKey);
        console.log(storedOtp)
        if (!storedOtp) {
            console.log('OTP has expired or does not exist');
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        if (storedOtp !== otp) {
            console.log('Invalid OTP');
            return res.status(400).json({ msg: 'Invalid OTP' });
        }

        await redisClient.del(otpKey);

        let user = await User.findOne({ phone });
        if (!user) {
            user = new User({ phone });
            await user.save();
        }

        const payload = { userId: user._id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ token });
    } catch (err) {
        console.error('Error in loginWithOtp function:', err);
        res.status(500).send('Server error');
    }
};