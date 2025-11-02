# نظام إدارة المخزون المحمول
# Mobile Inventory System

## نظرة عامة / Overview

نظام إدارة المخزون المحمول هو تطبيق ويب شامل يتيح للموظفين مسح الرموز الشريطية وتسجيل العمليات مباشرة في النظام، مع لوحة تحكم للمدير لمتابعة جميع العمليات.

A comprehensive mobile inventory management system that allows employees to scan barcodes and record operations directly in the system, with an admin panel to track all processes.

## المميزات / Features

### للموظفين / For Employees
- ✅ مسح الرموز الشريطية / Barcode Scanning
- ✅ تسجيل إضافة/سحب الأجهزة / Record Add/Remove Devices
- ✅ تسجيل اسم الموظف وتفاصيل الجهاز / Record Employee Name & Device Details
- ✅ تسجيل التاريخ والوقت تلقائياً / Automatic Date & Time Recording
- ✅ واجهة باللغة العربية / Arabic Interface

### للمدير / For Admin
- ✅ لوحة تحكم شاملة / Comprehensive Dashboard
- ✅ متابعة عمليات الموظفين / Track Employee Operations
- ✅ تقارير المخزون / Inventory Reports
- ✅ إدارة الموظفين / Employee Management
- ✅ تتبع حالة المخزون / Inventory Status Tracking

## التقنيات المستخدمة / Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js with Express
- **Database**: SQLite (للتطوير) / SQLite (for development)
- **Barcode Scanning**: QuaggaJS Library
- **UI Framework**: Bootstrap 5 with RTL support
- **Authentication**: JWT Tokens

## هيكل المشروع / Project Structure

```
inventory-system/
├── frontend/
│   ├── employee/          # واجهة الموظفين / Employee Interface
│   ├── admin/            # لوحة تحكم المدير / Admin Panel
│   ├── assets/           # الملفات الثابتة / Static Assets
│   └── shared/           # المكونات المشتركة / Shared Components
├── backend/
│   ├── routes/           # مسارات API / API Routes
│   ├── models/           # نماذج البيانات / Data Models
│   ├── middleware/       # الوسطاء / Middleware
│   └── utils/            # الأدوات المساعدة / Utilities
├── database/
│   └── schema.sql        # هيكل قاعدة البيانات / Database Schema
└── docs/                 # الوثائق / Documentation
```

## التثبيت والتشغيل / Installation & Setup

### التطوير المحلي / Local Development

1. استنساخ المشروع / Clone the project
2. تثبيت التبعيات / Install dependencies: `npm install`
3. إعداد قاعدة البيانات / Setup database: `npm run setup-db`
4. تشغيل الخادم / Start server: `npm start`
5. فتح المتصفح على / Open browser at: `http://localhost:3000`

### النشر على السحابة / Cloud Deployment

للنشر السريع على السحابة، راجع:
- **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** - دليل النشر السريع على Render
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - دليل شامل للنشر على منصات مختلفة

**منصات موصى بها:**
- **Render** - مجاني وسهل (موصى به) / Free & Easy (Recommended)
- **Railway** - مجاني وسريع / Free & Fast
- **Heroku** - موثوق / Reliable

## الاستخدام / Usage

### للموظفين / For Employees
1. تسجيل الدخول بالبيانات المخصصة / Login with assigned credentials
2. اختيار نوع العملية (إضافة/سحب) / Select operation type (Add/Remove)
3. مسح الرمز الشريطي للجهاز / Scan device barcode
4. تأكيد العملية / Confirm operation

### للمدير / For Admin
1. تسجيل الدخول بحساب المدير / Login with admin account
2. عرض لوحة التحكم / View dashboard
3. متابعة العمليات والتقارير / Monitor operations and reports
4. إدارة الموظفين والمخزون / Manage employees and inventory

## الأمان / Security

- تشفير كلمات المرور / Password encryption
- رموز JWT للمصادقة / JWT tokens for authentication
- تسجيل جميع العمليات / Logging all operations
- التحقق من صحة البيانات / Data validation

## المطور / Developer

**زهير حسون**  
Zoheir Hassoun

## الدعم / Support

للدعم الفني أو الاستفسارات، يرجى التواصل مع المطور.
For technical support or inquiries, please contact the developer.