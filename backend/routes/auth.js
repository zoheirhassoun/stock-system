const express = require('express');
const router = express.Router();
const { 
    generateToken, 
    verifyToken, 
    hashPassword, 
    comparePassword, 
    logActivity, 
    checkLoginAttempts,
    createNotification 
} = require('../middleware/auth');

// تسجيل الدخول
// Login endpoint
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // التحقق من البيانات المطلوبة
    // Validate required fields
    if (!username || !password) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'اسم المستخدم وكلمة المرور مطلوبان / Username and password are required'
        });
    }

    try {
        // التحقق من محاولات تسجيل الدخول
        // Check login attempts
        checkLoginAttempts(req.db, username, async (err, attempts) => {
            if (err) {
                console.error('خطأ في التحقق من المحاولات / Error checking attempts:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء التحقق / Error during verification'
                });
            }

            if (attempts >= 5) {
                logActivity(req.db, null, 'blocked_login', null, null, null, { username, reason: 'too_many_attempts' }, req);
                return res.status(429).json({
                    error: 'تم حظر الحساب مؤقتاً / Account temporarily blocked',
                    message: 'تم تجاوز عدد المحاولات المسموح / Too many login attempts'
                });
            }

            // البحث عن المستخدم
            // Find user
            const query = 'SELECT * FROM users WHERE username = ? AND is_active = 1';
            req.db.get(query, [username], async (err, user) => {
                if (err) {
                    console.error('خطأ في قاعدة البيانات / Database error:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ في قاعدة البيانات / Database error occurred'
                    });
                }

                if (!user) {
                    logActivity(req.db, null, 'failed_login', null, null, null, { username, reason: 'user_not_found' }, req);
                    return res.status(401).json({
                        error: 'بيانات خاطئة / Invalid credentials',
                        message: 'اسم المستخدم أو كلمة المرور غير صحيحة / Invalid username or password'
                    });
                }

                // التحقق من كلمة المرور
                // Verify password
                const isValidPassword = await comparePassword(password, user.password_hash);
                
                if (!isValidPassword) {
                    logActivity(req.db, user.id, 'failed_login', null, null, null, { username, reason: 'wrong_password' }, req);
                    return res.status(401).json({
                        error: 'بيانات خاطئة / Invalid credentials',
                        message: 'اسم المستخدم أو كلمة المرور غير صحيحة / Invalid username or password'
                    });
                }

                // إنشاء الرمز المميز
                // Generate token
                const token = generateToken(user);

                // تسجيل نجاح تسجيل الدخول
                // Log successful login
                logActivity(req.db, user.id, 'successful_login', null, null, null, { username }, req);

                // إنشاء إشعار
                // Create notification
                createNotification(req.db, user.id, 'تسجيل دخول جديد / New Login', 
                    `تم تسجيل الدخول بنجاح في ${new Date().toLocaleString('ar-SA')} / Successfully logged in at ${new Date().toLocaleString()}`, 
                    'success');

                // إرسال الاستجابة
                // Send response
                res.json({
                    success: true,
                    message: 'تم تسجيل الدخول بنجاح / Login successful',
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        full_name: user.full_name,
                        email: user.email,
                        role: user.role,
                        department: user.department
                    }
                });
            });
        });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول / Login error:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء تسجيل الدخول / Error during login'
        });
    }
});

// تسجيل الخروج
// Logout endpoint
router.post('/logout', verifyToken, (req, res) => {
    try {
        // تسجيل تسجيل الخروج
        // Log logout
        logActivity(req.db, req.user.id, 'logout', null, null, null, { username: req.user.username }, req);

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح / Logout successful'
        });
    } catch (error) {
        console.error('خطأ في تسجيل الخروج / Logout error:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء تسجيل الخروج / Error during logout'
        });
    }
});

// التحقق من الرمز المميز
// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
    try {
        // الحصول على بيانات المستخدم المحدثة
        // Get updated user data
        const query = 'SELECT id, username, full_name, email, role, department FROM users WHERE id = ? AND is_active = 1';
        req.db.get(query, [req.user.id], (err, user) => {
            if (err) {
                console.error('خطأ في قاعدة البيانات / Database error:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ في قاعدة البيانات / Database error occurred'
                });
            }

            if (!user) {
                return res.status(401).json({
                    error: 'مستخدم غير موجود / User not found',
                    message: 'المستخدم غير موجود أو غير نشط / User not found or inactive'
                });
            }

            res.json({
                success: true,
                user: user
            });
        });
    } catch (error) {
        console.error('خطأ في التحقق / Verification error:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء التحقق / Error during verification'
        });
    }
});

// تغيير كلمة المرور
// Change password endpoint
router.post('/change-password', verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // التحقق من البيانات المطلوبة
    // Validate required fields
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'كلمة المرور الحالية والجديدة مطلوبتان / Current and new passwords are required'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            error: 'كلمة مرور ضعيفة / Weak password',
            message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters'
        });
    }

    try {
        // الحصول على بيانات المستخدم
        // Get user data
        const query = 'SELECT * FROM users WHERE id = ?';
        req.db.get(query, [req.user.id], async (err, user) => {
            if (err) {
                console.error('خطأ في قاعدة البيانات / Database error:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ في قاعدة البيانات / Database error occurred'
                });
            }

            if (!user) {
                return res.status(404).json({
                    error: 'مستخدم غير موجود / User not found',
                    message: 'المستخدم غير موجود / User not found'
                });
            }

            // التحقق من كلمة المرور الحالية
            // Verify current password
            const isValidPassword = await comparePassword(currentPassword, user.password_hash);
            
            if (!isValidPassword) {
                logActivity(req.db, user.id, 'failed_password_change', null, null, null, { reason: 'wrong_current_password' }, req);
                return res.status(401).json({
                    error: 'كلمة مرور خاطئة / Wrong password',
                    message: 'كلمة المرور الحالية غير صحيحة / Current password is incorrect'
                });
            }

            // تشفير كلمة المرور الجديدة
            // Hash new password
            const hashedNewPassword = await hashPassword(newPassword);

            // تحديث كلمة المرور
            // Update password
            const updateQuery = 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            req.db.run(updateQuery, [hashedNewPassword, user.id], function(err) {
                if (err) {
                    console.error('خطأ في تحديث كلمة المرور / Password update error:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء تحديث كلمة المرور / Error updating password'
                    });
                }

                // تسجيل تغيير كلمة المرور
                // Log password change
                logActivity(req.db, user.id, 'password_changed', 'users', user.id, null, null, req);

                // إنشاء إشعار
                // Create notification
                createNotification(req.db, user.id, 'تم تغيير كلمة المرور / Password Changed', 
                    'تم تغيير كلمة المرور بنجاح / Password changed successfully', 'success');

                res.json({
                    success: true,
                    message: 'تم تغيير كلمة المرور بنجاح / Password changed successfully'
                });
            });
        });
    } catch (error) {
        console.error('خطأ في تغيير كلمة المرور / Password change error:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء تغيير كلمة المرور / Error changing password'
        });
    }
});

module.exports = router;