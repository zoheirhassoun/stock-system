const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, logActivity } = require('../middleware/auth');

// تقرير المخزون العام
// General inventory report
router.get('/inventory', verifyToken, verifyAdmin, (req, res) => {
    const { date_from, date_to, device_type, status } = req.query;

    let query = `
        SELECT 
            d.id,
            d.barcode,
            d.device_name,
            d.device_type,
            d.brand,
            d.model,
            d.status,
            d.location,
            d.current_quantity,
            d.minimum_quantity,
            COALESCE(SUM(CASE WHEN io.operation_type = 'add' AND io.status = 'approved' THEN io.quantity ELSE 0 END), 0) as total_added,
            COALESCE(SUM(CASE WHEN io.operation_type = 'remove' AND io.status = 'approved' THEN io.quantity ELSE 0 END), 0) as total_removed,
            (d.current_quantity + COALESCE(SUM(CASE WHEN io.operation_type = 'add' AND io.status = 'approved' THEN io.quantity ELSE -io.quantity END), 0)) as calculated_quantity
        FROM devices d
        LEFT JOIN inventory_operations io ON d.id = io.device_id
        WHERE 1=1
    `;
    
    const params = [];

    if (date_from) {
        query += ` AND (io.operation_date IS NULL OR DATE(io.operation_date) >= ?)`;
        params.push(date_from);
    }

    if (date_to) {
        query += ` AND (io.operation_date IS NULL OR DATE(io.operation_date) <= ?)`;
        params.push(date_to);
    }

    if (device_type) {
        query += ` AND d.device_type = ?`;
        params.push(device_type);
    }

    if (status) {
        query += ` AND d.status = ?`;
        params.push(status);
    }

    query += ` GROUP BY d.id ORDER BY d.device_name`;

    req.db.all(query, params, (err, devices) => {
        if (err) {
            console.error('خطأ في تقرير المخزون / Error in inventory report:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء إنشاء تقرير المخزون / Error generating inventory report'
            });
        }

        // حساب الإحصائيات
        // Calculate statistics
        const stats = {
            total_devices: devices.length,
            total_quantity: devices.reduce((sum, device) => sum + device.calculated_quantity, 0),
            low_stock_devices: devices.filter(device => device.calculated_quantity <= device.minimum_quantity).length,
            out_of_stock_devices: devices.filter(device => device.calculated_quantity <= 0).length,
            available_devices: devices.filter(device => device.status === 'available').length,
            assigned_devices: devices.filter(device => device.status === 'assigned').length
        };

        // تسجيل النشاط
        // Log activity
        logActivity(req.db, req.user.id, 'inventory_report_generated', null, null, null, { 
            date_from, date_to, device_type, status 
        }, req);

        res.json({
            success: true,
            report: {
                devices: devices,
                statistics: stats,
                generated_at: new Date().toISOString(),
                generated_by: req.user.full_name,
                filters: { date_from, date_to, device_type, status }
            }
        });
    });
});

// تقرير عمليات الموظفين
// Employee operations report
router.get('/employee-operations', verifyToken, verifyAdmin, (req, res) => {
    const { date_from, date_to, user_id, operation_type } = req.query;

    let query = `
        SELECT 
            u.id as user_id,
            u.full_name,
            u.username,
            u.department,
            COUNT(io.id) as total_operations,
            COUNT(CASE WHEN io.operation_type = 'add' THEN 1 END) as add_operations,
            COUNT(CASE WHEN io.operation_type = 'remove' THEN 1 END) as remove_operations,
            COUNT(CASE WHEN io.status = 'pending' THEN 1 END) as pending_operations,
            COUNT(CASE WHEN io.status = 'approved' THEN 1 END) as approved_operations,
            COUNT(CASE WHEN io.status = 'rejected' THEN 1 END) as rejected_operations,
            SUM(CASE WHEN io.operation_type = 'add' AND io.status = 'approved' THEN io.quantity ELSE 0 END) as total_added_quantity,
            SUM(CASE WHEN io.operation_type = 'remove' AND io.status = 'approved' THEN io.quantity ELSE 0 END) as total_removed_quantity
        FROM users u
        LEFT JOIN inventory_operations io ON u.id = io.user_id
        WHERE u.role = 'employee' AND u.is_active = 1
    `;
    
    const params = [];

    if (date_from) {
        query += ` AND (io.operation_date IS NULL OR DATE(io.operation_date) >= ?)`;
        params.push(date_from);
    }

    if (date_to) {
        query += ` AND (io.operation_date IS NULL OR DATE(io.operation_date) <= ?)`;
        params.push(date_to);
    }

    if (user_id) {
        query += ` AND u.id = ?`;
        params.push(user_id);
    }

    if (operation_type) {
        query += ` AND (io.operation_type IS NULL OR io.operation_type = ?)`;
        params.push(operation_type);
    }

    query += ` GROUP BY u.id ORDER BY total_operations DESC`;

    req.db.all(query, params, (err, employees) => {
        if (err) {
            console.error('خطأ في تقرير عمليات الموظفين / Error in employee operations report:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء إنشاء تقرير عمليات الموظفين / Error generating employee operations report'
            });
        }

        // حساب الإحصائيات
        // Calculate statistics
        const stats = {
            total_employees: employees.length,
            active_employees: employees.filter(emp => emp.total_operations > 0).length,
            total_operations: employees.reduce((sum, emp) => sum + emp.total_operations, 0),
            total_pending: employees.reduce((sum, emp) => sum + emp.pending_operations, 0),
            total_approved: employees.reduce((sum, emp) => sum + emp.approved_operations, 0),
            total_rejected: employees.reduce((sum, emp) => sum + emp.rejected_operations, 0)
        };

        // تسجيل النشاط
        // Log activity
        logActivity(req.db, req.user.id, 'employee_operations_report_generated', null, null, null, { 
            date_from, date_to, user_id, operation_type 
        }, req);

        res.json({
            success: true,
            report: {
                employees: employees,
                statistics: stats,
                generated_at: new Date().toISOString(),
                generated_by: req.user.full_name,
                filters: { date_from, date_to, user_id, operation_type }
            }
        });
    });
});

// تقرير الأجهزة الأكثر استخداماً
// Most used devices report
router.get('/most-used-devices', verifyToken, verifyAdmin, (req, res) => {
    const { date_from, date_to, limit = 10 } = req.query;

    let query = `
        SELECT 
            d.id,
            d.barcode,
            d.device_name,
            d.device_type,
            d.brand,
            d.model,
            COUNT(io.id) as operation_count,
            COUNT(CASE WHEN io.operation_type = 'add' THEN 1 END) as add_count,
            COUNT(CASE WHEN io.operation_type = 'remove' THEN 1 END) as remove_count,
            SUM(CASE WHEN io.operation_type = 'add' THEN io.quantity ELSE 0 END) as total_added,
            SUM(CASE WHEN io.operation_type = 'remove' THEN io.quantity ELSE 0 END) as total_removed
        FROM devices d
        INNER JOIN inventory_operations io ON d.id = io.device_id
        WHERE io.status = 'approved'
    `;
    
    const params = [];

    if (date_from) {
        query += ` AND DATE(io.operation_date) >= ?`;
        params.push(date_from);
    }

    if (date_to) {
        query += ` AND DATE(io.operation_date) <= ?`;
        params.push(date_to);
    }

    query += ` GROUP BY d.id ORDER BY operation_count DESC LIMIT ?`;
    params.push(parseInt(limit));

    req.db.all(query, params, (err, devices) => {
        if (err) {
            console.error('خطأ في تقرير الأجهزة الأكثر استخداماً / Error in most used devices report:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء إنشاء تقرير الأجهزة الأكثر استخداماً / Error generating most used devices report'
            });
        }

        // تسجيل النشاط
        // Log activity
        logActivity(req.db, req.user.id, 'most_used_devices_report_generated', null, null, null, { 
            date_from, date_to, limit 
        }, req);

        res.json({
            success: true,
            report: {
                devices: devices,
                generated_at: new Date().toISOString(),
                generated_by: req.user.full_name,
                filters: { date_from, date_to, limit }
            }
        });
    });
});

// تقرير الأجهزة منخفضة المخزون
// Low stock devices report
router.get('/low-stock', verifyToken, verifyAdmin, (req, res) => {
    const query = `
        SELECT 
            d.id,
            d.barcode,
            d.device_name,
            d.device_type,
            d.brand,
            d.model,
            d.location,
            d.current_quantity,
            d.minimum_quantity,
            COALESCE(SUM(CASE WHEN io.operation_type = 'add' AND io.status = 'approved' THEN io.quantity ELSE -io.quantity END), 0) as net_operations,
            (d.current_quantity + COALESCE(SUM(CASE WHEN io.operation_type = 'add' AND io.status = 'approved' THEN io.quantity ELSE -io.quantity END), 0)) as calculated_quantity
        FROM devices d
        LEFT JOIN inventory_operations io ON d.id = io.device_id AND io.status = 'approved'
        GROUP BY d.id
        HAVING calculated_quantity <= d.minimum_quantity
        ORDER BY calculated_quantity ASC
    `;

    req.db.all(query, [], (err, devices) => {
        if (err) {
            console.error('خطأ في تقرير الأجهزة منخفضة المخزون / Error in low stock report:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء إنشاء تقرير الأجهزة منخفضة المخزون / Error generating low stock report'
            });
        }

        // تصنيف الأجهزة
        // Categorize devices
        const outOfStock = devices.filter(device => device.calculated_quantity <= 0);
        const lowStock = devices.filter(device => device.calculated_quantity > 0 && device.calculated_quantity <= device.minimum_quantity);

        // تسجيل النشاط
        // Log activity
        logActivity(req.db, req.user.id, 'low_stock_report_generated', null, null, null, {
            total_devices: devices.length,
            out_of_stock: outOfStock.length,
            low_stock: lowStock.length
        }, req);

        res.json({
            success: true,
            report: {
                out_of_stock: outOfStock,
                low_stock: lowStock,
                statistics: {
                    total_low_stock: devices.length,
                    out_of_stock_count: outOfStock.length,
                    low_stock_count: lowStock.length
                },
                generated_at: new Date().toISOString(),
                generated_by: req.user.full_name
            }
        });
    });
});

// تقرير العمليات اليومية
// Daily operations report
router.get('/daily-operations', verifyToken, verifyAdmin, (req, res) => {
    const { date_from, date_to } = req.query;
    
    // تعيين التواريخ الافتراضية (آخر 30 يوم)
    // Set default dates (last 30 days)
    const endDate = date_to || new Date().toISOString().split('T')[0];
    const startDate = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const query = `
        SELECT 
            DATE(io.operation_date) as operation_date,
            COUNT(io.id) as total_operations,
            COUNT(CASE WHEN io.operation_type = 'add' THEN 1 END) as add_operations,
            COUNT(CASE WHEN io.operation_type = 'remove' THEN 1 END) as remove_operations,
            COUNT(CASE WHEN io.status = 'pending' THEN 1 END) as pending_operations,
            COUNT(CASE WHEN io.status = 'approved' THEN 1 END) as approved_operations,
            COUNT(CASE WHEN io.status = 'rejected' THEN 1 END) as rejected_operations,
            COUNT(DISTINCT io.user_id) as active_users,
            COUNT(DISTINCT io.device_id) as devices_involved
        FROM inventory_operations io
        WHERE DATE(io.operation_date) BETWEEN ? AND ?
        GROUP BY DATE(io.operation_date)
        ORDER BY operation_date DESC
    `;

    req.db.all(query, [startDate, endDate], (err, dailyData) => {
        if (err) {
            console.error('خطأ في تقرير العمليات اليومية / Error in daily operations report:', err);
            return res.status(500).json({
                error: 'خطأ في الخادم / Server error',
                message: 'حدث خطأ أثناء إنشاء تقرير العمليات اليومية / Error generating daily operations report'
            });
        }

        // حساب الإحصائيات الإجمالية
        // Calculate total statistics
        const totalStats = dailyData.reduce((acc, day) => ({
            total_operations: acc.total_operations + day.total_operations,
            total_add: acc.total_add + day.add_operations,
            total_remove: acc.total_remove + day.remove_operations,
            total_pending: acc.total_pending + day.pending_operations,
            total_approved: acc.total_approved + day.approved_operations,
            total_rejected: acc.total_rejected + day.rejected_operations
        }), {
            total_operations: 0,
            total_add: 0,
            total_remove: 0,
            total_pending: 0,
            total_approved: 0,
            total_rejected: 0
        });

        // تسجيل النشاط
        // Log activity
        logActivity(req.db, req.user.id, 'daily_operations_report_generated', null, null, null, { 
            date_from: startDate, date_to: endDate 
        }, req);

        res.json({
            success: true,
            report: {
                daily_data: dailyData,
                summary: totalStats,
                period: {
                    start_date: startDate,
                    end_date: endDate,
                    days_count: dailyData.length
                },
                generated_at: new Date().toISOString(),
                generated_by: req.user.full_name
            }
        });
    });
});

// تقرير أداء النظام
// System performance report
router.get('/system-performance', verifyToken, verifyAdmin, (req, res) => {
    const queries = {
        // إحصائيات عامة
        // General statistics
        totalUsers: 'SELECT COUNT(*) as count FROM users WHERE is_active = 1',
        totalDevices: 'SELECT COUNT(*) as count FROM devices',
        totalOperations: 'SELECT COUNT(*) as count FROM inventory_operations',
        
        // إحصائيات هذا الشهر
        // This month statistics
        thisMonthOperations: `
            SELECT COUNT(*) as count 
            FROM inventory_operations 
            WHERE strftime('%Y-%m', operation_date) = strftime('%Y-%m', 'now')
        `,
        thisMonthUsers: `
            SELECT COUNT(DISTINCT user_id) as count 
            FROM inventory_operations 
            WHERE strftime('%Y-%m', operation_date) = strftime('%Y-%m', 'now')
        `,
        
        // معدلات الموافقة
        // Approval rates
        approvalRate: `
            SELECT 
                COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0 / COUNT(*) as rate
            FROM inventory_operations
        `,
        
        // متوسط وقت الاستجابة (بالساعات)
        // Average response time (in hours)
        avgResponseTime: `
            SELECT 
                AVG((julianday(approval_date) - julianday(operation_date)) * 24) as hours
            FROM inventory_operations 
            WHERE approval_date IS NOT NULL
        `
    };

    const results = {};
    let completedQueries = 0;
    const totalQueries = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, query]) => {
        req.db.get(query, [], (err, result) => {
            if (err) {
                console.error(`خطأ في استعلام ${key} / Error in ${key} query:`, err);
                results[key] = 0;
            } else {
                results[key] = result.count !== undefined ? result.count : 
                              result.rate !== undefined ? Math.round(result.rate * 100) / 100 : 
                              result.hours !== undefined ? Math.round(result.hours * 100) / 100 : 0;
            }

            completedQueries++;
            if (completedQueries === totalQueries) {
                // تسجيل النشاط
                // Log activity
                logActivity(req.db, req.user.id, 'system_performance_report_generated', null, null, null, results, req);

                res.json({
                    success: true,
                    report: {
                        performance_metrics: {
                            total_users: results.totalUsers,
                            total_devices: results.totalDevices,
                            total_operations: results.totalOperations,
                            this_month_operations: results.thisMonthOperations,
                            active_users_this_month: results.thisMonthUsers,
                            approval_rate_percentage: results.approvalRate,
                            average_response_time_hours: results.avgResponseTime
                        },
                        generated_at: new Date().toISOString(),
                        generated_by: req.user.full_name
                    }
                });
            }
        });
    });
});

module.exports = router;