# دليل النشر على السحابة / Cloud Deployment Guide

## 🌐 خيارات النشر / Deployment Options

### 1. Render (موصى به / Recommended)
**المميزات:**
- ✅ مجاني للبدء / Free tier available
- ✅ سهل الإعداد / Easy setup
- ✅ دعم قاعدة بيانات PostgreSQL / PostgreSQL database support
- ✅ Deploy من GitHub مباشرة / Direct GitHub deployment

#### خطوات النشر على Render:
1. أنشئ حساب على [Render.com](https://render.com)
2. انقر على "New" ثم "Web Service"
3. اربط مستودع GitHub الخاص بك
4. املأ الإعدادات:
   - **Name**: inventory-system
   - **Environment**: Node
   - **Build Command**: `npm install && npm run setup-db`
   - **Start Command**: `npm start`
5. أضف متغيرات البيئة (Environment Variables):
   ```
   NODE_ENV=production
   PORT=10000
   JWT_SECRET=<generate-random-secret>
   ALLOWED_ORIGINS=https://your-app-name.onrender.com
   ```
6. انقر على "Create Web Service"

#### إضافة قاعدة بيانات PostgreSQL على Render:
1. انقر على "New" ثم "PostgreSQL"
2. اختر الخطة المناسبة
3. انسخ connection string
4. أضف متغير البيئة:
   ```
   DATABASE_URL=<postgres-connection-string>
   ```

---

### 2. Railway (خيار ممتاز / Excellent Option)
**المميزات:**
- ✅ مجاني للبدء / Free tier available
- ✅ سهل جداً / Very easy
- ✅ دعم قاعدة بيانات مدمج / Built-in database support

#### خطوات النشر على Railway:
1. أنشئ حساب على [Railway.app](https://railway.app)
2. انقر على "New Project"
3. اختر "Deploy from GitHub repo"
4. حدد المستودع الخاص بك
5. Railway سيكتشف الإعدادات تلقائياً من `railway.json`
6. أضف متغيرات البيئة في قسم "Variables"

#### إضافة قاعدة بيانات على Railway:
1. في المشروع، انقر على "New" ثم "Database"
2. اختر "PostgreSQL"
3. Railway سيقوم بإضافة `DATABASE_URL` تلقائياً

---

### 3. Heroku (خيار مدفوع / Paid Option)
**المميزات:**
- ✅ موثوق وثابت / Reliable and stable
- ✅ دعم ممتاز / Excellent support
- ⚠️ لا يوجد خطة مجانية حالياً / No free tier currently

#### خطوات النشر على Heroku:
1. أنشئ حساب على [Heroku.com](https://www.heroku.com)
2. ثبت Heroku CLI
3. قم بتسجيل الدخول:
   ```bash
   heroku login
   ```
4. أنشئ تطبيق:
   ```bash
   heroku create your-app-name
   ```
5. أضف متغيرات البيئة:
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set JWT_SECRET=<your-secret>
   ```
6. انشر:
   ```bash
   git push heroku main
   ```

---

## 📦 تحضير المشروع للنشر / Preparing Project for Deployment

### 1. تحديث متغيرات البيئة:
انسخ `.env.example` إلى `.env` واملأ القيم:
```bash
cp .env.example .env
```

### 2. تحديث JWT_SECRET:
أنشئ مفتاح عشوائي قوي:
```bash
# في Linux/Mac:
openssl rand -base64 32

# أو استخدم أي مولد مفتاح عشوائي
```

### 3. تحديث CORS في server.js:
افتح `server.js` وحدّث `ALLOWED_ORIGINS`:
```javascript
origin: process.env.ALLOWED_ORIGINS?.split(',') || 
    ['http://localhost:3000']
```

### 4. اختبار محلي:
```bash
npm install
npm run setup-db
npm start
```

---

## 🔄 الانتقال من SQLite إلى PostgreSQL (اختياري) / Migration to PostgreSQL (Optional)

للإنتاج، يُنصح باستخدام PostgreSQL بدلاً من SQLite.

### خطوات الانتقال:

1. **تثبيت pg:**
   ```bash
   npm install pg
   ```

2. **إنشاء ملف database/config.js:**
   ```javascript
   const { Pool } = require('pg');
   
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
   });
   
   module.exports = pool;
   ```

3. **تحديث queries للعمل مع PostgreSQL** (SQLite و PostgreSQL متوافقان إلى حد كبير)

---

## 🚀 نصائح للنشر / Deployment Tips

1. **استخدم Git:**
   - تأكد من رفع الكود إلى GitHub/GitLab
   - لا ترفع ملف `.env` (موجود في `.gitignore`)

2. **متغيرات البيئة:**
   - لا تضع معلومات حساسة في الكود
   - استخدم متغيرات البيئة دائماً

3. **قاعدة البيانات:**
   - في الإنتاج، استخدم قاعدة بيانات منفصلة
   - قم بعمل نسخ احتياطي دوري

4. **الأمان:**
   - استخدم HTTPS دائماً
   - قم بتحديث JWT_SECRET بشكل دوري
   - فعّل rate limiting في الإنتاج

5. **المتابعة:**
   - راقب السجلات (Logs) بشكل دوري
   - ضع إشعارات للأخطاء

---

## 📞 الدعم / Support

في حالة وجود مشاكل في النشر، راجع:
- سجلات النشر (Build Logs)
- سجلات التطبيق (Application Logs)
- وثائق المنصة المستخدمة

---

**تم التطوير بواسطة / Developed by: زهير حسون (Zoheir Hassoun)**

