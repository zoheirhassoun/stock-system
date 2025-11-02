const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// مفتاح JWT السري
// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'inventory_system_secret_key_2024';

// إنشاء رمز JWT
// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// التحقق من رمز JWT
// Verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.cookies?.token;

    if (!token) {
        return res.status(401).json({
            error: 'غير مصرح / Unauthorized',
            message: 'يرجى تسجيل الدخول / Please login'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            error: 'رمز غير صالح / Invalid token',
            message: 'يرجى تسجيل الدخول مرة أخرى / Please login again'
        });
    }
};

// التحقق من صلاحية المدير
// Verify admin role
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'غير مصرح / Forbidden',
            message: 'صلاحيات المدير مطلوبة / Admin privileges required'
        });
    }
    next();
};

// التحقق من صلاحية الموظف أو المدير
// Verify employee or admin role
const verifyEmployee = (req, res, next) => {
    if (req.user.role !== 'employee' && req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'غير مصرح / Forbidden',
            message: 'صلاحيات الموظف مطلوبة / Employee privileges required'
        });
    }
    next();
};

// تشفير كلمة المرور
// Hash password
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};

// مقارنة كلمة المرور
// Compare password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// تسجيل النشاط
// Log activity
const logActivity = (db, userId, action, tableName = null, recordId = null, oldValues = null, newValues = null, req = null) => {
    const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
    const userAgent = req ? req.get('User-Agent') : null;

    const query = `
        INSERT INTO activity_log (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [
        userId,
        action,
        tableName,
        recordId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent
    ], (err) => {
        if (err) {
            console.error('خطأ في تسجيل النشاط / Error logging activity:', err.message);
        }
    });
};

// التحقق من محاولات تسجيل الدخول
// Check login attempts
const checkLoginAttempts = (db, username, callback) => {
    const query = `
        SELECT COUNT(*) as attempts 
        FROM activity_log 
        WHERE action = 'failed_login' 
        AND new_values LIKE ? 
        AND created_at > datetime('now', '-1 hour')
    `;

    db.get(query, [`%${username}%`], (err, row) => {
        if (err) {
            return callback(err, null);
        }
        callback(null, row.attempts);
    });
};

// إنشاء إشعار
// Create notification
const createNotification = (db, userId, title, message, type = 'info') => {
    const query = `
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, ?, ?, ?)
    `;

    db.run(query, [userId, title, message, type], (err) => {
        if (err) {
            console.error('خطأ في إنشاء الإشعار / Error creating notification:', err.message);
        }
    });
};

module.exports = {
    generateToken,
    verifyToken,
    verifyAdmin,
    verifyEmployee,
    hashPassword,
    comparePassword,
    logActivity,
    checkLoginAttempts,
    createNotification,
    JWT_SECRET
};