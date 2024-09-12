const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
    },
    otp: String,
    otpExpires: Date,
    name: String,
    profile: String
});

module.exports = mongoose.model('User', userSchema);