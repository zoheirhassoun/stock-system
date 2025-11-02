-- نظام إدارة المخزون المحمول - قاعدة البيانات
-- Mobile Inventory System - Database Schema

-- جدول المستخدمين (الموظفين والمدراء)
-- Users table (Employees and Admins)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    role TEXT CHECK(role IN ('employee', 'admin')) DEFAULT 'employee',
    department VARCHAR(50),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول الأجهزة والمعدات
-- Devices and Equipment table
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    brand VARCHAR(50),
    model VARCHAR(50),
    serial_number VARCHAR(100),
    description TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    warranty_expiry DATE,
    location VARCHAR(100),
    status TEXT CHECK(status IN ('available', 'assigned', 'maintenance', 'damaged', 'disposed')) DEFAULT 'available',
    current_quantity INTEGER DEFAULT 1,
    minimum_quantity INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول عمليات المخزون (إضافة/سحب)
-- Inventory Operations table (Add/Remove)
CREATE TABLE IF NOT EXISTS inventory_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    operation_type TEXT CHECK(operation_type IN ('add', 'remove')) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    reason VARCHAR(255),
    notes TEXT,
    operation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    location VARCHAR(100),
    approved_by INTEGER,
    approval_date DATETIME,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- جدول تعيين الأجهزة للموظفين
-- Device Assignments table
CREATE TABLE IF NOT EXISTS device_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    assigned_to INTEGER NOT NULL,
    assigned_by INTEGER NOT NULL,
    assignment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_return_date DATE,
    actual_return_date DATETIME,
    assignment_reason VARCHAR(255),
    return_condition VARCHAR(100),
    notes TEXT,
    status TEXT CHECK(status IN ('active', 'returned', 'overdue')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
);

-- جدول سجل النشاطات
-- Activity Log table
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- جدول الإعدادات
-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول الإشعارات
-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('info', 'warning', 'error', 'success')) DEFAULT 'info',
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- إنشاء الفهارس لتحسين الأداء
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_barcode ON devices(barcode);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_inventory_operations_device_id ON inventory_operations(device_id);
CREATE INDEX IF NOT EXISTS idx_inventory_operations_user_id ON inventory_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_operations_date ON inventory_operations(operation_date);
CREATE INDEX IF NOT EXISTS idx_device_assignments_device_id ON device_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_assignments_assigned_to ON device_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- إدراج البيانات الأولية
-- Insert initial data

-- إدراج المدير الافتراضي
-- Insert default admin user
INSERT OR IGNORE INTO users (username, password_hash, full_name, email, role, is_active) 
VALUES ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'مدير النظام', 'admin@inventory.com', 'admin', 1);

-- إدراج موظف تجريبي
-- Insert test employee
INSERT OR IGNORE INTO users (username, password_hash, full_name, email, role, department, is_active) 
VALUES ('employee1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'أحمد محمد', 'ahmed@inventory.com', 'employee', 'تقنية المعلومات', 1);

-- إدراج الإعدادات الافتراضية
-- Insert default settings
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
('system_name', 'نظام إدارة المخزون المحمول', 'اسم النظام'),
('company_name', 'شركة المخزون المتقدم', 'اسم الشركة'),
('max_login_attempts', '5', 'عدد محاولات تسجيل الدخول القصوى'),
('session_timeout', '3600', 'مهلة انتهاء الجلسة بالثواني'),
('backup_frequency', 'daily', 'تكرار النسخ الاحتياطي'),
('notification_enabled', '1', 'تفعيل الإشعارات'),
('barcode_format', 'CODE128', 'تنسيق الرمز الشريطي الافتراضي');

-- إدراج أجهزة تجريبية
-- Insert sample devices
INSERT OR IGNORE INTO devices (barcode, device_name, device_type, brand, model, description, status, current_quantity) VALUES
('DEV001', 'لابتوب ديل', 'كمبيوتر محمول', 'Dell', 'Latitude 5520', 'لابتوب للعمل المكتبي', 'available', 5),
('DEV002', 'طابعة HP', 'طابعة', 'HP', 'LaserJet Pro', 'طابعة ليزر للمكتب', 'available', 3),
('DEV003', 'شاشة سامسونج', 'شاشة', 'Samsung', '24 inch LED', 'شاشة عرض للكمبيوتر', 'available', 10),
('DEV004', 'ماوس لوجيتك', 'ملحقات', 'Logitech', 'MX Master 3', 'ماوس لاسلكي', 'available', 20),
('DEV005', 'كيبورد مايكروسوفت', 'ملحقات', 'Microsoft', 'Ergonomic', 'لوحة مفاتيح مريحة', 'available', 15);