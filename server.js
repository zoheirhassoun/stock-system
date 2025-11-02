const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد قاعدة البيانات
// Database setup
const dbPath = path.join(__dirname, 'database', 'inventory.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات / Database connection error:', err.message);
        process.exit(1);
    }
    console.log('✅ تم الاتصال بقاعدة البيانات / Connected to database');
});

// إعداد الأمان
// Security setup
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"],
            mediaSrc: ["'self'", "blob:"]
        }
    }
}));

// إعداد معدل الطلبات
// Rate limiting
// في بيئة التطوير: تعطيل rate limiting أو استخدام حد مرتفع جداً
// In development: Disable rate limiting or use very high limit
const isDevelopment = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة / 15 minutes
    max: isDevelopment ? 10000 : 500, // حد مرتفع جداً في التطوير / Very high limit in development
    message: {
        error: 'تم تجاوز الحد الأقصى للطلبات / Too many requests',
        message: 'يرجى المحاولة لاحقاً / Please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // في بيئة التطوير: تخطي rate limiting بشكل كامل تقريباً
    // In development: Skip rate limiting almost completely
    skip: (req) => {
        // في التطوير: تخطي جميع الطلبات من localhost
        // In development: Skip all requests from localhost
        if (isDevelopment && (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1')) {
            return true;
        }
        
        // تخطي الملفات الثابتة
        // Skip static files
        if (req.path.startsWith('/css/') || 
            req.path.startsWith('/js/') || 
            req.path.startsWith('/images/') ||
            req.path.startsWith('/fonts/') ||
            req.path.endsWith('.css') ||
            req.path.endsWith('.js') ||
            req.path.endsWith('.png') ||
            req.path.endsWith('.jpg') ||
            req.path.endsWith('.jpeg') ||
            req.path.endsWith('.gif') ||
            req.path.endsWith('.svg') ||
            req.path.endsWith('.ico') ||
            req.path.endsWith('.woff') ||
            req.path.endsWith('.woff2') ||
            req.path.endsWith('.ttf')) {
            return true;
        }
        return false;
    }
});

// تطبيق rate limiter فقط على API routes في الإنتاج
// Apply rate limiter only to API routes in production
if (!isDevelopment) {
    app.use('/api', limiter);
}

// إعداد CORS
// CORS setup
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || 
    (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']);

app.use(cors({
    origin: (origin, callback) => {
        // السماح بطلبات بدون origin (مثل Postman أو تطبيقات موبايل)
        // Allow requests without origin (like Postman or mobile apps)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('غير مسموح به من قبل CORS / Not allowed by CORS'));
        }
    },
    credentials: true
}));

// إعداد معالجة البيانات
// Body parsing setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// إعداد الملفات الثابتة
// Static files setup
app.use(express.static(path.join(__dirname, 'frontend')));

// إضافة قاعدة البيانات إلى req
// Add database to req
app.use((req, res, next) => {
    req.db = db;
    next();
});

// مسارات API
// API routes
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/devices', require('./backend/routes/devices'));
app.use('/api/inventory', require('./backend/routes/inventory'));
app.use('/api/admin', require('./backend/routes/admin'));
app.use('/api/reports', require('./backend/routes/reports'));

// الصفحة الرئيسية
// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// صفحة الموظفين
// Employee page
app.get('/employee', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'employee', 'index.html'));
});

// صفحة المدير
// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

// معالجة الأخطاء 404
// 404 error handler
app.use((req, res) => {
    res.status(404).json({
        error: 'الصفحة غير موجودة / Page not found',
        message: 'المسار المطلوب غير متاح / Requested path not available'
    });
});

// معالجة الأخطاء العامة
// General error handler
app.use((err, req, res, next) => {
    console.error('❌ خطأ في الخادم / Server error:', err.stack);
    
    res.status(err.status || 500).json({
        error: 'خطأ في الخادم / Server error',
        message: process.env.NODE_ENV === 'production' ? 
            'حدث خطأ غير متوقع / An unexpected error occurred' : 
            err.message
    });
});

// بدء الخادم
// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 نظام إدارة المخزون المحمول / Mobile Inventory System');
    console.log(`✅ الخادم يعمل على المنفذ / Server running on port: ${PORT}`);
    console.log(`🌐 الرابط المحلي / Local URL: http://localhost:${PORT}`);
    console.log(`👥 صفحة الموظفين / Employee page: http://localhost:${PORT}/employee`);
    console.log(`🔧 لوحة المدير / Admin panel: http://localhost:${PORT}/admin`);
    console.log('');
    console.log('📱 للوصول من الهاتف المحمول / For mobile access:');
    console.log('   تأكد من أن الجهاز متصل بنفس الشبكة / Ensure device is on same network');
    console.log('   استخدم عنوان IP الخاص بالكمبيوتر / Use computer\'s IP address');
});

// إغلاق قاعدة البيانات عند إيقاف الخادم
// Close database when server stops
process.on('SIGINT', () => {
    console.log('\n⚠️  إيقاف الخادم... / Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('❌ خطأ في إغلاق قاعدة البيانات / Error closing database:', err.message);
        } else {
            console.log('✅ تم إغلاق قاعدة البيانات / Database closed');
        }
        process.exit(0);
    });
});

module.exports = app;