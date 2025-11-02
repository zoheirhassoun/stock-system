// Admin Panel JavaScript
// نظام إدارة المخزون - لوحة المدير

class AdminApp {
    constructor() {
        this.currentUser = null;
        this.currentSection = 'dashboard';
        this.charts = {};
        this.isCheckingAuth = false;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.init();
    }

    // إرسال طلب مع إعادة المحاولة
    // Send request with retry
    async fetchWithRetry(url, options = {}, retries = this.retryAttempts) {
        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok || response.status < 500) {
                    return response;
                }
                
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('انتهت مهلة الاتصال / Connection timeout');
                }
                
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
                } else {
                    throw error;
                }
            }
        }
        
        throw new Error('فشل الاتصال بعد عدة محاولات / Connection failed after multiple attempts');
    }

    init() {
        // منع استدعاء checkAuth متعدد في نفس الوقت
        // Prevent multiple checkAuth calls at the same time
        if (this.isCheckingAuth) {
            return;
        }
        this.isCheckingAuth = true;
        this.checkAuth().finally(() => {
            this.isCheckingAuth = false;
        });
        this.setupEventListeners();
    }

    // التحقق من المصادقة
    // Check authentication
    async checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            this.showLoginSection();
            return;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.user.role !== 'admin') {
                    this.showNotification('صلاحيات المدير مطلوبة / Admin privileges required', 'danger');
                    localStorage.removeItem('token');
                    this.showLoginSection();
                    return;
                }
                
                this.currentUser = data.user;
                this.showAppSection();
                this.updateUserInfo();
                this.loadDashboard();
            } else {
                localStorage.removeItem('token');
                this.showLoginSection();
            }
        } catch (error) {
            console.error('خطأ في التحقق من المصادقة / Auth verification error:', error);
            this.showLoginSection();
        }
    }

    // إعداد مستمعي الأحداث
    // Setup event listeners
    setupEventListeners() {
        // تسجيل الدخول
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // نموذج تعديل المنتج
        // Product edit form
        const productEditForm = document.getElementById('productEditForm');
        if (productEditForm) {
            productEditForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitProductEdit();
            });
        }

        // فلاتر العمليات
        // Operations filters
        document.getElementById('operationStatusFilter')?.addEventListener('change', () => {
            this.filterOperations();
        });

        document.getElementById('operationTypeFilter')?.addEventListener('change', () => {
            this.filterOperations();
        });

        document.getElementById('operationDateFilter')?.addEventListener('change', () => {
            this.filterOperations();
        });

        document.getElementById('manualStockDeviceId')?.addEventListener('change', async (e) => {
            const deviceId = e.target.value;
            if (deviceId) {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(`/api/devices/id/${deviceId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.device) {
                            this.displayManualStockDeviceInfo(data.device);
                        }
                    }
                } catch (error) {
                    console.error('خطأ في جلب معلومات المنتج / Error fetching product info:', error);
                }
            } else {
                document.getElementById('manualStockDeviceInfo').style.display = 'none';
            }
        });
    }

    // تسجيل الدخول
    // Login function
    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (!username || !password) {
            this.showNotification('يرجى إدخال اسم المستخدم وكلمة المرور / Please enter username and password', 'warning');
            return;
        }

        if (document.getElementById('loginLoading')) {
        this.showLoading('loginLoading', true);
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.user.role !== 'admin') {
                    this.showNotification('صلاحيات المدير مطلوبة / Admin privileges required', 'danger');
                    this.showLoading('loginLoading', false);
                    return;
                }

                localStorage.setItem('token', data.token);
                this.currentUser = data.user;
                
                // إعادة تعيين النموذج
                // Reset form
                document.getElementById('loginForm')?.reset();
                
                // إخفاء قسم تسجيل الدخول وإظهار التطبيق
                // Hide login section and show app
                setTimeout(() => {
                this.showAppSection();
                this.updateUserInfo();
                this.loadDashboard();
                this.showNotification('تم تسجيل الدخول بنجاح / Login successful', 'success');
                }, 100);
            } else {
                this.showNotification(data.message || 'خطأ في تسجيل الدخول / Login error', 'danger');
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول / Login error:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
        } finally {
            this.showLoading('loginLoading', false);
        }
    }

    // تسجيل الخروج
    // Logout function
    async logout() {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
        } catch (error) {
            console.error('خطأ في تسجيل الخروج / Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            this.currentUser = null;
            
            // إظهار قسم تسجيل الدخول بدلاً من إعادة التوجيه
            // Show login section instead of redirecting
            this.showLoginSection();
            this.showNotification('تم تسجيل الخروج بنجاح / Logged out successfully', 'info');
        }
    }

    // تحميل لوحة التحكم
    // Load dashboard
    async loadDashboard() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadCharts(),
                this.loadRecentOperations()
            ]);
        } catch (error) {
            console.error('خطأ في تحميل لوحة التحكم / Dashboard loading error:', error);
        }
    }

    // تحميل الإحصائيات
    // Load statistics
    async loadStats() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/stats', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateStatsCards(data.stats);
            }
        } catch (error) {
            console.error('خطأ في تحميل الإحصائيات / Stats loading error:', error);
        }
    }

    // تحديث بطاقات الإحصائيات
    // Update stats cards
    updateStatsCards(stats) {
        document.getElementById('totalDevices').textContent = stats.totalDevices || 0;
        document.getElementById('availableDevices').textContent = stats.availableDevices || 0;
        document.getElementById('pendingOperations').textContent = stats.pendingOperations || 0;
        document.getElementById('lowStockDevices').textContent = stats.lowStockDevices || 0;
    }

    // تحميل الرسوم البيانية
    // Load charts
    async loadCharts() {
        try {
            await Promise.all([
                this.loadDailyOperationsChart(),
                this.loadOperationsDistributionChart()
            ]);
        } catch (error) {
            console.error('خطأ في تحميل الرسوم البيانية / Charts loading error:', error);
        }
    }

    // تحميل رسم العمليات اليومية
    // Load daily operations chart
    async loadDailyOperationsChart() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/reports/daily-operations', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.createDailyOperationsChart(data.report.daily_data);
            }
        } catch (error) {
            console.error('خطأ في تحميل رسم العمليات اليومية / Daily operations chart error:', error);
        }
    }

    // إنشاء رسم العمليات اليومية
    // Create daily operations chart
    createDailyOperationsChart(dailyData) {
        const ctx = document.getElementById('dailyOperationsChart');
        if (!ctx) return;
        
        if (this.charts.dailyOperations) {
            this.charts.dailyOperations.destroy();
        }

        if (!dailyData || dailyData.length === 0) {
            const ctx2d = ctx.getContext('2d');
            ctx2d.clearRect(0, 0, ctx.width, ctx.height);
            ctx2d.font = '16px Arial';
            ctx2d.fillStyle = '#666';
            ctx2d.textAlign = 'center';
            ctx2d.fillText('لا توجد بيانات / No data available', ctx.width / 2, ctx.height / 2);
            return;
        }

        const labels = dailyData.map(item => {
            const date = new Date(item.operation_date);
            return date.toLocaleDateString('ar-SA');
        }).reverse();

        const addData = dailyData.map(item => item.add_operations || 0).reverse();
        const removeData = dailyData.map(item => item.remove_operations || 0).reverse();

        this.charts.dailyOperations = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'إضافة / Add',
                    data: addData,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'سحب / Remove',
                    data: removeData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    },
                    x: {
                        display: true
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // تحميل رسم توزيع العمليات
    // Load operations distribution chart
    async loadOperationsDistributionChart() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/operations?limit=1000', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.createOperationsDistributionChart(data.operations);
            }
        } catch (error) {
            console.error('خطأ في تحميل رسم توزيع العمليات / Operations distribution chart error:', error);
        }
    }

    // إنشاء رسم توزيع العمليات
    // Create operations distribution chart
    createOperationsDistributionChart(operations) {
        const ctx = document.getElementById('operationsDistributionChart');
        if (!ctx) return;
        
        if (this.charts.operationsDistribution) {
            this.charts.operationsDistribution.destroy();
        }

        const statusCounts = {
            pending: 0,
            approved: 0,
            rejected: 0
        };

        if (operations && operations.length > 0) {
        operations.forEach(op => {
                if (op.status && statusCounts.hasOwnProperty(op.status)) {
            statusCounts[op.status]++;
                }
            });
        }

        const total = statusCounts.pending + statusCounts.approved + statusCounts.rejected;
        
        if (total === 0) {
            const ctx2d = ctx.getContext('2d');
            ctx2d.clearRect(0, 0, ctx.width, ctx.height);
            ctx2d.font = '16px Arial';
            ctx2d.fillStyle = '#666';
            ctx2d.textAlign = 'center';
            ctx2d.fillText('لا توجد بيانات / No data available', ctx.width / 2, ctx.height / 2);
            return;
        }

        this.charts.operationsDistribution = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['معلقة / Pending', 'موافق عليها / Approved', 'مرفوضة / Rejected'],
                datasets: [{
                    data: [statusCounts.pending, statusCounts.approved, statusCounts.rejected],
                    backgroundColor: ['#f39c12', '#27ae60', '#e74c3c'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // تحميل العمليات الأخيرة
    // Load recent operations
    async loadRecentOperations() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/operations?limit=10', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayRecentOperations(data.operations);
            }
        } catch (error) {
            console.error('خطأ في تحميل العمليات الأخيرة / Recent operations loading error:', error);
        }
    }

    // عرض العمليات الأخيرة
    // Display recent operations
    displayRecentOperations(operations) {
        const container = document.getElementById('recentOperations');
        
        if (!operations || operations.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p>لا توجد عمليات حديثة<br>No recent operations</p>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>الموظف / Employee</th>
                            <th>المنتج / Product</th>
                            <th>النوع / Type</th>
                            <th>الكمية / Quantity</th>
                            <th>التاريخ / Date</th>
                            <th>الحالة / Status</th>
                            <th>الإجراءات / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${operations.map(operation => this.createOperationRow(operation)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
    }

    // إنشاء صف العملية
    // Create operation row
    createOperationRow(operation) {
        const operationType = operation.operation_type === 'add' ? 'إضافة' : 'سحب';
        const operationTypeEn = operation.operation_type === 'add' ? 'Add' : 'Remove';
        const operationClass = operation.operation_type === 'add' ? 'text-success' : 'text-danger';
        const operationIcon = operation.operation_type === 'add' ? 'fa-plus' : 'fa-minus';
        
        const statusBadge = this.getStatusBadge(operation.status);
        const date = new Date(operation.operation_date).toLocaleDateString('ar-SA');
        const time = new Date(operation.operation_date).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const actions = operation.status === 'pending' ? `
            <button class="btn btn-success btn-sm me-1" onclick="approveOperation(${operation.id})" title="موافقة / Approve">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="rejectOperation(${operation.id})" title="رفض / Reject">
                <i class="fas fa-times"></i>
            </button>
        ` : '-';

        return `
            <tr>
                <td>
                    <div>
                        <strong>${operation.user_name}</strong>
                        <br><small class="text-muted">${operation.username}</small>
                    </div>
                </td>
                <td>
                    <div>
                        <strong>${operation.device_name}</strong>
                        <br><small class="text-muted">${operation.barcode}</small>
                    </div>
                </td>
                <td>
                    <span class="${operationClass}">
                        <i class="fas ${operationIcon} me-1"></i>
                        ${operationType} / ${operationTypeEn}
                    </span>
                </td>
                <td><strong>${operation.quantity}</strong></td>
                <td>
                    <div>
                        ${date}
                        <br><small class="text-muted">${time}</small>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>
        `;
    }

    // الحصول على شارة الحالة
    // Get status badge
    getStatusBadge(status) {
        const statusMap = {
            'pending': { class: 'bg-warning', text: 'معلقة / Pending' },
            'approved': { class: 'bg-success', text: 'موافق عليها / Approved' },
            'rejected': { class: 'bg-danger', text: 'مرفوضة / Rejected' }
        };

        const statusInfo = statusMap[status] || { class: 'bg-secondary', text: status };
        return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
    }

    // تحميل العمليات
    // Load operations
    async loadOperations(page = 1, filters = {}) {
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                page: page,
                limit: 20,
                ...filters
            });

            const response = await fetch(`/api/inventory/operations?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayOperationsTable(data.operations);
                this.displayOperationsPagination(data.pagination);
            }
        } catch (error) {
            console.error('خطأ في تحميل العمليات / Operations loading error:', error);
        }
    }

    // عرض جدول العمليات
    // Display operations table
    displayOperationsTable(operations) {
        const tbody = document.getElementById('operationsTableBody');
        
        if (!operations || operations.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>لا توجد عمليات / No operations found</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = operations.map(operation => this.createOperationRow(operation)).join('');
    }

    // عرض ترقيم العمليات
    // Display operations pagination
    displayOperationsPagination(pagination) {
        const container = document.getElementById('operationsPagination');
        
        if (pagination.total_pages <= 1) {
            container.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // Previous button
        if (pagination.current_page > 1) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="loadOperations(${pagination.current_page - 1})">السابق</a>
                </li>
            `;
        }

        // Page numbers
        for (let i = 1; i <= pagination.total_pages; i++) {
            const activeClass = i === pagination.current_page ? 'active' : '';
            paginationHTML += `
                <li class="page-item ${activeClass}">
                    <a class="page-link" href="#" onclick="loadOperations(${i})">${i}</a>
                </li>
            `;
        }

        // Next button
        if (pagination.current_page < pagination.total_pages) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="loadOperations(${pagination.current_page + 1})">التالي</a>
                </li>
            `;
        }

        container.innerHTML = paginationHTML;
    }

    // الموافقة على العملية
    // Approve operation
    async approveOperation(operationId) {
        const notes = prompt('ملاحظات الموافقة (اختياري) / Approval notes (optional):');
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                return;
            }

            const response = await this.fetchWithRetry(`/api/inventory/operations/${operationId}/approve`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notes: notes || null })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification(data.message || 'تمت الموافقة على العملية / Operation approved', 'success');
                setTimeout(() => {
                    this.refreshCurrentSection();
                }, 500);
            } else {
                this.showNotification(data.message || data.error || 'خطأ في الموافقة / Approval error', 'danger');
            }
        } catch (error) {
            console.error('خطأ في الموافقة على العملية / Operation approval error:', error);
            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // رفض العملية
    // Reject operation
    async rejectOperation(operationId) {
        const notes = prompt('سبب الرفض / Rejection reason:');
        if (!notes) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/inventory/operations/${operationId}/reject`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notes })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('تم رفض العملية / Operation rejected', 'success');
                this.refreshCurrentSection();
            } else {
                this.showNotification(data.message || 'خطأ في الرفض / Rejection error', 'danger');
            }
        } catch (error) {
            console.error('خطأ في رفض العملية / Operation rejection error:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
        }
    }

    // تصفية العمليات
    // Filter operations
    filterOperations() {
        const filters = {
            status: document.getElementById('operationStatusFilter').value,
            operation_type: document.getElementById('operationTypeFilter').value,
            date_from: document.getElementById('operationDateFilter').value,
            date_to: document.getElementById('operationDateFilter').value
        };

        // Remove empty filters
        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
        });

        this.loadOperations(1, filters);
    }

    // تحديث العمليات
    // Refresh operations
    refreshOperations() {
        this.loadOperations();
    }

    // عرض القسم
    // Show section
    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('[id$="Section"]').forEach(section => {
            section.classList.add('hidden');
        });

        // Show selected section
        document.getElementById(sectionName + 'Section').classList.remove('hidden');

        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.classList.add('active');

        // Update page title
        const titles = {
            dashboard: 'لوحة التحكم / Dashboard',
            operations: 'العمليات / Operations',
            devices: 'المنتجات / Products',
            users: 'المستخدمين / Users',
            reports: 'التقارير / Reports',
            activity: 'سجل النشاطات / Activity Log'
        };
        document.getElementById('pageTitle').textContent = titles[sectionName] || sectionName;

        this.currentSection = sectionName;

        // Load section data
        switch (sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'operations':
                this.loadOperations();
                break;
            case 'devices':
                this.loadDevices();
                break;
            case 'users':
                this.loadUsers();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'activity':
                this.loadActivityLog();
                break;
        }
    }

    // تحميل قسم الأجهزة
    // Load devices section
    async loadDevices() {
        const section = document.getElementById('devicesSection');
        if (!section) return;

        section.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5><i class="fas fa-box me-2"></i>إدارة المنتجات / Products Management</h5>
                    <div>
                        <button class="btn btn-success btn-sm me-2" onclick="showAddDeviceModal()">
                            <i class="fas fa-plus me-2"></i>إضافة منتج / Add Product
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="refreshDevices()">
                            <i class="fas fa-sync-alt me-2"></i>تحديث / Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-4">
                            <input type="text" class="form-control" id="deviceSearchInput" 
                                   placeholder="بحث عن منتج / Search product">
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="deviceStatusFilter">
                                <option value="">جميع الحالات / All Status</option>
                                <option value="available">متاح / Available</option>
                                <option value="assigned">معين / Assigned</option>
                                <option value="maintenance">صيانة / Maintenance</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" id="deviceTypeFilter">
                                <option value="">جميع الأنواع / All Types</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <button class="btn btn-secondary w-100" onclick="filterDevices()">
                                <i class="fas fa-filter me-2"></i>تصفية / Filter
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>الرمز الشريطي / Barcode</th>
                                    <th>الاسم / Name</th>
                                    <th>النوع / Type</th>
                                    <th>الكمية / Quantity</th>
                                    <th>الحالة / Status</th>
                                    <th>الإجراءات / Actions</th>
                                </tr>
                            </thead>
                            <tbody id="devicesTableBody">
                                <tr>
                                    <td colspan="6" class="text-center">
                                        <div class="spinner-border text-primary" role="status"></div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <nav>
                        <ul class="pagination justify-content-center" id="devicesPagination"></ul>
                    </nav>
                </div>
            </div>
        `;

        await this.loadDevicesList();
        this.setupDevicesEventListeners();
    }

    // تحميل قائمة الأجهزة
    // Load devices list
    async loadDevicesList(page = 1, filters = {}) {
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                page: page,
                limit: 20,
                ...filters
            });

            const response = await fetch(`/api/devices?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayDevicesTable(data.devices);
                this.displayDevicesPagination(data.pagination);
            }
        } catch (error) {
            console.error('خطأ في تحميل المنتجات / Error loading products:', error);
        }
    }

    // عرض جدول الأجهزة
    // Display devices table
    displayDevicesTable(devices) {
        const tbody = document.getElementById('devicesTableBody');
        if (!tbody) return;

        if (!devices || devices.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>لا توجد منتجات / No products found</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = devices.map(device => `
            <tr>
                <td><code>${device.barcode}</code></td>
                <td><strong>${device.device_name}</strong></td>
                <td>${device.device_type}</td>
                <td>${device.calculated_quantity || device.current_quantity}</td>
                <td><span class="badge bg-${this.getDeviceStatusColor(device.status)}">${this.getDeviceStatusText(device.status)}</span></td>
                <td>
                    <button class="btn btn-sm btn-info me-1" onclick="viewDevice(${device.id})" title="عرض / View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editDevice(${device.id})" title="تعديل / Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // الحصول على لون حالة الجهاز
    // Get device status color
    getDeviceStatusColor(status) {
        const colors = {
            'available': 'success',
            'assigned': 'primary',
            'maintenance': 'warning',
            'damaged': 'danger',
            'disposed': 'secondary'
        };
        return colors[status] || 'secondary';
    }

    // الحصول على نص حالة الجهاز
    // Get device status text
    getDeviceStatusText(status) {
        const texts = {
            'available': 'متاح / Available',
            'assigned': 'معين / Assigned',
            'maintenance': 'صيانة / Maintenance',
            'damaged': 'تالف / Damaged',
            'disposed': 'مستبعد / Disposed'
        };
        return texts[status] || status;
    }

    // عرض ترقيم الأجهزة
    // Display devices pagination
    displayDevicesPagination(pagination) {
        const container = document.getElementById('devicesPagination');
        if (!container || !pagination || pagination.total_pages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        if (pagination.current_page > 1) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadDevicesPage(${pagination.current_page - 1})">السابق</a></li>`;
        }

        for (let i = 1; i <= pagination.total_pages; i++) {
            const activeClass = i === pagination.current_page ? 'active' : '';
            paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="loadDevicesPage(${i})">${i}</a></li>`;
        }

        if (pagination.current_page < pagination.total_pages) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadDevicesPage(${pagination.current_page + 1})">التالي</a></li>`;
        }

        container.innerHTML = paginationHTML;
    }

    // إعداد مستمعي أحداث الأجهزة
    // Setup devices event listeners
    setupDevicesEventListeners() {
        document.getElementById('deviceSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.filterDevices();
            }
        });
    }

    // تحميل قسم المستخدمين
    // Load users section
    async loadUsers() {
        const section = document.getElementById('usersSection');
        if (!section) return;

        section.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5><i class="fas fa-users me-2"></i>إدارة المستخدمين / Users Management</h5>
                    <div>
                        <button class="btn btn-success btn-sm me-2" onclick="showAddUserModal()">
                            <i class="fas fa-user-plus me-2"></i>إضافة مستخدم / Add User
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="refreshUsers()">
                            <i class="fas fa-sync-alt me-2"></i>تحديث / Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <input type="text" class="form-control" id="userSearchInput" 
                                   placeholder="بحث عن مستخدم / Search user">
                        </div>
                        <div class="col-md-3">
                            <select class="form-select" id="userRoleFilter">
                                <option value="">جميع الأدوار / All Roles</option>
                                <option value="admin">مدير / Admin</option>
                                <option value="employee">موظف / Employee</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <button class="btn btn-secondary w-100" onclick="filterUsers()">
                                <i class="fas fa-filter me-2"></i>تصفية / Filter
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>اسم المستخدم / Username</th>
                                    <th>الاسم الكامل / Full Name</th>
                                    <th>الدور / Role</th>
                                    <th>القسم / Department</th>
                                    <th>الحالة / Status</th>
                                    <th>الإجراءات / Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr>
                                    <td colspan="6" class="text-center">
                                        <div class="spinner-border text-primary" role="status"></div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <nav>
                        <ul class="pagination justify-content-center" id="usersPagination"></ul>
                    </nav>
                </div>
            </div>
        `;

        await this.loadUsersList();
    }

    // تحميل قائمة المستخدمين
    // Load users list
    async loadUsersList(page = 1, filters = {}) {
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                page: page,
                limit: 20,
                ...filters
            });

            const response = await fetch(`/api/admin/users?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayUsersTable(data.users);
                this.displayUsersPagination(data.pagination);
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدمين / Error loading users:', error);
        }
    }

    // عرض جدول المستخدمين
    // Display users table
    displayUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>لا يوجد مستخدمين / No users found</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.full_name}</td>
                <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role === 'admin' ? 'مدير / Admin' : 'موظف / Employee'}</span></td>
                <td>${user.department || '-'}</td>
                <td><span class="badge bg-${user.is_active ? 'success' : 'secondary'}">${user.is_active ? 'نشط / Active' : 'غير نشط / Inactive'}</span></td>
                <td>
                    <button class="btn btn-sm btn-info me-1" onclick="viewUser(${user.id})" title="عرض / View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning me-1" onclick="editUser(${user.id})" title="تعديل / Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})" title="حذف / Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // عرض ترقيم المستخدمين
    // Display users pagination
    displayUsersPagination(pagination) {
        const container = document.getElementById('usersPagination');
        if (!container || !pagination || pagination.total_pages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        if (pagination.current_page > 1) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadUsersPage(${pagination.current_page - 1})">السابق</a></li>`;
        }

        for (let i = 1; i <= pagination.total_pages; i++) {
            const activeClass = i === pagination.current_page ? 'active' : '';
            paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="loadUsersPage(${i})">${i}</a></li>`;
        }

        if (pagination.current_page < pagination.total_pages) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadUsersPage(${pagination.current_page + 1})">التالي</a></li>`;
        }

        container.innerHTML = paginationHTML;
    }

    // تحميل قسم التقارير
    // Load reports section
    async loadReports() {
        const section = document.getElementById('reportsSection');
        if (!section) return;

        section.innerHTML = `
            <div class="row">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header">
                            <h5><i class="fas fa-chart-bar me-2"></i>التقارير / Reports</h5>
                        </div>
                        <div class="card-body">
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-primary">
                                        <div class="card-body text-center">
                                            <i class="fas fa-boxes fa-3x text-primary mb-3"></i>
                                            <h6>تقرير المخزون / Inventory Report</h6>
                                            <button class="btn btn-primary btn-sm" onclick="generateInventoryReport()">
                                                <i class="fas fa-download me-2"></i>تحميل / Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-success">
                                        <div class="card-body text-center">
                                            <i class="fas fa-users fa-3x text-success mb-3"></i>
                                            <h6>تقرير الموظفين / Employees Report</h6>
                                            <button class="btn btn-success btn-sm" onclick="generateEmployeeReport()">
                                                <i class="fas fa-download me-2"></i>تحميل / Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-warning">
                                        <div class="card-body text-center">
                                            <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                                            <h6>مخزون منخفض / Low Stock</h6>
                                            <button class="btn btn-warning btn-sm" onclick="generateLowStockReport()">
                                                <i class="fas fa-download me-2"></i>تحميل / Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-info">
                                        <div class="card-body text-center">
                                            <i class="fas fa-calendar-alt fa-3x text-info mb-3"></i>
                                            <h6>عمليات يومية / Daily Operations</h6>
                                            <button class="btn btn-info btn-sm" onclick="generateDailyReport()">
                                                <i class="fas fa-download me-2"></i>تحميل / Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="reportContent"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // تحميل قسم سجل النشاطات
    // Load activity log section
    async loadActivityLog() {
        const section = document.getElementById('activitySection');
        if (!section) return;

        section.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5><i class="fas fa-history me-2"></i>سجل النشاطات / Activity Log</h5>
                    <button class="btn btn-primary btn-sm" onclick="refreshActivityLog()">
                        <i class="fas fa-sync-alt me-2"></i>تحديث / Refresh
                    </button>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-4">
                            <input type="date" class="form-control" id="activityDateFrom" 
                                   placeholder="من تاريخ / From Date">
                        </div>
                        <div class="col-md-4">
                            <input type="date" class="form-control" id="activityDateTo" 
                                   placeholder="إلى تاريخ / To Date">
                        </div>
                        <div class="col-md-4">
                            <button class="btn btn-secondary w-100" onclick="filterActivityLog()">
                                <i class="fas fa-filter me-2"></i>تصفية / Filter
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>المستخدم / User</th>
                                    <th>النشاط / Activity</th>
                                    <th>الجدول / Table</th>
                                    <th>التاريخ / Date</th>
                                    <th>التفاصيل / Details</th>
                                </tr>
                            </thead>
                            <tbody id="activityTableBody">
                                <tr>
                                    <td colspan="5" class="text-center">
                                        <div class="spinner-border text-primary" role="status"></div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        await this.loadActivityLogData();
    }

    // تحميل بيانات سجل النشاطات
    // Load activity log data
    async loadActivityLogData(filters = {}) {
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams(filters);

            const response = await fetch(`/api/admin/activity-log?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayActivityLogTable(data.activities || []);
            }
        } catch (error) {
            console.error('خطأ في تحميل سجل النشاطات / Error loading activity log:', error);
        }
    }

    // عرض جدول سجل النشاطات
    // Display activity log table
    displayActivityLogTable(logs) {
        const tbody = document.getElementById('activityTableBody');
        if (!tbody) return;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>لا توجد نشاطات / No activities found</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => {
            let detailsText = '-';
            try {
                if (log.new_values) {
                    const newVals = typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values;
                    detailsText = Object.entries(newVals).map(([key, val]) => `${key}: ${val}`).join(', ');
                } else if (log.changes) {
                    const changes = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
                    detailsText = Object.entries(changes).map(([key, val]) => `${key}: ${val}`).join(', ');
                }
            } catch (e) {
                detailsText = log.new_values || log.changes || '-';
            }
            
            return `
            <tr>
                <td>${log.user_name || '-'}</td>
                <td><span class="badge bg-info">${log.action || '-'}</span></td>
                <td>${log.table_name || '-'}</td>
                <td>${new Date(log.created_at).toLocaleString('ar-SA')}</td>
                <td><small>${detailsText}</small></td>
            </tr>
        `;
        }).join('');
    }

    // تصفية الأجهزة
    // Filter devices
    filterDevices() {
        const filters = {
            search: document.getElementById('deviceSearchInput')?.value || '',
            status: document.getElementById('deviceStatusFilter')?.value || '',
            type: document.getElementById('deviceTypeFilter')?.value || ''
        };

        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
        });

        this.loadDevicesList(1, filters);
    }

    // تصفية المستخدمين
    // Filter users
    filterUsers() {
        const filters = {
            search: document.getElementById('userSearchInput')?.value || '',
            role: document.getElementById('userRoleFilter')?.value || ''
        };

        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
        });

        this.loadUsersList(1, filters);
    }

    // تصفية سجل النشاطات
    // Filter activity log
    filterActivityLog() {
        const filters = {
            date_from: document.getElementById('activityDateFrom')?.value || '',
            date_to: document.getElementById('activityDateTo')?.value || ''
        };

        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
        });

        this.loadActivityLogData(filters);
    }

    // تحديث القسم الحالي
    // Refresh current section
    refreshCurrentSection() {
        this.showSection(this.currentSection);
    }

    // البحث الشامل عن المنتج
    // Global product search
    async performGlobalProductSearch() {
        const searchTerm = document.getElementById('globalProductSearch').value.trim();
        
        if (!searchTerm) {
            document.getElementById('globalSearchResults').style.display = 'none';
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/devices?search=${encodeURIComponent(searchTerm)}&limit=10`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const resultsDiv = document.getElementById('globalSearchResults');
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.devices && data.devices.length > 0) {
                    resultsDiv.innerHTML = `
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong>نتائج البحث / Search Results (${data.devices.length})</strong>
                            <button class="btn btn-sm btn-link p-0" onclick="hideGlobalSearchResults()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="list-group">
                            ${data.devices.map(product => `
                                <a href="#" class="list-group-item list-group-item-action" onclick="selectProductFromSearch(${product.id}); return false;">
                                    <div class="d-flex w-100 justify-content-between">
                                        <h6 class="mb-1">${product.device_name}</h6>
                                        <small><code>${product.barcode}</code></small>
                                    </div>
                                    <p class="mb-1">
                                        <span class="badge bg-secondary me-1">${product.device_type}</span>
                                        <span class="badge bg-${product.status === 'available' ? 'success' : 'warning'}">${this.getDeviceStatusText(product.status)}</span>
                                    </p>
                                    <small>الكمية المتاحة / Available: <strong>${product.calculated_quantity || product.current_quantity}</strong></small>
                                </a>
                            `).join('')}
                        </div>
                        ${data.pagination.total_items > 10 ? `
                            <div class="text-center mt-2">
                                <button class="btn btn-sm btn-primary" onclick="showSection('devices'); filterDevicesWithSearch('${searchTerm}'); hideGlobalSearchResults();">
                                    عرض جميع النتائج (${data.pagination.total_items}) / Show All Results
                                </button>
                            </div>
                        ` : ''}
                    `;
                    resultsDiv.style.display = 'block';
                } else {
                    resultsDiv.innerHTML = `
                        <div class="text-center text-muted py-3">
                            <i class="fas fa-search fa-2x mb-2"></i>
                            <p>لا توجد نتائج / No results found</p>
                        </div>
                    `;
                    resultsDiv.style.display = 'block';
                }
            } else {
                resultsDiv.innerHTML = `
                    <div class="text-center text-danger py-3">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        خطأ في البحث / Search error
                    </div>
                `;
                resultsDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('خطأ في البحث الشامل / Global search error:', error);
            document.getElementById('globalSearchResults').style.display = 'none';
        }
    }

    // إخفاء نتائج البحث الشامل
    // Hide global search results
    hideGlobalSearchResults() {
        document.getElementById('globalSearchResults').style.display = 'none';
    }

    // اختيار منتج من نتائج البحث
    // Select product from search results
    selectProductFromSearch(productId) {
        this.showSection('devices');
        setTimeout(() => {
            const searchInput = document.getElementById('deviceSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
            this.loadDevicesList(1);
            this.showNotification('تم تحميل المنتج / Product loaded', 'success');
            this.hideGlobalSearchResults();
            document.getElementById('globalProductSearch').value = '';
        }, 100);
    }

    // تصفية الأجهزة مع البحث
    // Filter devices with search
    filterDevicesWithSearch(searchTerm) {
        const searchInput = document.getElementById('deviceSearchInput');
        if (searchInput) {
            searchInput.value = searchTerm;
            this.filterDevices();
        }
    }

    // تبديل الشريط الجانبي
    // Toggle sidebar
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        sidebar.classList.toggle('show');
        mainContent.classList.toggle('expanded');
    }

    // تغيير كلمة المرور
    // Change password
    async changePassword() {
        const currentPassword = prompt('كلمة المرور الحالية / Current Password:');
        if (!currentPassword) return;

        const newPassword = prompt('كلمة المرور الجديدة / New Password:');
        if (!newPassword) return;

        if (newPassword.length < 6) {
            this.showNotification('كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('تم تغيير كلمة المرور بنجاح / Password changed successfully', 'success');
            } else {
                this.showNotification(data.message || 'خطأ في تغيير كلمة المرور / Password change error', 'danger');
            }
        } catch (error) {
            console.error('خطأ في تغيير كلمة المرور / Password change error:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
        }
    }

    // عرض قسم تسجيل الدخول
    // Show login section
    showLoginSection() {
        const loginSection = document.getElementById('loginSection');
        const dashboardSection = document.getElementById('dashboardSection');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        if (loginSection) {
            loginSection.classList.remove('hidden');
            loginSection.style.display = 'block';
        }
        
        if (dashboardSection) {
            dashboardSection.classList.add('hidden');
            dashboardSection.style.display = 'none';
        }
        
        if (sidebar) {
            sidebar.classList.add('collapsed');
            sidebar.style.display = 'none';
        }
        
        if (mainContent) {
            mainContent.classList.add('expanded');
        }
        
        // إخفاء جميع الأقسام الأخرى
        // Hide all other sections
        const allSections = document.querySelectorAll('[id$="Section"]');
        allSections.forEach(section => {
            if (section.id !== 'loginSection') {
                section.classList.add('hidden');
                section.style.display = 'none';
            }
        });
    }

    // عرض قسم التطبيق
    // Show app section
    showAppSection() {
        const loginSection = document.getElementById('loginSection');
        const dashboardSection = document.getElementById('dashboardSection');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        if (loginSection) {
            loginSection.classList.add('hidden');
            loginSection.style.display = 'none';
        }
        
        if (dashboardSection) {
            dashboardSection.classList.remove('hidden');
            dashboardSection.style.display = 'block';
        }
        
        if (sidebar) {
            sidebar.classList.remove('collapsed');
            sidebar.style.display = 'block';
        }
        
        if (mainContent) {
            mainContent.classList.remove('expanded');
        }
        
        // إخفاء جميع الأقسام الأخرى وإظهار dashboard فقط
        // Hide all other sections and show dashboard only
        const allSections = document.querySelectorAll('[id$="Section"]');
        allSections.forEach(section => {
            if (section.id !== 'dashboardSection' && section.id !== 'loginSection') {
                section.classList.add('hidden');
            }
        });
    }

    // تحديث معلومات المستخدم
    // Update user information
    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('adminName').textContent = this.currentUser.full_name;
        }
    }

    // عرض/إخفاء التحميل
    // Show/hide loading
    showLoading(elementId, show) {
        const element = document.getElementById(elementId);
        if (show) {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    }

    // عرض الإشعار
    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const content = document.getElementById('notificationContent');
        
        content.className = `alert alert-${type}`;
        content.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)} me-2"></i>
            ${message}
        `;
        
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }

    // الحصول على أيقونة الإشعار
    // Get notification icon
    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'danger': 'exclamation-triangle',
            'warning': 'exclamation-circle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // إظهار نافذة إضافة/سحب المخزون اليدوي
    // Show manual stock modal
    async showManualStockModal(operationType = 'add') {
        this.currentManualOperationType = operationType;
        const modal = new bootstrap.Modal(document.getElementById('manualStockModal'));
        modal.show();
        
        await this.loadDevicesForManualStock();
        
        document.getElementById('manualStockForm').reset();
        document.getElementById('manualStockDeviceInfo').style.display = 'none';
        document.getElementById('manualStockAvailableInfo').style.display = 'none';
        
        const header = document.getElementById('manualStockModalHeader');
        const title = document.getElementById('manualStockModalTitle');
        const submitBtn = document.getElementById('manualStockSubmitBtn');
        
        if (operationType === 'remove') {
            header.className = 'modal-header bg-danger text-white';
            title.innerHTML = '<i class="fas fa-minus-circle me-2"></i>سحب مخزون يدوي / Manual Stock Removal';
            submitBtn.className = 'btn btn-danger';
            submitBtn.innerHTML = '<i class="fas fa-minus me-2"></i>سحب / Remove Stock';
        } else {
            header.className = 'modal-header bg-success text-white';
            title.innerHTML = '<i class="fas fa-plus-circle me-2"></i>إضافة مخزون يدوي / Manual Stock Addition';
            submitBtn.className = 'btn btn-success';
            submitBtn.innerHTML = '<i class="fas fa-plus me-2"></i>إضافة / Add Stock';
        }
    }

    // تحميل الأجهزة لإضافة المخزون
    // Load devices for manual stock
    async loadDevicesForManualStock() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/devices?limit=1000', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const select = document.getElementById('manualStockDeviceId');
                select.innerHTML = '<option value="">اختر منتج / Select product</option>';
                
                data.devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = `${device.device_name} (${device.barcode})`;
                    select.appendChild(option);
                });
                
                document.getElementById('manualStockDeviceSelect').style.display = 'block';
            }
        } catch (error) {
            console.error('خطأ في تحميل المنتجات / Error loading products:', error);
        }
    }

    // البحث عن جهاز لإضافة المخزون
    // Search device for manual stock
    async searchDeviceForManualStock() {
        const barcode = document.getElementById('manualStockBarcode').value.trim();
        
        if (!barcode) {
            this.showNotification('يرجى إدخال الرمز الشريطي / Please enter barcode', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/devices/barcode/${barcode}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('manualStockDeviceId').value = data.device.id;
                this.displayManualStockDeviceInfo(data.device);
            } else {
                this.showNotification(data.message || 'المنتج غير موجود / Product not found', 'warning');
                document.getElementById('manualStockDeviceInfo').style.display = 'none';
            }
        } catch (error) {
            console.error('خطأ في البحث / Search error:', error);
            this.showNotification('خطأ في البحث / Search error', 'danger');
        }
    }

    // عرض معلومات الجهاز في نموذج إضافة/سحب المخزون
    // Display device info in manual stock form
    displayManualStockDeviceInfo(device) {
        const availableQty = device.calculated_quantity || device.current_quantity;
        document.getElementById('manualStockDeviceName').textContent = device.device_name;
        document.getElementById('manualStockDeviceDetails').textContent = 
            `النوع: ${device.device_type} | الكمية الحالية: ${availableQty}`;
        document.getElementById('manualStockDeviceInfo').style.display = 'block';
        
        if (this.currentManualOperationType === 'remove') {
            document.getElementById('manualStockAvailableQty').textContent = availableQty;
            document.getElementById('manualStockAvailableInfo').style.display = 'block';
        } else {
            document.getElementById('manualStockAvailableInfo').style.display = 'none';
        }
    }

    // إرسال إضافة/سحب المخزون اليدوي
    // Submit manual stock operation
    async submitManualStock() {
        const operationType = this.currentManualOperationType || 'add';
        const deviceId = document.getElementById('manualStockDeviceId').value;
        const barcode = document.getElementById('manualStockBarcode').value.trim();
        const quantity = parseInt(document.getElementById('manualStockQuantity').value);
        const reason = document.getElementById('manualStockReason').value;
        const notes = document.getElementById('manualStockNotes').value;
        const location = document.getElementById('manualStockLocation').value;

        if (!deviceId && !barcode) {
            this.showNotification('يرجى اختيار أو البحث عن منتج / Please select or search for a product', 'warning');
            return;
        }

        if (!quantity || quantity <= 0) {
            this.showNotification('يرجى إدخال كمية صحيحة / Please enter valid quantity', 'warning');
            return;
        }

        const endpoint = operationType === 'remove' ? '/api/inventory/manual-remove' : '/api/inventory/manual-add';
        
        // إظهار مؤشر التحميل
        // Show loading indicator
        const submitBtn = document.getElementById('manualStockSubmitBtn');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري المعالجة / Processing...';
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            const response = await this.fetchWithRetry(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    device_id: deviceId || null,
                    barcode: barcode || null,
                    quantity: quantity,
                    reason: reason || null,
                    notes: notes || null,
                    location: location || null
                })
            });

            const data = await response.json();

            // استعادة الزر
            // Restore button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            if (response.ok) {
                const successMsg = operationType === 'remove' ? 
                    'تم سحب المخزون بنجاح / Stock removed successfully' : 
                    'تم إضافة المخزون بنجاح / Stock added successfully';
                this.showNotification(data.message || successMsg, 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('manualStockModal'));
                if (modal) {
                    modal.hide();
                }
                setTimeout(() => {
                    this.refreshCurrentSection();
                }, 500);
            } else {
                const errorMsg = operationType === 'remove' ? 
                    data.message || data.error || 'خطأ في سحب المخزون / Error removing stock' : 
                    data.message || data.error || 'خطأ في إضافة المخزون / Error adding stock';
                this.showNotification(errorMsg, 'danger');
            }
        } catch (error) {
            console.error('خطأ في إضافة المخزون / Error adding stock:', error);
            
            // استعادة الزر في حالة الخطأ
            // Restore button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // عرض المنتج
    // View product
    async viewProduct(productId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/devices/id/${productId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const product = data.device;
                
                // ملء بيانات العرض
                // Fill view data
                document.getElementById('viewBarcode').textContent = product.barcode || '-';
                document.getElementById('viewDeviceName').textContent = product.device_name || '-';
                document.getElementById('viewDeviceType').textContent = product.device_type || '-';
                document.getElementById('viewBrand').textContent = product.brand || '-';
                document.getElementById('viewModel').textContent = product.model || '-';
                document.getElementById('viewCurrentQuantity').textContent = product.calculated_quantity || product.current_quantity || 0;
                document.getElementById('viewMinimumQuantity').textContent = product.minimum_quantity || '-';
                document.getElementById('viewStatus').innerHTML = `<span class="badge bg-${this.getDeviceStatusColor(product.status)}">${this.getDeviceStatusText(product.status)}</span>`;
                document.getElementById('viewLocation').textContent = product.location || '-';
                document.getElementById('viewDescription').textContent = product.description || '-';
                document.getElementById('viewPurchaseDate').textContent = product.purchase_date ? new Date(product.purchase_date).toLocaleDateString('ar-SA') : '-';
                document.getElementById('viewPurchasePrice').textContent = product.purchase_price ? `${product.purchase_price} ريال` : '-';
                document.getElementById('viewWarrantyExpiry').textContent = product.warranty_expiry ? new Date(product.warranty_expiry).toLocaleDateString('ar-SA') : '-';
                document.getElementById('viewSerialNumber').textContent = product.serial_number || '-';

                // عرض الـ modal
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('productViewModal'));
                modal.show();
            } else {
                const data = await response.json();
                this.showNotification(data.message || 'خطأ في جلب المنتج / Error loading product', 'danger');
            }
        } catch (error) {
            console.error('خطأ في عرض المنتج / Error viewing product:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
        }
    }

    // إظهار modal إضافة منتج
    // Show add product modal
    showAddDeviceModal() {
        // إعادة تعيين النموذج
        // Reset form
        document.getElementById('productAddForm').reset();
        
        // تعيين القيم الافتراضية
        // Set default values
        document.getElementById('addCurrentQuantity').value = '1';
        document.getElementById('addMinimumQuantity').value = '1';
        document.getElementById('addStatus').value = 'available';
        
        // عرض الـ modal
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('productAddModal'));
        modal.show();
    }

    // إضافة منتج جديد
    // Add new product
    async submitAddProduct() {
        const productData = {
            barcode: document.getElementById('addBarcode').value.trim(),
            device_name: document.getElementById('addDeviceName').value.trim(),
            device_type: document.getElementById('addDeviceType').value.trim(),
            brand: document.getElementById('addBrand').value.trim() || null,
            model: document.getElementById('addModel').value.trim() || null,
            serial_number: document.getElementById('addSerialNumber').value.trim() || null,
            current_quantity: parseInt(document.getElementById('addCurrentQuantity').value) || 1,
            minimum_quantity: parseInt(document.getElementById('addMinimumQuantity').value) || 1,
            status: document.getElementById('addStatus').value || 'available',
            location: document.getElementById('addLocation').value.trim() || null,
            purchase_date: document.getElementById('addPurchaseDate').value || null,
            purchase_price: document.getElementById('addPurchasePrice').value ? parseFloat(document.getElementById('addPurchasePrice').value) : null,
            warranty_expiry: document.getElementById('addWarrantyExpiry').value || null,
            description: document.getElementById('addDescription').value.trim() || null
        };

        // التحقق من البيانات المطلوبة
        // Validate required fields
        if (!productData.barcode) {
            this.showNotification('الرمز الشريطي مطلوب / Barcode is required', 'warning');
            return;
        }

        if (!productData.device_name) {
            this.showNotification('اسم المنتج مطلوب / Product name is required', 'warning');
            return;
        }

        if (!productData.device_type) {
            this.showNotification('نوع المنتج مطلوب / Product type is required', 'warning');
            return;
        }

        if (productData.current_quantity < 0) {
            this.showNotification('الكمية الحالية يجب أن تكون أكبر من أو تساوي صفر / Current quantity must be greater than or equal to zero', 'warning');
            return;
        }

        if (productData.minimum_quantity < 0) {
            this.showNotification('الكمية الدنيا يجب أن تكون أكبر من أو تساوي صفر / Minimum quantity must be greater than or equal to zero', 'warning');
            return;
        }

        // إظهار مؤشر التحميل
        // Show loading indicator
        const submitBtn = document.querySelector('#productAddModal .btn-success');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الإضافة / Adding...';
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            const response = await this.fetchWithRetry('/api/devices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(productData)
            });

            const data = await response.json();

            // استعادة الزر
            // Restore button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            if (response.ok) {
                this.showNotification(data.message || 'تم إضافة المنتج بنجاح / Product added successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('productAddModal'));
                if (modal) {
                    modal.hide();
                }
                setTimeout(() => {
                    this.loadDevices();
                }, 500);
            } else {
                this.showNotification(data.message || data.error || 'خطأ في إضافة المنتج / Error adding product', 'danger');
            }
        } catch (error) {
            console.error('خطأ في إضافة المنتج / Error adding product:', error);
            
            // استعادة الزر في حالة الخطأ
            // Restore button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // تعديل المنتج
    // Edit product
    async editProduct(productId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/devices/id/${productId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const product = data.device;
                
                // ملء بيانات التعديل
                // Fill edit data
                document.getElementById('editProductId').value = product.id;
                document.getElementById('editBarcode').value = product.barcode || '';
                document.getElementById('editDeviceName').value = product.device_name || '';
                document.getElementById('editDeviceType').value = product.device_type || '';
                document.getElementById('editBrand').value = product.brand || '';
                document.getElementById('editModel').value = product.model || '';
                document.getElementById('editSerialNumber').value = product.serial_number || '';
                document.getElementById('editCurrentQuantity').value = product.current_quantity || 0;
                document.getElementById('editMinimumQuantity').value = product.minimum_quantity || 1;
                document.getElementById('editStatus').value = product.status || 'available';
                document.getElementById('editLocation').value = product.location || '';
                document.getElementById('editPurchaseDate').value = product.purchase_date ? product.purchase_date.split('T')[0] : '';
                document.getElementById('editPurchasePrice').value = product.purchase_price || '';
                document.getElementById('editWarrantyExpiry').value = product.warranty_expiry ? product.warranty_expiry.split('T')[0] : '';
                document.getElementById('editDescription').value = product.description || '';

                // عرض الـ modal
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('productEditModal'));
                modal.show();
            } else {
                const data = await response.json();
                this.showNotification(data.message || 'خطأ في جلب المنتج / Error loading product', 'danger');
            }
        } catch (error) {
            console.error('خطأ في تحميل المنتج للتعديل / Error loading product for edit:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
        }
    }

    // عرض المستخدم
    // View user
    async viewUser(userId) {
        try {
            const token = localStorage.getItem('token');
            const response = await this.fetchWithRetry(`/api/admin/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const user = data.user;
                
                // ملء بيانات العرض
                // Fill view data
                document.getElementById('viewUsername').textContent = user.username || '-';
                document.getElementById('viewFullName').textContent = user.full_name || '-';
                document.getElementById('viewEmail').textContent = user.email || '-';
                document.getElementById('viewPhone').textContent = user.phone || '-';
                document.getElementById('viewRole').innerHTML = `<span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role === 'admin' ? 'مدير / Admin' : 'موظف / Employee'}</span>`;
                document.getElementById('viewDepartment').textContent = user.department || '-';
                document.getElementById('viewUserStatus').innerHTML = `<span class="badge bg-${user.is_active ? 'success' : 'secondary'}">${user.is_active ? 'نشط / Active' : 'غير نشط / Inactive'}</span>`;
                document.getElementById('viewCreatedAt').textContent = user.created_at ? new Date(user.created_at).toLocaleString('ar-SA') : '-';
                document.getElementById('viewUpdatedAt').textContent = user.updated_at ? new Date(user.updated_at).toLocaleString('ar-SA') : '-';

                // عرض الـ modal
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('userViewModal'));
                modal.show();
            } else {
                const data = await response.json();
                this.showNotification(data.message || data.error || 'خطأ في جلب المستخدم / Error loading user', 'danger');
            }
        } catch (error) {
            console.error('خطأ في عرض المستخدم / Error viewing user:', error);
            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // تعديل المستخدم
    // Edit user
    async editUser(userId) {
        try {
            const token = localStorage.getItem('token');
            const response = await this.fetchWithRetry(`/api/admin/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const user = data.user;
                
                // ملء بيانات التعديل
                // Fill edit data
                document.getElementById('editUserId').value = user.id;
                document.getElementById('editUsername').value = user.username || '';
                document.getElementById('editFullName').value = user.full_name || '';
                document.getElementById('editEmail').value = user.email || '';
                document.getElementById('editPhone').value = user.phone || '';
                document.getElementById('editRole').value = user.role || 'employee';
                document.getElementById('editDepartment').value = user.department || '';
                document.getElementById('editIsActive').value = user.is_active ? '1' : '0';

                // عرض الـ modal
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('userEditModal'));
                modal.show();
            } else {
                const data = await response.json();
                this.showNotification(data.message || data.error || 'خطأ في جلب المستخدم / Error loading user', 'danger');
            }
        } catch (error) {
            console.error('خطأ في تحميل المستخدم للتعديل / Error loading user for edit:', error);
            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // إظهار modal إضافة مستخدم
    // Show add user modal
    showAddUserModal() {
        // إعادة تعيين النموذج
        // Reset form
        document.getElementById('userAddForm').reset();
        
        // عرض الـ modal
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('userAddModal'));
        modal.show();
    }

    // إضافة مستخدم جديد
    // Add new user
    async submitAddUser() {
        const userData = {
            username: document.getElementById('addUsername').value.trim(),
            password: document.getElementById('addPassword').value,
            full_name: document.getElementById('addFullName').value.trim(),
            email: document.getElementById('addEmail').value.trim() || null,
            phone: document.getElementById('addPhone').value.trim() || null,
            role: document.getElementById('addRole').value,
            department: document.getElementById('addDepartment').value.trim() || null
        };

        // التحقق من البيانات المطلوبة
        // Validate required fields
        if (!userData.username) {
            this.showNotification('اسم المستخدم مطلوب / Username is required', 'warning');
            return;
        }

        if (!userData.password || userData.password.length < 6) {
            this.showNotification('كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters', 'warning');
            return;
        }

        if (!userData.full_name) {
            this.showNotification('الاسم الكامل مطلوب / Full name is required', 'warning');
            return;
        }

        if (!['admin', 'employee'].includes(userData.role)) {
            this.showNotification('دور غير صالح / Invalid role', 'warning');
            return;
        }

        // إظهار مؤشر التحميل
        // Show loading indicator
        const submitBtn = document.querySelector('#userAddModal .btn-success');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الإضافة / Adding...';
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            const response = await this.fetchWithRetry('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            // استعادة الزر
            // Restore button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            if (response.ok) {
                this.showNotification(data.message || 'تم إضافة المستخدم بنجاح / User added successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('userAddModal'));
                if (modal) {
                    modal.hide();
                }
                setTimeout(() => {
                    this.loadUsers();
                }, 500);
            } else {
                this.showNotification(data.message || data.error || 'خطأ في إضافة المستخدم / Error adding user', 'danger');
            }
        } catch (error) {
            console.error('خطأ في إضافة المستخدم / Error adding user:', error);
            
            // استعادة الزر في حالة الخطأ
            // Restore button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // حفظ تعديلات المستخدم
    // Save user changes
    async submitUserEdit() {
        const userId = document.getElementById('editUserId').value;
        
        if (!userId) {
            this.showNotification('خطأ في معرف المستخدم / User ID error', 'danger');
            return;
        }

        const userData = {
            full_name: document.getElementById('editFullName').value.trim(),
            email: document.getElementById('editEmail').value.trim() || null,
            phone: document.getElementById('editPhone').value.trim() || null,
            role: document.getElementById('editRole').value,
            department: document.getElementById('editDepartment').value.trim() || null,
            is_active: document.getElementById('editIsActive').value === '1'
        };

        // التحقق من البيانات المطلوبة
        // Validate required fields
        if (!userData.full_name) {
            this.showNotification('الاسم الكامل مطلوب / Full name is required', 'warning');
            return;
        }

        if (!['admin', 'employee'].includes(userData.role)) {
            this.showNotification('دور غير صالح / Invalid role', 'warning');
            return;
        }

        // إظهار مؤشر التحميل
        // Show loading indicator
        const submitBtn = document.querySelector('#userEditModal .btn-warning');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ / Saving...';
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                return;
            }

            const response = await this.fetchWithRetry(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            // استعادة الزر
            // Restore button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            if (response.ok) {
                this.showNotification(data.message || 'تم تحديث المستخدم بنجاح / User updated successfully', 'success');
                const modal = bootstrap.Modal.getInstance(document.getElementById('userEditModal'));
                if (modal) {
                    modal.hide();
                }
                setTimeout(() => {
                    this.loadUsers();
                }, 500);
            } else {
                this.showNotification(data.message || data.error || 'خطأ في تحديث المستخدم / Error updating user', 'danger');
            }
        } catch (error) {
            console.error('خطأ في تحديث المستخدم / Error updating user:', error);
            
            // استعادة الزر في حالة الخطأ
            // Restore button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }

            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // حفظ التعديلات
    // Save product changes
    async submitProductEdit() {
        const productId = document.getElementById('editProductId').value;
        
        if (!productId) {
            this.showNotification('خطأ في معرف المنتج / Product ID error', 'danger');
            return;
        }

        // قراءة القيم من الحقول
        // Read values from form fields
        const deviceNameEl = document.getElementById('editDeviceName');
        const deviceTypeEl = document.getElementById('editDeviceType');
        const currentQtyEl = document.getElementById('editCurrentQuantity');
        const minQtyEl = document.getElementById('editMinimumQuantity');

        if (!deviceNameEl || !deviceTypeEl || !currentQtyEl || !minQtyEl) {
            this.showNotification('خطأ في تحميل النموذج / Form loading error', 'danger');
            return;
        }

        // قراءة الكميات وتأكد من أنها أرقام صحيحة
        // Read quantities and ensure they are valid numbers
        const currentQtyValue = currentQtyEl.value.trim();
        const minQtyValue = minQtyEl.value.trim();
        
        const parsedCurrentQty = currentQtyValue !== '' ? parseInt(currentQtyValue) : null;
        const parsedMinQty = minQtyValue !== '' ? parseInt(minQtyValue) : null;

        if (parsedCurrentQty !== null && (isNaN(parsedCurrentQty) || parsedCurrentQty < 0)) {
            this.showNotification('الكمية الحالية يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر / Current quantity must be a valid number greater than or equal to zero', 'warning');
            return;
        }

        if (parsedMinQty !== null && (isNaN(parsedMinQty) || parsedMinQty < 0)) {
            this.showNotification('الكمية الدنيا يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر / Minimum quantity must be a valid number greater than or equal to zero', 'warning');
            return;
        }

        const productData = {
            device_name: deviceNameEl.value.trim(),
            device_type: deviceTypeEl.value.trim(),
            brand: document.getElementById('editBrand')?.value.trim() || null,
            model: document.getElementById('editModel')?.value.trim() || null,
            serial_number: document.getElementById('editSerialNumber')?.value.trim() || null,
            current_quantity: parsedCurrentQty !== null ? parsedCurrentQty : undefined,
            minimum_quantity: parsedMinQty !== null ? parsedMinQty : undefined,
            status: document.getElementById('editStatus')?.value || 'available',
            location: document.getElementById('editLocation')?.value.trim() || null,
            purchase_date: document.getElementById('editPurchaseDate')?.value || null,
            purchase_price: document.getElementById('editPurchasePrice')?.value ? parseFloat(document.getElementById('editPurchasePrice').value) : null,
            warranty_expiry: document.getElementById('editWarrantyExpiry')?.value || null,
            description: document.getElementById('editDescription')?.value.trim() || null
        };

        // التحقق من البيانات المطلوبة
        // Validate required fields
        if (!productData.device_name || !productData.device_type) {
            this.showNotification('يرجى إدخال اسم المنتج ونوعه / Please enter product name and type', 'warning');
            return;
        }

        // التحقق من الكميات
        // Validate quantities
        if (productData.current_quantity < 0) {
            this.showNotification('الكمية الحالية يجب أن تكون أكبر من أو تساوي صفر / Current quantity must be greater than or equal to zero', 'warning');
            return;
        }

        if (productData.minimum_quantity < 0) {
            this.showNotification('الكمية الدنيا يجب أن تكون أكبر من أو تساوي صفر / Minimum quantity must be greater than or equal to zero', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                return;
            }

            // إظهار مؤشر التحميل
            // Show loading indicator
            const submitBtn = document.querySelector('#productEditModal button[onclick="submitProductEdit()"]');
            if (submitBtn) {
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ / Saving...';

                // إرسال البيانات مع الكميات
                // Send data with quantities
                const requestBody = {
                    ...productData,
                    current_quantity: productData.current_quantity !== undefined ? productData.current_quantity : null,
                    minimum_quantity: productData.minimum_quantity !== undefined ? productData.minimum_quantity : null
                };

                console.log('إرسال بيانات التحديث / Sending update data:', requestBody);

                const response = await fetch(`/api/devices/${productId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                // استعادة الزر
                // Restore button
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;

                if (response.ok) {
                    this.showNotification(data.message || 'تم تحديث المنتج بنجاح / Product updated successfully', 'success');
                    
                    // إغلاق الـ modal
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('productEditModal'));
                    if (modal) {
                        modal.hide();
                    }
                    
                    // تحديث قائمة المنتجات
                    // Refresh products list
                    setTimeout(() => {
                        this.loadDevicesList();
                    }, 300);
                } else {
                    this.showNotification(data.message || data.error || 'خطأ في تحديث المنتج / Error updating product', 'danger');
                }
            } else {
                // إرسال البيانات مع الكميات
                // Send data with quantities
                const requestBody = {
                    ...productData,
                    current_quantity: productData.current_quantity !== undefined ? productData.current_quantity : null,
                    minimum_quantity: productData.minimum_quantity !== undefined ? productData.minimum_quantity : null
                };

                console.log('إرسال بيانات التحديث / Sending update data:', requestBody);

                const response = await fetch(`/api/devices/${productId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (response.ok) {
                    this.showNotification(data.message || 'تم تحديث المنتج بنجاح / Product updated successfully', 'success');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('productEditModal'));
                    if (modal) {
                        modal.hide();
                    }
                    setTimeout(() => {
                        this.loadDevicesList();
                    }, 300);
                } else {
                    this.showNotification(data.message || data.error || 'خطأ في تحديث المنتج / Error updating product', 'danger');
                }
            }
        } catch (error) {
            console.error('خطأ في تحديث المنتج / Error updating product:', error);
            this.showNotification('خطأ في الاتصال / Connection error', 'danger');
            
            // استعادة الزر في حالة الخطأ
            // Restore button on error
            const submitBtn = document.querySelector('#productEditModal button[onclick="submitProductEdit()"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ التغييرات / Save Changes';
            }
        }
    }
}

// تشغيل التطبيق
// Initialize app
const app = new AdminApp();

// إضافة الوظائف العامة
// Add global functions
window.showSection = (section) => app.showSection(section);
window.toggleSidebar = () => app.toggleSidebar();
window.logout = () => app.logout();
window.changePassword = () => app.changePassword();
window.approveOperation = (id) => app.approveOperation(id);
window.rejectOperation = (id) => app.rejectOperation(id);
window.loadOperations = (page, filters) => app.loadOperations(page, filters);
window.filterOperations = () => app.filterOperations();
window.refreshOperations = () => app.refreshOperations();
window.showManualStockModal = (type) => app.showManualStockModal(type);
window.searchDeviceForManualStock = () => app.searchDeviceForManualStock();
window.submitManualStock = () => app.submitManualStock();
window.loadDevicesPage = (page) => app.loadDevicesList(page);
window.loadUsersPage = (page) => app.loadUsersList(page);
window.filterDevices = () => app.filterDevices();
window.filterUsers = () => app.filterUsers();
window.refreshDevices = () => app.loadDevices();
window.refreshUsers = () => app.loadUsers();
window.refreshActivityLog = () => app.loadActivityLog();
window.filterActivityLog = () => app.filterActivityLog();
window.viewDevice = (id) => app.viewProduct(id);
window.editDevice = (id) => app.editProduct(id);
window.submitProductEdit = () => app.submitProductEdit();
window.viewUser = (id) => app.viewUser(id);
window.editUser = (id) => app.editUser(id);
window.submitUserEdit = () => app.submitUserEdit();
window.deleteUser = (id) => {
    if (confirm('هل أنت متأكد من الحذف؟ / Are you sure you want to delete?')) {
        console.log('Delete user:', id);
    }
};
window.showAddDeviceModal = () => app.showAddDeviceModal();
window.submitAddProduct = () => app.submitAddProduct();
window.showAddUserModal = () => app.showAddUserModal();
window.submitAddUser = () => app.submitAddUser();
window.generateInventoryReport = () => app.showNotification('قريباً / Coming soon', 'info');
window.generateEmployeeReport = () => app.showNotification('قريباً / Coming soon', 'info');
window.generateLowStockReport = () => app.showNotification('قريباً / Coming soon', 'info');
window.generateDailyReport = () => app.showNotification('قريباً / Coming soon', 'info');
window.performGlobalProductSearch = () => app.performGlobalProductSearch();
window.hideGlobalSearchResults = () => app.hideGlobalSearchResults();
window.selectProductFromSearch = (id) => app.selectProductFromSearch(id);
window.filterDevicesWithSearch = (term) => app.filterDevicesWithSearch(term);

// إعداد مستمعي الأحداث للبحث الشامل
// Setup global search event listeners
function setupGlobalSearchListeners() {
    const globalSearchInput = document.getElementById('globalProductSearch');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                app.performGlobalProductSearch();
            }
        });
        
        globalSearchInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 2) {
                setTimeout(() => app.performGlobalProductSearch(), 300);
            } else {
                app.hideGlobalSearchResults();
            }
        });
    }
    
    // إخفاء نتائج البحث عند النقر خارجها
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        const resultsDiv = document.getElementById('globalSearchResults');
        const searchInput = document.getElementById('globalProductSearch');
        if (resultsDiv && searchInput && !resultsDiv.contains(e.target) && e.target !== searchInput) {
            app.hideGlobalSearchResults();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGlobalSearchListeners);
} else {
    setupGlobalSearchListeners();
}

// معالجة الأخطاء العامة
// Global error handling
window.addEventListener('error', (event) => {
    console.error('خطأ عام / Global error:', event.error);
});

// معالجة الأخطاء غير المعالجة
// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('خطأ غير معالج / Unhandled rejection:', event.reason);
});