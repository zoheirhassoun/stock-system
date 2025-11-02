const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, hashPassword, logActivity, createNotification } = require('../middleware/auth');

// الحصول على جميع المستخدمين
// Get all users
router.get('/users', verifyToken, verifyAdmin, (req, res) => {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT id, username, full_name, email, phone, role, department, is_active, created_at, updated_at
        FROM users
        WHERE 1=1
    `;
    
    const params = [];

    if (search) {
        query += ` AND (full_name LIKE ? OR username LIKE ? OR email LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (role) {
        query += ` AND role = ?`;
        params.push(role);
    }

    query += ` ORDER BY full_name LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    req.db.all(query, params, (err, users) => {
        if (err) {
            console.error('خطأ في جلب المستخدمين / Error fetching users:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب المستخدمين / Error fetching users'
            });
        }

        // عد إجمالي المستخدمين
        // Count total users
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];

        if (search) {
            countQuery += ` AND (full_name LIKE ? OR username LIKE ? OR email LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (role) {
            countQuery += ` AND role = ?`;
            countParams.push(role);
        }

        req.db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('خطأ في عد المستخدمين / Error counting users:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء عد المستخدمين / Error counting users'
                });
            }

            res.json({
                success: true,
                users: users,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult.total / limit),
                    total_items: countResult.total,
                    items_per_page: parseInt(limit)
                }
            });
        });
    });
});

// الحصول على مستخدم بواسطة ID
// Get user by ID
router.get('/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;

    req.db.get('SELECT id, username, full_name, email, phone, role, department, is_active, created_at, updated_at FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('❌ خطأ في جلب المستخدم / Error fetching user:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب المستخدم / Error fetching user',
                details: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
        }

        if (!user) {
            return res.status(404).json({
                error: 'مستخدم غير موجود / User not found',
                message: 'المستخدم غير موجود في النظام / User not found in system'
            });
        }

        res.json({
            success: true,
            user: user
        });
    });
});

// إضافة مستخدم جديد
// Add new user
router.post('/users', verifyToken, verifyAdmin, async (req, res) => {
    const {
        username,
        password,
        full_name,
        email,
        phone,
        role = 'employee',
        department
    } = req.body;

    // التحقق من البيانات المطلوبة
    // Validate required fields
    if (!username || !password || !full_name) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'اسم المستخدم وكلمة المرور والاسم الكامل مطلوبان / Username, password, and full name are required'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: 'كلمة مرور ضعيفة / Weak password',
            message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters'
        });
    }

    if (!['employee', 'admin'].includes(role)) {
        return res.status(400).json({
            error: 'دور غير صالح / Invalid role',
            message: 'الدور يجب أن يكون موظف أو مدير / Role must be employee or admin'
        });
    }

    try {
        // التحقق من عدم تكرار اسم المستخدم
        // Check for duplicate username
        req.db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existingUser) => {
            if (err) {
                console.error('خطأ في التحقق من اسم المستخدم / Error checking username:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء التحقق من اسم المستخدم / Error checking username'
                });
            }

            if (existingUser) {
                return res.status(409).json({
                    error: 'اسم مستخدم مكرر / Duplicate username',
                    message: 'اسم المستخدم موجود مسبقاً / Username already exists'
                });
            }

            // تشفير كلمة المرور
            // Hash password
            const hashedPassword = await hashPassword(password);

            // إدراج المستخدم الجديد
            // Insert new user
            const insertQuery = `
                INSERT INTO users (username, password_hash, full_name, email, phone, role, department)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            req.db.run(insertQuery, [
                username, hashedPassword, full_name, email, phone, role, department
            ], function(err) {
                if (err) {
                    console.error('خطأ في إضافة المستخدم / Error adding user:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء إضافة المستخدم / Error adding user'
                    });
                }

                const userId = this.lastID;

                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'user_created', 'users', userId, null, {
                    username, full_name, role, department
                }, req);

                // إنشاء إشعار للمستخدم الجديد
                // Create notification for new user
                createNotification(req.db, userId, 'مرحباً بك / Welcome', 
                    `تم إنشاء حسابك بنجاح في نظام إدارة المخزون / Your account has been created successfully in the inventory system`, 'success');

                res.status(201).json({
                    success: true,
                    message: 'تم إضافة المستخدم بنجاح / User added successfully',
                    user_id: userId
                });
            });
        });
    } catch (error) {
        console.error('خطأ في إضافة المستخدم / Error adding user:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء إضافة المستخدم / Error adding user'
        });
    }
});

// تحديث مستخدم
// Update user
router.put('/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const {
        full_name,
        email,
        phone,
        role,
        department,
        is_active
    } = req.body;

    // التحقق من عدم تعديل المدير الرئيسي
    // Prevent modifying main admin
    if (parseInt(id) === 1) {
        return res.status(403).json({
            error: 'غير مسموح / Not allowed',
            message: 'لا يمكن تعديل المدير الرئيسي / Cannot modify main admin'
        });
    }

    // الحصول على البيانات الحالية
    // Get current data
    req.db.get('SELECT * FROM users WHERE id = ?', [id], (err, oldUser) => {
        if (err) {
            console.error('خطأ في جلب المستخدم / Error fetching user:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب المستخدم / Error fetching user'
            });
        }

        if (!oldUser) {
            return res.status(404).json({
                error: 'مستخدم غير موجود / User not found',
                message: 'المستخدم غير موجود / User not found'
            });
        }

        // تحديث المستخدم
        // Update user
        const updateQuery = `
            UPDATE users SET
                full_name = COALESCE(?, full_name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                role = COALESCE(?, role),
                department = COALESCE(?, department),
                is_active = COALESCE(?, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        req.db.run(updateQuery, [
            full_name, email, phone, role, department, is_active, id
        ], function(err) {
            if (err) {
                console.error('خطأ في تحديث المستخدم / Error updating user:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء تحديث المستخدم / Error updating user'
                });
            }

            // تسجيل النشاط
            // Log activity
            logActivity(req.db, req.user.id, 'user_updated', 'users', id, oldUser, req.body, req);

            // إنشاء إشعار للمستخدم
            // Create notification for user
            createNotification(req.db, id, 'تم تحديث الحساب / Account Updated', 
                'تم تحديث بيانات حسابك من قبل المدير / Your account has been updated by admin', 'info');

            res.json({
                success: true,
                message: 'تم تحديث المستخدم بنجاح / User updated successfully'
            });
        });
    });
});

// حذف مستخدم
// Delete user
router.delete('/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;

    // التحقق من عدم حذف المدير الرئيسي
    // Prevent deleting main admin
    if (parseInt(id) === 1) {
        return res.status(403).json({
            error: 'غير مسموح / Not allowed',
            message: 'لا يمكن حذف المدير الرئيسي / Cannot delete main admin'
        });
    }

    // التحقق من عدم حذف النفس
    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
        return res.status(403).json({
            error: 'غير مسموح / Not allowed',
            message: 'لا يمكن حذف حسابك الخاص / Cannot delete your own account'
        });
    }

    // التحقق من وجود عمليات مرتبطة
    // Check for related operations
    req.db.get('SELECT COUNT(*) as count FROM inventory_operations WHERE user_id = ?', [id], (err, result) => {
        if (err) {
            console.error('خطأ في التحقق من العمليات / Error checking operations:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء التحقق من العمليات / Error checking operations'
            });
        }

        if (result.count > 0) {
            return res.status(409).json({
                error: 'لا يمكن الحذف / Cannot delete',
                message: 'لا يمكن حذف المستخدم لوجود عمليات مرتبطة به / Cannot delete user with related operations'
            });
        }

        // الحصول على بيانات المستخدم قبل الحذف
        // Get user data before deletion
        req.db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
            if (err) {
                console.error('خطأ في جلب المستخدم / Error fetching user:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء جلب المستخدم / Error fetching user'
                });
            }

            if (!user) {
                return res.status(404).json({
                    error: 'مستخدم غير موجود / User not found',
                    message: 'المستخدم غير موجود / User not found'
                });
            }

            // حذف المستخدم
            // Delete user
            req.db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('خطأ في حذف المستخدم / Error deleting user:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء حذف المستخدم / Error deleting user'
                    });
                }

                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'user_deleted', 'users', id, user, null, req);

                res.json({
                    success: true,
                    message: 'تم حذف المستخدم بنجاح / User deleted successfully'
                });
            });
        });
    });
});

// إعادة تعيين كلمة المرور
// Reset password
router.post('/users/:id/reset-password', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
        return res.status(400).json({
            error: 'كلمة مرور غير صالحة / Invalid password',
            message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters'
        });
    }

    try {
        // الحصول على بيانات المستخدم
        // Get user data
        req.db.get('SELECT * FROM users WHERE id = ?', [id], async (err, user) => {
            if (err) {
                console.error('خطأ في جلب المستخدم / Error fetching user:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء جلب المستخدم / Error fetching user'
                });
            }

            if (!user) {
                return res.status(404).json({
                    error: 'مستخدم غير موجود / User not found',
                    message: 'المستخدم غير موجود / User not found'
                });
            }

            // تشفير كلمة المرور الجديدة
            // Hash new password
            const hashedPassword = await hashPassword(new_password);

            // تحديث كلمة المرور
            // Update password
            const updateQuery = 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            req.db.run(updateQuery, [hashedPassword, id], function(err) {
                if (err) {
                    console.error('خطأ في إعادة تعيين كلمة المرور / Error resetting password:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء إعادة تعيين كلمة المرور / Error resetting password'
                    });
                }

                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'password_reset', 'users', id, null, { target_user: user.username }, req);

                // إنشاء إشعار للمستخدم
                // Create notification for user
                createNotification(req.db, id, 'تم إعادة تعيين كلمة المرور / Password Reset', 
                    'تم إعادة تعيين كلمة المرور الخاصة بك من قبل المدير / Your password has been reset by admin', 'warning');

                res.json({
                    success: true,
                    message: 'تم إعادة تعيين كلمة المرور بنجاح / Password reset successfully'
                });
            });
        });
    } catch (error) {
        console.error('خطأ في إعادة تعيين كلمة المرور / Error resetting password:', error);
        res.status(500).json({
            error: 'خطأ في الخادم / Server error',
            message: 'حدث خطأ أثناء إعادة تعيين كلمة المرور / Error resetting password'
        });
    }
});

// الحصول على سجل النشاطات
// Get activity log
router.get('/activity-log', verifyToken, verifyAdmin, (req, res) => {
    const { page = 1, limit = 50, user_id, action, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT al.*, u.full_name as user_name, u.username
        FROM activity_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `;
    
    const params = [];

    if (user_id) {
        query += ` AND al.user_id = ?`;
        params.push(user_id);
    }

    if (action) {
        query += ` AND al.action LIKE ?`;
        params.push(`%${action}%`);
    }

    if (date_from) {
        query += ` AND DATE(al.created_at) >= ?`;
        params.push(date_from);
    }

    if (date_to) {
        query += ` AND DATE(al.created_at) <= ?`;
        params.push(date_to);
    }

    query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    req.db.all(query, params, (err, activities) => {
        if (err) {
            console.error('خطأ في جلب سجل النشاطات / Error fetching activity log:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب سجل النشاطات / Error fetching activity log'
            });
        }

        // عد إجمالي النشاطات
        // Count total activities
        let countQuery = 'SELECT COUNT(*) as total FROM activity_log WHERE 1=1';
        const countParams = [];

        if (user_id) {
            countQuery += ` AND user_id = ?`;
            countParams.push(user_id);
        }

        if (action) {
            countQuery += ` AND action LIKE ?`;
            countParams.push(`%${action}%`);
        }

        if (date_from) {
            countQuery += ` AND DATE(created_at) >= ?`;
            countParams.push(date_from);
        }

        if (date_to) {
            countQuery += ` AND DATE(created_at) <= ?`;
            countParams.push(date_to);
        }

        req.db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('خطأ في عد النشاطات / Error counting activities:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء عد النشاطات / Error counting activities'
                });
            }

            res.json({
                success: true,
                activities: activities,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(countResult.total / limit),
                    total_items: countResult.total,
                    items_per_page: parseInt(limit)
                }
            });
        });
    });
});

// الحصول على الإشعارات
// Get notifications
router.get('/notifications', verifyToken, (req, res) => {
    const { page = 1, limit = 20, is_read } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT * FROM notifications 
        WHERE user_id = ?
    `;
    
    const params = [req.user.id];

    if (is_read !== undefined) {
        query += ` AND is_read = ?`;
        params.push(is_read === 'true' ? 1 : 0);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    req.db.all(query, params, (err, notifications) => {
        if (err) {
            console.error('خطأ في جلب الإشعارات / Error fetching notifications:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب الإشعارات / Error fetching notifications'
            });
        }

        res.json({
            success: true,
            notifications: notifications
        });
    });
});

// تحديد الإشعار كمقروء
// Mark notification as read
router.put('/notifications/:id/read', verifyToken, (req, res) => {
    const { id } = req.params;

    req.db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id], function(err) {
        if (err) {
            console.error('خطأ في تحديث الإشعار / Error updating notification:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء تحديث الإشعار / Error updating notification'
            });
        }

        res.json({
            success: true,
            message: 'تم تحديث الإشعار / Notification updated'
        });
    });
});

module.exports = router;