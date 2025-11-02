const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, verifyEmployee, logActivity, createNotification } = require('../middleware/auth');

// الحصول على جميع الأجهزة
// Get all devices
router.get('/', verifyToken, (req, res) => {
    const { page = 1, limit = 20, search = '', status = '', type = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT d.*, 
               COALESCE(SUM(CASE WHEN io.operation_type = 'add' THEN io.quantity ELSE -io.quantity END), d.current_quantity) as calculated_quantity
        FROM devices d
        LEFT JOIN inventory_operations io ON d.id = io.device_id AND io.status = 'approved'
        WHERE 1=1
    `;
    
    const params = [];

    if (search) {
        query += ` AND (d.device_name LIKE ? OR d.barcode LIKE ? OR d.brand LIKE ? OR d.model LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
        query += ` AND d.status = ?`;
        params.push(status);
    }

    if (type) {
        query += ` AND d.device_type = ?`;
        params.push(type);
    }

    query += ` GROUP BY d.id ORDER BY d.device_name LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    req.db.all(query, params, (err, devices) => {
        if (err) {
            console.error('خطأ في جلب الأجهزة / Error fetching devices:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب الأجهزة / Error fetching devices'
            });
        }

        // عد إجمالي الأجهزة
        // Count total devices
        let countQuery = 'SELECT COUNT(*) as total FROM devices WHERE 1=1';
        const countParams = [];

        if (search) {
            countQuery += ` AND (device_name LIKE ? OR barcode LIKE ? OR brand LIKE ? OR model LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }

        if (type) {
            countQuery += ` AND device_type = ?`;
            countParams.push(type);
        }

        req.db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('خطأ في عد الأجهزة / Error counting devices:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء عد الأجهزة / Error counting devices'
                });
            }

            res.json({
                success: true,
                devices: devices,
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

// الحصول على جهاز بالرمز الشريطي
// Get device by barcode
router.get('/barcode/:barcode', verifyToken, (req, res) => {
    const { barcode } = req.params;

    const query = `
        SELECT d.*, 
               COALESCE(SUM(CASE WHEN io.operation_type = 'add' THEN io.quantity ELSE -io.quantity END), d.current_quantity) as calculated_quantity
        FROM devices d
        LEFT JOIN inventory_operations io ON d.id = io.device_id AND io.status = 'approved'
        WHERE d.barcode = ?
        GROUP BY d.id
    `;

    req.db.get(query, [barcode], (err, device) => {
        if (err) {
            console.error('خطأ في جلب الجهاز / Error fetching device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب الجهاز / Error fetching device'
            });
        }

        if (!device) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود في النظام / Device not found in system'
            });
        }

        // تسجيل عملية البحث
        // Log search operation
        logActivity(req.db, req.user.id, 'device_searched', 'devices', device.id, null, { barcode }, req);

        res.json({
            success: true,
            device: device
        });
    });
});

// إضافة جهاز جديد (للمدير فقط)
// Add new device (admin only)
router.post('/', verifyToken, verifyAdmin, (req, res) => {
    const {
        barcode,
        device_name,
        device_type,
        brand,
        model,
        serial_number,
        description,
        purchase_date,
        purchase_price,
        warranty_expiry,
        location,
        current_quantity = 1,
        minimum_quantity = 1
    } = req.body;

    // التحقق من البيانات المطلوبة
    // Validate required fields
    if (!barcode || !device_name || !device_type) {
        return res.status(400).json({
            error: 'بيانات ناقصة / Missing data',
            message: 'الرمز الشريطي واسم الجهاز ونوعه مطلوبان / Barcode, device name, and type are required'
        });
    }

    // التحقق من عدم تكرار الرمز الشريطي
    // Check for duplicate barcode
    req.db.get('SELECT id FROM devices WHERE barcode = ?', [barcode], (err, existingDevice) => {
        if (err) {
            console.error('خطأ في التحقق من الرمز الشريطي / Error checking barcode:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء التحقق من الرمز الشريطي / Error checking barcode'
            });
        }

        if (existingDevice) {
            return res.status(409).json({
                error: 'رمز شريطي مكرر / Duplicate barcode',
                message: 'الرمز الشريطي موجود مسبقاً / Barcode already exists'
            });
        }

        // إدراج الجهاز الجديد
        // Insert new device
        const insertQuery = `
            INSERT INTO devices (
                barcode, device_name, device_type, brand, model, serial_number,
                description, purchase_date, purchase_price, warranty_expiry,
                location, current_quantity, minimum_quantity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        req.db.run(insertQuery, [
            barcode, device_name, device_type, brand, model, serial_number,
            description, purchase_date, purchase_price, warranty_expiry,
            location, current_quantity, minimum_quantity
        ], function(err) {
            if (err) {
                console.error('خطأ في إضافة الجهاز / Error adding device:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء إضافة الجهاز / Error adding device'
                });
            }

            const deviceId = this.lastID;

            // تسجيل النشاط
            // Log activity
            logActivity(req.db, req.user.id, 'device_added', 'devices', deviceId, null, {
                barcode, device_name, device_type, brand, model
            }, req);

            // إنشاء إشعار
            // Create notification
            createNotification(req.db, req.user.id, 'تم إضافة جهاز جديد / New Device Added', 
                `تم إضافة الجهاز ${device_name} بنجاح / Device ${device_name} added successfully`, 'success');

            res.status(201).json({
                success: true,
                message: 'تم إضافة الجهاز بنجاح / Device added successfully',
                device_id: deviceId
            });
        });
    });
});

// تحديث جهاز (للمدير فقط)
// Update device (admin only)
router.put('/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const {
        device_name,
        device_type,
        brand,
        model,
        serial_number,
        description,
        purchase_date,
        purchase_price,
        warranty_expiry,
        location,
        status,
        current_quantity,
        minimum_quantity
    } = req.body;

    // تسجيل البيانات المستلمة للتشخيص
    // Log received data for debugging
    console.log('📦 بيانات التحديث المستلمة / Received update data:', {
        id,
        current_quantity,
        minimum_quantity,
        current_quantity_type: typeof current_quantity,
        minimum_quantity_type: typeof minimum_quantity
    });

    // الحصول على البيانات الحالية
    // Get current data
    req.db.get('SELECT * FROM devices WHERE id = ?', [id], (err, oldDevice) => {
        if (err) {
            console.error('خطأ في جلب الجهاز / Error fetching device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب الجهاز / Error fetching device'
            });
        }

        if (!oldDevice) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود / Device not found'
            });
        }

        // التحقق من صحة البيانات
        // Validate data
        if (current_quantity !== undefined && current_quantity < 0) {
            return res.status(400).json({
                error: 'بيانات غير صحيحة / Invalid data',
                message: 'الكمية الحالية يجب أن تكون أكبر من أو تساوي صفر / Current quantity must be greater than or equal to zero'
            });
        }

        if (minimum_quantity !== undefined && minimum_quantity < 0) {
            return res.status(400).json({
                error: 'بيانات غير صحيحة / Invalid data',
                message: 'الكمية الدنيا يجب أن تكون أكبر من أو تساوي صفر / Minimum quantity must be greater than or equal to zero'
            });
        }

        // تحديث الجهاز
        // Update device
        // استخدام القيم المحددة أو الاحتفاظ بالقيم الحالية
        // Use specified values or keep current values
        const finalCurrentQuantity = current_quantity !== undefined ? current_quantity : oldDevice.current_quantity;
        const finalMinimumQuantity = minimum_quantity !== undefined ? minimum_quantity : oldDevice.minimum_quantity;

        const updateQuery = `
            UPDATE devices SET
                device_name = COALESCE(?, device_name),
                device_type = COALESCE(?, device_type),
                brand = COALESCE(?, brand),
                model = COALESCE(?, model),
                serial_number = COALESCE(?, serial_number),
                description = COALESCE(?, description),
                purchase_date = COALESCE(?, purchase_date),
                purchase_price = COALESCE(?, purchase_price),
                warranty_expiry = COALESCE(?, warranty_expiry),
                location = COALESCE(?, location),
                status = COALESCE(?, status),
                current_quantity = ?,
                minimum_quantity = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        req.db.run(updateQuery, [
            device_name, device_type, brand, model, serial_number,
            description, purchase_date, purchase_price, warranty_expiry,
            location, status, finalCurrentQuantity, finalMinimumQuantity, id
        ], function(err) {
            if (err) {
                console.error('خطأ في تحديث الجهاز / Error updating device:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء تحديث الجهاز / Error updating device'
                });
            }

            // تسجيل النشاط
            // Log activity
            logActivity(req.db, req.user.id, 'device_updated', 'devices', id, oldDevice, req.body, req);

            // إنشاء إشعار
            // Create notification
            createNotification(req.db, req.user.id, 'تم تحديث الجهاز / Device Updated', 
                `تم تحديث الجهاز ${oldDevice.device_name} بنجاح / Device ${oldDevice.device_name} updated successfully`, 'info');

            res.json({
                success: true,
                message: 'تم تحديث الجهاز بنجاح / Device updated successfully'
            });
        });
    });
});

// حذف جهاز (للمدير فقط)
// Delete device (admin only)
router.delete('/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;

    // التحقق من وجود عمليات مرتبطة
    // Check for related operations
    req.db.get('SELECT COUNT(*) as count FROM inventory_operations WHERE device_id = ?', [id], (err, result) => {
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
                message: 'لا يمكن حذف الجهاز لوجود عمليات مرتبطة به / Cannot delete device with related operations'
            });
        }

        // الحصول على بيانات الجهاز قبل الحذف
        // Get device data before deletion
        req.db.get('SELECT * FROM devices WHERE id = ?', [id], (err, device) => {
            if (err) {
                console.error('خطأ في جلب الجهاز / Error fetching device:', err);
                return res.status(500).json({
                    error: 'خطأ في الخادم / Server error',
                    message: 'حدث خطأ أثناء جلب الجهاز / Error fetching device'
                });
            }

            if (!device) {
                return res.status(404).json({
                    error: 'جهاز غير موجود / Device not found',
                    message: 'الجهاز غير موجود / Device not found'
                });
            }

            // حذف الجهاز
            // Delete device
            req.db.run('DELETE FROM devices WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('خطأ في حذف الجهاز / Error deleting device:', err);
                    return res.status(500).json({
                        error: 'خطأ في الخادم / Server error',
                        message: 'حدث خطأ أثناء حذف الجهاز / Error deleting device'
                    });
                }

                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'device_deleted', 'devices', id, device, null, req);

                // إنشاء إشعار
                // Create notification
                createNotification(req.db, req.user.id, 'تم حذف الجهاز / Device Deleted', 
                    `تم حذف الجهاز ${device.device_name} / Device ${device.device_name} deleted`, 'warning');

                res.json({
                    success: true,
                    message: 'تم حذف الجهاز بنجاح / Device deleted successfully'
                });
            });
        });
    });
});

// الحصول على جهاز بالمعرف
// Get device by ID
router.get('/id/:id', verifyToken, (req, res) => {
    const { id } = req.params;

    const query = `
        SELECT d.*, 
               COALESCE(SUM(CASE WHEN io.operation_type = 'add' THEN io.quantity ELSE -io.quantity END), d.current_quantity) as calculated_quantity
        FROM devices d
        LEFT JOIN inventory_operations io ON d.id = io.device_id AND io.status = 'approved'
        WHERE d.id = ?
        GROUP BY d.id
    `;

    req.db.get(query, [id], (err, device) => {
        if (err) {
            console.error('خطأ في جلب الجهاز / Error fetching device:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب الجهاز / Error fetching device'
            });
        }

        if (!device) {
            return res.status(404).json({
                error: 'جهاز غير موجود / Device not found',
                message: 'الجهاز غير موجود في النظام / Device not found in system'
            });
        }

        res.json({
            success: true,
            device: device
        });
    });
});

// الحصول على أنواع الأجهزة
// Get device types
router.get('/types/list', verifyToken, (req, res) => {
    const query = 'SELECT DISTINCT device_type FROM devices ORDER BY device_type';
    
    req.db.all(query, [], (err, types) => {
        if (err) {
            console.error('خطأ في جلب أنواع الأجهزة / Error fetching device types:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء جلب أنواع الأجهزة / Error fetching device types'
            });
        }

        res.json({
            success: true,
            types: types.map(t => t.device_type)
        });
    });
});

module.exports = router;