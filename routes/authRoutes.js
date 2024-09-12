const express = require('express');
const router = express.Router();
const { register, sendOtp, loginWithOtp } = require('../controllers/authController');

router.post('/register', register);
router.post('/send-otp', sendOtp);
router.post('/login-otp', loginWithOtp);

module.exports = router;