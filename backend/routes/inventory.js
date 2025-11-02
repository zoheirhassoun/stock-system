const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, verifyEmployee, logActivity, createNotification } = require('../middleware/auth');

// إضافة عملية مخزون جديدة
// Add new inventory operation
router.post('/operation', verifyToken, verifyEmployee, (req, res) => {
    const {
        device_id,
        barcode,
        operation_type,
        quantity = 1,
        reason,
        notes,
        location
    } = req.body;

    // التحقق من البيانات المطلوبة
    // Validate required fields
    if ((!device_id && !barcode) || !operation_type) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'معرف الجهاز أو الرمز الشريطي ونوع العملية مطلوبان / Device ID or barcode and operation type are required'
        });
    }

    if (!['add', 'remove'].includes(operation_type)) {
        return res.status(400).json({
            error: 'نوع عملية غير صالح / Invalid operation type',
            message: 'نوع العملية يجب أن يكون إضافة أو سحب / Operation type must be add or remove'
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            error: 'كمية غير صالحة / Invalid quantity',
            message: 'الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than zero'
        });
    }

    // البحث عن الجهاز
    // Find device
    let deviceQuery = 'SELECT * FROM devices WHERE ';
    let deviceParam;

    if (device_id) {
        deviceQuery += 'id = ?';
        deviceParam = device_id;
    } else {
        deviceQuery += 'barcode = ?';
        deviceParam = barcode;
    }

    req.db.get(deviceQuery, [deviceParam], (err, device) => {
        if (err) {
            console.error('❌ خطأ في البحث عن الجهاز / Error finding device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء البحث عن الجهاز / Error finding device',
                details: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
        }

        if (!device) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود في النظام / Device not found in system'
            });
        }

        // التحقق من الكمية المتاحة للسحب
        // Check available quantity for removal
        if (operation_type === 'remove') {
            const quantityQuery = `
                SELECT COALESCE(SUM(CASE WHEN operation_type = 'add' THEN quantity ELSE -quantity END), 0) as available_quantity
                FROM inventory_operations 
                WHERE device_id = ? AND status = 'approved'
            `;

            req.db.get(quantityQuery, [device.id], (err, result) => {
                if (err) {
                    console.error('❌ خطأ في حساب الكمية المتاحة / Error calculating available quantity:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء حساب الكمية المتاحة / Error calculating available quantity',
                        details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                    });
                }

                const availableQuantity = result.available_quantity + device.current_quantity;

                if (quantity > availableQuantity) {
                    return res.status(400).json({
                        error: 'كمية غير كافية / Insufficient quantity',
                        message: `الكمية المتاحة: ${availableQuantity} / Available quantity: ${availableQuantity}`
                    });
                }

                // إنشاء العملية
                // Create operation
                createOperation();
            });
        } else {
            // إنشاء العملية مباشرة للإضافة
            // Create operation directly for addition
            createOperation();
        }

        function createOperation() {
            const insertQuery = `
                INSERT INTO inventory_operations (
                    device_id, user_id, operation_type, quantity, reason, notes, location
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            req.db.run(insertQuery, [
                device.id, req.user.id, operation_type, quantity, reason, notes, location
            ], function(err) {
                if (err) {
                    console.error('❌ خطأ في إنشاء العملية / Error creating operation:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء إنشاء العملية / Error creating operation',
                        details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                    });
                }

                const operationId = this.lastID;

                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'inventory_operation_created', 'inventory_operations', operationId, null, {
                    device_name: device.device_name,
                    barcode: device.barcode,
                    operation_type,
                    quantity,
                    reason
                }, req);

                // إنشاء إشعار للمدراء
                // Create notification for admins
                const adminNotificationQuery = 'SELECT id FROM users WHERE role = "admin" AND is_active = 1';
                req.db.all(adminNotificationQuery, [], (err, admins) => {
                    if (!err && admins.length > 0) {
                        admins.forEach(admin => {
                            const operationText = operation_type === 'add' ? 'إضافة' : 'سحب';
                            const operationTextEn = operation_type === 'add' ? 'Addition' : 'Removal';
                            
                            createNotification(req.db, admin.id, 
                                `عملية ${operationText} جديدة / New ${operationTextEn} Operation`,
                                `${req.user.full_name} قام بعملية ${operationText} للجهاز ${device.device_name} / ${req.user.full_name} performed ${operationTextEn.toLowerCase()} operation for ${device.device_name}`,
                                'info'
                            );
                        });
                    }
                });

                res.status(201).json({
                    success: true,
                    message: 'تم إنشاء العملية بنجاح / Operation created successfully',
                    operation_id: operationId,
                    device: {
                        id: device.id,
                        name: device.device_name,
                        barcode: device.barcode
                    }
                });
            });
        }
    });
});

// الحصول على عمليات المخزون
// Get inventory operations
router.get('/operations', verifyToken, (req, res) => {
    const { page = 1, limit = 20, user_id, device_id, operation_type, status, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT io.*, d.device_name, d.barcode, d.device_type, u.full_name as user_name, u.username,
               a.full_name as approved_by_name
        FROM inventory_operations io
        JOIN devices d ON io.device_id = d.id
        JOIN users u ON io.user_id = u.id
        LEFT JOIN users a ON io.approved_by = a.id
        WHERE 1=1
    `;
    
    const params = [];

    // إذا لم يكن مدير، عرض عملياته فقط
    // If not admin, show only own operations
    if (req.user.role !== 'admin') {
        query += ` AND io.user_id = ?`;
        params.push(req.user.id);
    }

    if (user_id && req.user.role === 'admin') {
        query += ` AND io.user_id = ?`;
        params.push(user_id);
    }

    if (device_id) {
        query += ` AND io.device_id = ?`;
        params.push(device_id);
    }

    if (operation_type) {
        query += ` AND io.operation_type = ?`;
        params.push(operation_type);
    }

    if (status) {
        query += ` AND io.status = ?`;
        params.push(status);
    }

    if (date_from) {
        query += ` AND DATE(io.operation_date) >= ?`;
        params.push(date_from);
    }

    if (date_to) {
        query += ` AND DATE(io.operation_date) <= ?`;
        params.push(date_to);
    }

    query += ` ORDER BY io.operation_date DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    req.db.all(query, params, (err, operations) => {
        if (err) {
            console.error('خطأ في جلب العمليات / Error fetching operations:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب العمليات / Error fetching operations'
            });
        }

        // عد إجمالي العمليات
        // Count total operations
        let countQuery = `
            SELECT COUNT(*) as total
            FROM inventory_operations io
            WHERE 1=1
        `;
        const countParams = [];

        if (req.user.role !== 'admin') {
            countQuery += ` AND io.user_id = ?`;
            countParams.push(req.user.id);
        }

        if (user_id && req.user.role === 'admin') {
            countQuery += ` AND io.user_id = ?`;
            countParams.push(user_id);
        }

        if (device_id) {
            countQuery += ` AND io.device_id = ?`;
            countParams.push(device_id);
        }

        if (operation_type) {
            countQuery += ` AND io.operation_type = ?`;
            countParams.push(operation_type);
        }

        if (status) {
            countQuery += ` AND io.status = ?`;
            countParams.push(status);
        }

        if (date_from) {
            countQuery += ` AND DATE(io.operation_date) >= ?`;
            countParams.push(date_from);
        }

        if (date_to) {
            countQuery += ` AND DATE(io.operation_date) <= ?`;
            countParams.push(date_to);
        }

        req.db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('خطأ في عد العمليات / Error counting operations:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء عد العمليات / Error counting operations'
                });
            }

            res.json({
                success: true,
                operations: operations,
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

// الموافقة على عملية (للمدير فقط)
// Approve operation (admin only)
router.put('/operations/:id/approve', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    // الحصول على العملية
    // Get operation
    const operationQuery = `
        SELECT io.*, d.device_name, d.barcode, u.full_name as user_name
        FROM inventory_operations io
        JOIN devices d ON io.device_id = d.id
        JOIN users u ON io.user_id = u.id
        WHERE io.id = ?
    `;

    req.db.get(operationQuery, [id], (err, operation) => {
        if (err) {
            console.error('خطأ في جلب العملية / Error fetching operation:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب العملية / Error fetching operation'
            });
        }

        if (!operation) {
            return res.status(404).json({
                error: 'عملية غير موجودة / Operation not found',
                message: 'العملية غير موجودة / Operation not found'
            });
        }

        if (operation.status !== 'pending') {
            return res.status(400).json({
                error: 'عملية غير قابلة للموافقة / Operation not approvable',
                message: 'العملية تمت معالجتها مسبقاً / Operation already processed'
            });
        }

        // الموافقة على العملية
        // Approve operation
        const updateQuery = `
            UPDATE inventory_operations 
            SET status = 'approved', approved_by = ?, approval_date = CURRENT_TIMESTAMP, notes = COALESCE(?, notes)
            WHERE id = ?
        `;

        req.db.run(updateQuery, [req.user.id, notes, id], function(err) {
            if (err) {
                console.error('❌ خطأ في الموافقة على العملية / Error approving operation:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء الموافقة على العملية / Error approving operation',
                    details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                });
            }

            // تحديث كمية الجهاز
            // Update device quantity
            const quantityChange = operation.operation_type === 'add' ? operation.quantity : -operation.quantity;
            const deviceUpdateQuery = 'UPDATE devices SET current_quantity = current_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            
            req.db.run(deviceUpdateQuery, [quantityChange, operation.device_id], (err) => {
                if (err) {
                    console.error('❌ خطأ في تحديث كمية الجهاز / Error updating device quantity:', err);
                    // إرجاع رسالة تحذيرية لكن نجاح العملية
                    // Return warning message but operation success
                }

                // تسجيل النشاط (مع معالجة الأخطاء)
                // Log activity (with error handling)
                try {
                    logActivity(req.db, req.user.id, 'operation_approved', 'inventory_operations', id, operation, { notes }, req);
                } catch (logErr) {
                    console.error('⚠️ خطأ في تسجيل النشاط / Error logging activity:', logErr);
                }

                // إنشاء إشعار للموظف (مع معالجة الأخطاء)
                // Create notification for employee (with error handling)
                try {
                    const operationText = operation.operation_type === 'add' ? 'الإضافة' : 'السحب';
                    const operationTextEn = operation.operation_type === 'add' ? 'addition' : 'removal';
                    
                    createNotification(req.db, operation.user_id, 
                        `تمت الموافقة على عملية ${operationText} / ${operationTextEn} Operation Approved`,
                        `تمت الموافقة على عملية ${operationText} للجهاز ${operation.device_name} / ${operationTextEn} operation for ${operation.device_name} has been approved`,
                        'success'
                    );
                } catch (notifErr) {
                    console.error('⚠️ خطأ في إنشاء الإشعار / Error creating notification:', notifErr);
                }

                res.json({
                    success: true,
                    message: 'تمت الموافقة على العملية بنجاح / Operation approved successfully'
                });
            });
        });
    });
});

// رفض عملية (للمدير فقط)
// Reject operation (admin only)
router.put('/operations/:id/reject', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    // الحصول على العملية
    // Get operation
    const operationQuery = `
        SELECT io.*, d.device_name, u.full_name as user_name
        FROM inventory_operations io
        JOIN devices d ON io.device_id = d.id
        JOIN users u ON io.user_id = u.id
        WHERE io.id = ?
    `;

    req.db.get(operationQuery, [id], (err, operation) => {
        if (err) {
            console.error('خطأ في جلب العملية / Error fetching operation:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب العملية / Error fetching operation'
            });
        }

        if (!operation) {
            return res.status(404).json({
                error: 'عملية غير موجودة / Operation not found',
                message: 'العملية غير موجودة / Operation not found'
            });
        }

        if (operation.status !== 'pending') {
            return res.status(400).json({
                error: 'عملية غير قابلة للرفض / Operation not rejectable',
                message: 'العملية تمت معالجتها مسبقاً / Operation already processed'
            });
        }

        // رفض العملية
        // Reject operation
        const updateQuery = `
            UPDATE inventory_operations 
            SET status = 'rejected', approved_by = ?, approval_date = CURRENT_TIMESTAMP, notes = COALESCE(?, notes)
            WHERE id = ?
        `;

        req.db.run(updateQuery, [req.user.id, notes, id], function(err) {
            if (err) {
                console.error('خطأ في رفض العملية / Error rejecting operation:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء رفض العملية / Error rejecting operation'
                });
            }

            // تسجيل النشاط
            // Log activity
            logActivity(req.db, req.user.id, 'operation_rejected', 'inventory_operations', id, operation, { notes }, req);

            // إنشاء إشعار للموظف
            // Create notification for employee
            const operationText = operation.operation_type === 'add' ? 'الإضافة' : 'السحب';
            const operationTextEn = operation.operation_type === 'add' ? 'addition' : 'removal';
            
            createNotification(req.db, operation.user_id, 
                `تم رفض عملية ${operationText} / ${operationTextEn} Operation Rejected`,
                `تم رفض عملية ${operationText} للجهاز ${operation.device_name} / ${operationTextEn} operation for ${operation.device_name} has been rejected`,
                'error'
            );

            res.json({
                success: true,
                message: 'تم رفض العملية بنجاح / Operation rejected successfully'
            });
        });
    });
});

// سحب مخزون يدوي (للموظفين والمديرين)
// Manual stock removal (for employees and admins)
router.post('/manual-remove', verifyToken, verifyEmployee, (req, res) => {
    const {
        device_id,
        barcode,
        quantity = 1,
        reason,
        notes,
        location
    } = req.body;

    if ((!device_id && !barcode) || !quantity) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'معرف الجهاز أو الرمز الشريطي والكمية مطلوبان / Device ID or barcode and quantity are required'
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            error: 'كمية غير صالحة / Invalid quantity',
            message: 'الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than zero'
        });
    }

    let deviceQuery = 'SELECT * FROM devices WHERE ';
    let deviceParam;

    if (device_id) {
        deviceQuery += 'id = ?';
        deviceParam = device_id;
    } else {
        deviceQuery += 'barcode = ?';
        deviceParam = barcode;
    }

    req.db.get(deviceQuery, [deviceParam], (err, device) => {
        if (err) {
            console.error('❌ خطأ في البحث عن الجهاز / Error finding device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء البحث عن الجهاز / Error finding device',
                details: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
        }

        if (!device) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود في النظام / Device not found in system'
            });
        }

        const quantityQuery = `
            SELECT COALESCE(SUM(CASE WHEN operation_type = 'add' THEN quantity ELSE -quantity END), 0) as available_quantity
            FROM inventory_operations 
            WHERE device_id = ? AND status = 'approved'
        `;

        req.db.get(quantityQuery, [device.id], (err, result) => {
            if (err) {
                console.error('❌ خطأ في حساب الكمية المتاحة / Error calculating available quantity:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء حساب الكمية المتاحة / Error calculating available quantity',
                    details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                });
            }

            const availableQuantity = result.available_quantity + device.current_quantity;

            if (quantity > availableQuantity) {
                return res.status(400).json({
                    error: 'كمية غير كافية / Insufficient quantity',
                    message: `الكمية المتاحة: ${availableQuantity} / Available quantity: ${availableQuantity}`
                });
            }

            const isAdmin = req.user.role === 'admin';
            const operationStatus = isAdmin ? 'approved' : 'pending';
            const approvedBy = isAdmin ? req.user.id : null;

            let insertQuery;
            let insertParams;

            if (isAdmin) {
                insertQuery = `
                    INSERT INTO inventory_operations (
                        device_id, user_id, operation_type, quantity, reason, notes, location, status, approved_by, approval_date
                    ) VALUES (?, ?, 'remove', ?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP)
                `;
                insertParams = [device.id, req.user.id, quantity, reason, notes, location, req.user.id];
            } else {
                insertQuery = `
                    INSERT INTO inventory_operations (
                        device_id, user_id, operation_type, quantity, reason, notes, location, status
                    ) VALUES (?, ?, 'remove', ?, ?, ?, ?, 'pending')
                `;
                insertParams = [device.id, req.user.id, quantity, reason, notes, location];
            }

            req.db.run(insertQuery, insertParams, function(err) {
                if (err) {
                    console.error('❌ خطأ في سحب المخزون / Error removing stock:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء سحب المخزون / Error removing stock',
                        details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                    });
                }

                const operationId = this.lastID;

                if (isAdmin) {
                    const deviceUpdateQuery = 'UPDATE devices SET current_quantity = current_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                    
                    req.db.run(deviceUpdateQuery, [quantity, device.id], (err) => {
                        if (err) {
                            console.error('❌ خطأ في تحديث كمية الجهاز / Error updating device quantity:', err);
                        }
                    });
                }

                // تسجيل النشاط (مع معالجة الأخطاء)
                // Log activity (with error handling)
                try {
                    logActivity(req.db, req.user.id, 'manual_stock_removed', 'inventory_operations', operationId, null, {
                        device_name: device.device_name,
                        barcode: device.barcode,
                        quantity,
                        reason,
                        status: operationStatus
                    }, req);
                } catch (logErr) {
                    console.error('⚠️ خطأ في تسجيل النشاط / Error logging activity:', logErr);
                }

                if (!isAdmin) {
                    const adminNotificationQuery = 'SELECT id FROM users WHERE role = "admin" AND is_active = 1';
                    req.db.all(adminNotificationQuery, [], (err, admins) => {
                        if (!err && admins && admins.length > 0) {
                            admins.forEach(admin => {
                                try {
                                    createNotification(req.db, admin.id, 
                                        'عملية سحب مخزون يدوي جديدة / New Manual Stock Removal',
                                        `${req.user.full_name} سحب مخزون يدوي للجهاز ${device.device_name} / ${req.user.full_name} removed manual stock for ${device.device_name}`,
                                        'info'
                                    );
                                } catch (notifErr) {
                                    console.error('⚠️ خطأ في إنشاء الإشعار / Error creating notification:', notifErr);
                                }
                            });
                        }
                    });
                }

                res.status(201).json({
                    success: true,
                    message: isAdmin ? 
                        'تم سحب المخزون بنجاح / Stock removed successfully' : 
                        'تم إرسال طلب سحب المخزون، في انتظار الموافقة / Stock removal request submitted, pending approval',
                    operation_id: operationId,
                    device: {
                        id: device.id,
                        name: device.device_name,
                        barcode: device.barcode
                    },
                    status: operationStatus,
                    available_quantity: isAdmin ? availableQuantity - quantity : availableQuantity
                });
            });
        });
    });
});

// إضافة مخزون يدوي (للموظفين والمديرين)
// Manual stock addition (for employees and admins)
router.post('/manual-add', verifyToken, verifyEmployee, (req, res) => {
    const {
        device_id,
        barcode,
        quantity = 1,
        reason,
        notes,
        location
    } = req.body;

    if ((!device_id && !barcode) || !quantity) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'معرف الجهاز أو الرمز الشريطي والكمية مطلوبان / Device ID or barcode and quantity are required'
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            error: 'كمية غير صالحة / Invalid quantity',
            message: 'الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than zero'
        });
    }

    let deviceQuery = 'SELECT * FROM devices WHERE ';
    let deviceParam;

    if (device_id) {
        deviceQuery += 'id = ?';
        deviceParam = device_id;
    } else {
        deviceQuery += 'barcode = ?';
        deviceParam = barcode;
    }

    req.db.get(deviceQuery, [deviceParam], (err, device) => {
        if (err) {
            console.error('خطأ في البحث عن الجهاز / Error finding device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء البحث عن الجهاز / Error finding device'
            });
        }

        if (!device) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود في النظام / Device not found in system'
            });
        }

        const isAdmin = req.user.role === 'admin';
        const operationStatus = isAdmin ? 'approved' : 'pending';
        const approvedBy = isAdmin ? req.user.id : null;

        let insertQuery;
        let insertParams;

        if (isAdmin) {
            insertQuery = `
                INSERT INTO inventory_operations (
                    device_id, user_id, operation_type, quantity, reason, notes, location, status, approved_by, approval_date
                ) VALUES (?, ?, 'add', ?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP)
            `;
            insertParams = [device.id, req.user.id, quantity, reason, notes, location, req.user.id];
        } else {
            insertQuery = `
                INSERT INTO inventory_operations (
                    device_id, user_id, operation_type, quantity, reason, notes, location, status
                ) VALUES (?, ?, 'add', ?, ?, ?, ?, 'pending')
            `;
            insertParams = [device.id, req.user.id, quantity, reason, notes, location];
        }

        req.db.run(insertQuery, insertParams, function(err) {
            if (err) {
                console.error('❌ خطأ في إضافة المخزون / Error adding stock:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء إضافة المخزون / Error adding stock',
                    details: process.env.NODE_ENV !== 'production' ? err.message : undefined
                });
            }

            const operationId = this.lastID;

            if (isAdmin) {
                const deviceUpdateQuery = 'UPDATE devices SET current_quantity = current_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                
                req.db.run(deviceUpdateQuery, [quantity, device.id], (err) => {
                    if (err) {
                        console.error('❌ خطأ في تحديث كمية الجهاز / Error updating device quantity:', err);
                    }
                });
            }

            // تسجيل النشاط (مع معالجة الأخطاء)
            // Log activity (with error handling)
            try {
                logActivity(req.db, req.user.id, 'manual_stock_added', 'inventory_operations', operationId, null, {
                    device_name: device.device_name,
                    barcode: device.barcode,
                    quantity,
                    reason,
                    status: operationStatus
                }, req);
            } catch (logErr) {
                console.error('⚠️ خطأ في تسجيل النشاط / Error logging activity:', logErr);
            }

            if (!isAdmin) {
                const adminNotificationQuery = 'SELECT id FROM users WHERE role = "admin" AND is_active = 1';
                req.db.all(adminNotificationQuery, [], (err, admins) => {
                    if (!err && admins && admins.length > 0) {
                        admins.forEach(admin => {
                            try {
                                createNotification(req.db, admin.id, 
                                    'عملية إضافة مخزون يدوي جديدة / New Manual Stock Addition',
                                    `${req.user.full_name} أضاف مخزون يدوي للجهاز ${device.device_name} / ${req.user.full_name} added manual stock for ${device.device_name}`,
                                    'info'
                                );
                            } catch (notifErr) {
                                console.error('⚠️ خطأ في إنشاء الإشعار / Error creating notification:', notifErr);
                            }
                        });
                    }
                });
            }

            res.status(201).json({
                success: true,
                message: isAdmin ? 
                    'تم إضافة المخزون بنجاح / Stock added successfully' : 
                    'تم إرسال طلب إضافة المخزون، في انتظار الموافقة / Stock addition request submitted, pending approval',
                operation_id: operationId,
                device: {
                    id: device.id,
                    name: device.device_name,
                    barcode: device.barcode
                },
                status: operationStatus
            });
        });
    });
});

// إحصائيات المخزون
// Inventory statistics
router.get('/stats', verifyToken, (req, res) => {
    const queries = {
        totalDevices: 'SELECT COUNT(*) as count FROM devices',
        availableDevices: 'SELECT COUNT(*) as count FROM devices WHERE status = "available"',
        assignedDevices: 'SELECT COUNT(*) as count FROM devices WHERE status = "assigned"',
        pendingOperations: 'SELECT COUNT(*) as count FROM inventory_operations WHERE status = "pending"',
        todayOperations: 'SELECT COUNT(*) as count FROM inventory_operations WHERE DATE(operation_date) = DATE("now")',
        lowStockDevices: `
            SELECT COUNT(*) as count 
            FROM devices d
            LEFT JOIN (
                SELECT device_id, SUM(CASE WHEN operation_type = 'add' THEN quantity ELSE -quantity END) as net_quantity
                FROM inventory_operations 
                WHERE status = 'approved'
                GROUP BY device_id
            ) io ON d.id = io.device_id
            WHERE (COALESCE(io.net_quantity, 0) + d.current_quantity) <= d.minimum_quantity
        `
    };

    const stats = {};
    let completedQueries = 0;
    const totalQueries = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, query]) => {
        req.db.get(query, [], (err, result) => {
            if (err) {
                console.error(`خطأ في استعلام ${key} / Error in ${key} query:`, err);
                stats[key] = 0;
            } else {
                stats[key] = result.count;
            }

            completedQueries++;
            if (completedQueries === totalQueries) {
                res.json({
                    success: true,
                    stats: stats
                });
            }
        });
    });
});

module.exports = router;