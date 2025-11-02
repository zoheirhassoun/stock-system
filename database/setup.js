const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// إنشاء مجلد قاعدة البيانات إذا لم يكن موجوداً
// Create database directory if it doesn't exist
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, 'inventory.db');
const schemaPath = path.join(__dirname, 'schema.sql');

console.log('🚀 بدء إعداد قاعدة البيانات... / Starting database setup...');

// قراءة ملف SQL
// Read SQL file
const schema = fs.readFileSync(schemaPath, 'utf8');

// إنشاء قاعدة البيانات
// Create database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ خطأ في إنشاء قاعدة البيانات / Error creating database:', err.message);
        process.exit(1);
    }
    console.log('✅ تم الاتصال بقاعدة البيانات / Connected to database');
});

// تنفيذ الاستعلامات
// Execute queries
db.exec(schema, (err) => {
    if (err) {
        console.error('❌ خطأ في تنفيذ الاستعلامات / Error executing queries:', err.message);
        process.exit(1);
    }
    
    console.log('✅ تم إنشاء الجداول بنجاح / Tables created successfully');
    
    // التحقق من البيانات
    // Verify data
    db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row) => {
        if (err) {
            console.error('❌ خطأ في التحقق من البيانات / Error verifying data:', err.message);
        } else {
            console.log(`✅ تم إنشاء ${row.count} مدير / Created ${row.count} admin(s)`);
        }
        
        db.get("SELECT COUNT(*) as count FROM devices", (err, row) => {
            if (err) {
                console.error('❌ خطأ في التحقق من الأجهزة / Error verifying devices:', err.message);
            } else {
                console.log(`✅ تم إنشاء ${row.count} جهاز تجريبي / Created ${row.count} sample device(s)`);
            }
            
            // إغلاق الاتصال
            // Close connection
            db.close((err) => {
                if (err) {
                    console.error('❌ خطأ في إغلاق قاعدة البيانات / Error closing database:', err.message);
                } else {
                    console.log('🎉 تم إعداد قاعدة البيانات بنجاح! / Database setup completed successfully!');
                    console.log('📍 مسار قاعدة البيانات / Database path:', dbPath);
                    console.log('');
                    console.log('🔐 بيانات تسجيل الدخول الافتراضية / Default login credentials:');
                    console.log('   المدير / Admin: admin / password');
                    console.log('   الموظف / Employee: employee1 / password');
                }
            });
        });
    });
});

// معالجة الأخطاء
// Error handling
process.on('SIGINT', () => {
    console.log('\n⚠️  تم إيقاف العملية / Process interrupted');
    db.close();
    process.exit(0);
});