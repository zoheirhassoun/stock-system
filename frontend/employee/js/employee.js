// Employee Interface JavaScript
// نظام إدارة المخزون - واجهة الموظفين

class EmployeeApp {
    constructor() {
        this.currentUser = null;
        this.currentDevice = null;
        this.scanner = null;
        this.isScanning = false;
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
        this.loadRecentOperations();
        
        // التأكد من أن loginSection مخفي في البداية إذا كان هناك token
        // Ensure loginSection is hidden initially if token exists
        const token = localStorage.getItem('token');
        if (!token) {
            this.showLoginSection();
        }
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
                this.currentUser = data.user;
                this.showAppSection();
                this.updateUserInfo();
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

        // نموذج العملية
        // Operation form
        document.getElementById('inventoryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitOperation();
        });

        // إدخال الرمز الشريطي
        // Barcode input
        document.getElementById('barcodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchDevice();
            }
        });

        // تغيير نوع العملية
        // Operation type change
        document.getElementById('operationType').addEventListener('change', (e) => {
            this.validateQuantity();
        });

        // تغيير الكمية
        // Quantity change
        document.getElementById('quantity').addEventListener('input', (e) => {
            this.validateQuantity();
        });

        // اختيار جهاز لإضافة المخزون
        // Device selection for manual stock
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
                    this.loadRecentOperations();
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
            this.stopScanner();
            
            // إظهار قسم تسجيل الدخول بدلاً من إعادة التوجيه
            // Show login section instead of redirecting
            this.showLoginSection();
            this.showNotification('تم تسجيل الخروج بنجاح / Logged out successfully', 'info');
        }
    }

    // بدء مسح الرمز الشريطي
    // Start barcode scanner
    startScanner() {
        if (this.isScanning) {
            return;
        }

        const scannerContainer = document.getElementById('scannerContainer');
        scannerContainer.style.display = 'block';

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#scanner'),
                constraints: {
                    width: 400,
                    height: 300,
                    facingMode: "environment"
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: 2,
            decoder: {
                readers: [
                    "code_128_reader",
                    "ean_reader",
                    "ean_8_reader",
                    "code_39_reader",
                    "code_39_vin_reader",
                    "codabar_reader",
                    "upc_reader",
                    "upc_e_reader",
                    "i2of5_reader"
                ]
            },
            locate: true
        }, (err) => {
            if (err) {
                console.error('خطأ في تشغيل الماسح / Scanner error:', err);
                this.showNotification('خطأ في تشغيل الماسح الضوئي / Scanner initialization error', 'danger');
                return;
            }
            
            console.log("تم تشغيل الماسح الضوئي / Scanner initialized");
            Quagga.start();
            this.isScanning = true;
        });

        Quagga.onDetected((data) => {
            const barcode = data.codeResult.code;
            console.log('تم مسح الرمز الشريطي / Barcode detected:', barcode);
            
            document.getElementById('barcodeInput').value = barcode;
            this.stopScanner();
            this.searchDevice();
            
            // تأثير صوتي (اختياري)
            // Sound effect (optional)
            this.playBeep();
        });
    }

    // إيقاف مسح الرمز الشريطي
    // Stop barcode scanner
    stopScanner() {
        if (this.isScanning) {
            Quagga.stop();
            this.isScanning = false;
        }
        document.getElementById('scannerContainer').style.display = 'none';
    }

    // تشغيل صوت التنبيه
    // Play beep sound
    playBeep() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    // البحث عن المنتج
    // Search for product
    async searchDevice() {
        const barcode = document.getElementById('barcodeInput').value.trim();
        
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
                this.currentDevice = data.device;
                this.displayDeviceInfo();
                this.showOperationForm();
                this.showNotification('تم العثور على المنتج / Product found', 'success');
            } else {
                this.hideDeviceInfo();
                this.hideOperationForm();
                this.showNotification(data.message || 'المنتج غير موجود / Product not found', 'warning');
            }
        } catch (error) {
            console.error('خطأ في البحث عن المنتج / Product search error:', error);
            this.showNotification('خطأ في البحث / Search error', 'danger');
        }
    }

    // عرض معلومات المنتج
    // Display product information
    displayDeviceInfo() {
        if (!this.currentDevice) return;

        document.getElementById('deviceName').textContent = this.currentDevice.device_name;
        document.getElementById('deviceType').textContent = this.currentDevice.device_type;
        document.getElementById('deviceBrand').textContent = this.currentDevice.brand || '-';
        document.getElementById('deviceQuantity').textContent = this.currentDevice.calculated_quantity || this.currentDevice.current_quantity;

        document.getElementById('deviceInfo').classList.remove('hidden');
        document.getElementById('deviceInfo').classList.add('fade-in');
    }

    // إخفاء معلومات المنتج
    // Hide product information
    hideDeviceInfo() {
        document.getElementById('deviceInfo').classList.add('hidden');
    }

    // عرض نموذج العملية
    // Show operation form
    showOperationForm() {
        document.getElementById('operationForm').classList.remove('hidden');
        document.getElementById('operationForm').classList.add('fade-in');
    }

    // إخفاء نموذج العملية
    // Hide operation form
    hideOperationForm() {
        document.getElementById('operationForm').classList.add('hidden');
    }

    // التحقق من صحة الكمية
    // Validate quantity
    validateQuantity() {
        const operationType = document.getElementById('operationType').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        const availableQuantity = this.currentDevice ? 
            (this.currentDevice.calculated_quantity || this.currentDevice.current_quantity) : 0;

        if (operationType === 'remove' && quantity > availableQuantity) {
            this.showNotification(
                `الكمية المتاحة: ${availableQuantity} / Available quantity: ${availableQuantity}`, 
                'warning'
            );
            document.getElementById('quantity').value = availableQuantity;
        }
    }

    // إرسال العملية
    // Submit operation
    async submitOperation() {
        if (!this.currentDevice) {
            this.showNotification('يرجى البحث عن منتج أولاً / Please search for a product first', 'warning');
            return;
        }

        const operationType = document.getElementById('operationType').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        const reason = document.getElementById('reason').value;
        const notes = document.getElementById('notes').value;
        const location = document.getElementById('location').value;

        if (!operationType) {
            this.showNotification('يرجى اختيار نوع العملية / Please select operation type', 'warning');
            return;
        }

        if (!quantity || quantity <= 0) {
            this.showNotification('يرجى إدخال كمية صحيحة / Please enter valid quantity', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showNotification('يرجى تسجيل الدخول / Please login', 'warning');
                return;
            }

            const response = await this.fetchWithRetry('/api/inventory/operation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    device_id: this.currentDevice.id,
                    operation_type: operationType,
                    quantity: quantity,
                    reason: reason || null,
                    notes: notes || null,
                    location: location || null
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification(data.message || 'تم إرسال العملية بنجاح / Operation submitted successfully', 'success');
                this.resetForm();
                setTimeout(() => {
                    this.loadRecentOperations();
                }, 300);
            } else {
                this.showNotification(data.message || data.error || 'خطأ في إرسال العملية / Operation submission error', 'danger');
            }
        } catch (error) {
            console.error('خطأ في إرسال العملية / Operation submission error:', error);
            const errorMessage = error.message || 'خطأ في الاتصال / Connection error';
            this.showNotification(errorMessage, 'danger');
        }
    }

    // إعادة تعيين النموذج
    // Reset form
    resetForm() {
        document.getElementById('barcodeInput').value = '';
        document.getElementById('inventoryForm').reset();
        this.currentDevice = null;
        this.hideDeviceInfo();
        this.hideOperationForm();
    }

    // تحميل العمليات الأخيرة
    // Load recent operations
    async loadRecentOperations() {
        if (!this.currentUser) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/inventory/operations?limit=5', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.displayRecentOperations(data.operations);
            }
        } catch (error) {
            console.error('خطأ في تحميل العمليات / Error loading operations:', error);
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

        container.innerHTML = operations.map(operation => {
            const operationClass = operation.operation_type === 'add' ? 'operation-add' : 'operation-remove';
            const operationIcon = operation.operation_type === 'add' ? 'fa-plus' : 'fa-minus';
            const operationText = operation.operation_type === 'add' ? 'إضافة' : 'سحب';
            const statusClass = `status-${operation.status}`;
            const statusText = this.getStatusText(operation.status);
            
            const date = new Date(operation.operation_date).toLocaleDateString('ar-SA');
            const time = new Date(operation.operation_date).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="operation-card ${operationClass}">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">
                                <i class="fas ${operationIcon} me-2"></i>
                                ${operation.device_name}
                            </h6>
                            <small class="text-muted">${operation.barcode}</small>
                        </div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">
                            ${operationText} ${operation.quantity}
                        </small>
                        <small class="text-muted">
                            ${date} ${time}
                        </small>
                    </div>
                </div>
            `;
        }).join('');
    }

    // الحصول على نص الحالة
    // Get status text
    getStatusText(status) {
        const statusMap = {
            'pending': 'في الانتظار / Pending',
            'approved': 'موافق عليها / Approved',
            'rejected': 'مرفوضة / Rejected'
        };
        return statusMap[status] || status;
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
        const appSection = document.getElementById('appSection');
        
        if (loginSection) {
            loginSection.classList.remove('hidden');
            loginSection.style.display = 'block';
        }
        
        if (appSection) {
            appSection.classList.add('hidden');
            appSection.style.display = 'none';
        }
    }

    // عرض قسم التطبيق
    // Show app section
    showAppSection() {
        const loginSection = document.getElementById('loginSection');
        const appSection = document.getElementById('appSection');
        
        if (loginSection) {
            loginSection.classList.add('hidden');
            loginSection.style.display = 'none';
        }
        
        if (appSection) {
            appSection.classList.remove('hidden');
            appSection.style.display = 'block';
        }
    }

    // تحديث معلومات المستخدم
    // Update user information
    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('userName').textContent = this.currentUser.full_name;
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
        document.getElementById('showAddDeviceForm').style.display = 'none';
        document.getElementById('addDeviceForm').style.display = 'none';
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
                document.getElementById('showAddDeviceForm').style.display = 'none';
            } else {
                document.getElementById('manualStockDeviceInfo').style.display = 'none';
                if (this.currentUser && this.currentUser.role === 'admin') {
                    document.getElementById('showAddDeviceForm').style.display = 'block';
                    document.getElementById('addDeviceForm').style.display = 'block';
                } else {
                    document.getElementById('showAddDeviceForm').style.display = 'block';
                    document.getElementById('showAddDeviceForm').innerHTML = `
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>المنتج غير موجود / Product not found</strong><br>
                        <small>يرجى الاتصال بالمدير لإضافة المنتج / Please contact admin to add the product</small>
                    `;
                }
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
        document.getElementById('addDeviceForm').style.display = 'none';
        document.getElementById('showAddDeviceForm').style.display = 'none';
        
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
        let deviceId = document.getElementById('manualStockDeviceId').value;
        let barcode = document.getElementById('manualStockBarcode').value.trim();
        const quantity = parseInt(document.getElementById('manualStockQuantity').value);
        const reason = document.getElementById('manualStockReason').value;
        const notes = document.getElementById('manualStockNotes').value;
        const location = document.getElementById('manualStockLocation').value;

        if (!deviceId && !barcode && document.getElementById('addDeviceForm').style.display !== 'none') {
            const newDeviceName = document.getElementById('newDeviceName').value.trim();
            const newDeviceType = document.getElementById('newDeviceType').value.trim();
            
            if (!newDeviceName || !newDeviceType) {
                this.showNotification('يرجى إدخال اسم المنتج ونوعه / Please enter product name and type', 'warning');
                return;
            }

            if (!barcode) {
                barcode = `AUTO-${Date.now()}`;
            }

            try {
                const token = localStorage.getItem('token');
                const deviceResponse = await fetch('/api/devices', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        barcode: barcode,
                        device_name: newDeviceName,
                        device_type: newDeviceType,
                        brand: document.getElementById('newDeviceBrand').value.trim() || null,
                        model: document.getElementById('newDeviceModel').value.trim() || null,
                        location: document.getElementById('newDeviceLocation').value.trim() || location || null,
                        current_quantity: 0,
                        minimum_quantity: 1
                    })
                });

                const deviceData = await deviceResponse.json();
                
                if (deviceResponse.ok) {
                    deviceId = deviceData.device_id;
                    document.getElementById('manualStockDeviceId').value = deviceId;
                    this.showNotification('تم إضافة المنتج بنجاح / Product added successfully', 'success');
                } else {
                    if (deviceResponse.status === 403) {
                        this.showNotification('لا يمكن إضافة منتجات جديدة - يرجى الاتصال بالمدير / Cannot add products - Please contact admin', 'warning');
                    } else {
                        this.showNotification(deviceData.message || 'خطأ في إضافة المنتج / Error adding product', 'danger');
                    }
                    return;
                }
            } catch (error) {
                console.error('خطأ في إضافة المنتج / Error adding product:', error);
                this.showNotification('خطأ في إضافة المنتج / Error adding product', 'danger');
                return;
            }
        }

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
                    this.loadRecentOperations();
                }, 500);
            } else {
                const errorMsg = operationType === 'remove' ? 
                    data.message || data.error || 'خطأ في سحب المخزون / Error removing stock' : 
                    data.message || data.error || 'خطأ في إضافة المخزون / Error adding stock';
                this.showNotification(errorMsg, 'danger');
            }
        } catch (error) {
            console.error(`خطأ في ${operationType === 'remove' ? 'سحب' : 'إضافة'} المخزون / Error ${operationType === 'remove' ? 'removing' : 'adding'} stock:`, error);
            
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
}

// تشغيل التطبيق
// Initialize app
const app = new EmployeeApp();

// إضافة الوظائف العامة
// Add global functions
window.startScanner = () => app.startScanner();
window.stopScanner = () => app.stopScanner();
window.searchDevice = () => app.searchDevice();
window.logout = () => app.logout();
window.changePassword = () => app.changePassword();
window.showManualStockModal = (type) => app.showManualStockModal(type);
window.searchDeviceForManualStock = () => app.searchDeviceForManualStock();
window.submitManualStock = () => app.submitManualStock();

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