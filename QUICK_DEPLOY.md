# 🚀 دليل النشر السريع / Quick Deployment Guide

## 🎯 النشر على Render (الأسهل - موصى به) / Render Deployment (Easiest - Recommended)

### خطوات سريعة / Quick Steps:

1. **أنشئ حساب على Render:**
   - اذهب إلى [render.com](https://render.com)
   - سجل بحساب GitHub

2. **أنشئ Web Service:**
   - انقر على "New" → "Web Service"
   - اربط مستودع GitHub الخاص بك
   - اختر الفرع (Branch): `main` أو `master`

3. **املأ الإعدادات:**
   ```
   Name: inventory-system
   Environment: Node
   Build Command: npm install && npm run setup-db
   Start Command: npm start
   ```

4. **Render سيكتشف الإعدادات من `render.yaml` تلقائياً!**
   - ✅ Build Command: `npm install && npm run setup-db`
   - ✅ Start Command: `npm start`
   - ✅ Environment Variables سيتم إضافتها تلقائياً

5. **أضف Environment Variables المطلوبة:**
   في Render Dashboard → Environment → Add Environment Variable:
   ```
   NODE_ENV = production
   PORT = 10000
   JWT_SECRET = (أنشئ مفتاح عشوائي قوي - مثل: openssl rand -base64 32)
   ALLOWED_ORIGINS = https://your-app-name.onrender.com
   ```
   
   ⚠️ **مهم:** بعد النشر الأول، حدّث `ALLOWED_ORIGINS` بالرابط الفعلي للتطبيق!

6. **انقر على "Create Web Service"**
   - انتظر حتى يكتمل البناء (Build)
   - سيتم نشر التطبيق تلقائياً

✅ **انتهى! التطبيق متاح على:** `https://your-app-name.onrender.com`

📋 **للمزيد من التفاصيل، راجع [RENDER_CHECKLIST.md](RENDER_CHECKLIST.md)**

---

## 🔧 إعدادات مهمة / Important Settings

### 1. تحديث CORS بعد النشر:
افتح `server.js` وتأكد من أن `ALLOWED_ORIGINS` يحتوي على رابط Render الخاص بك:
```javascript
ALLOWED_ORIGINS=https://your-app-name.onrender.com
```

### 2. إنشاء JWT_SECRET:
استخدم أي من الطرق التالية:
```bash
# Linux/Mac:
openssl rand -base64 32

# أو استخدم أي مولد عشوائي على الإنترنت
```

### 3. قاعدة البيانات:
- SQLite سيعمل على Render في البداية
- للإنتاج، يُنصح بإضافة PostgreSQL (إضافة مجانية في Render)

---

## 🎨 بعد النشر / After Deployment

### اختبار التطبيق:
1. افتح: `https://your-app-name.onrender.com`
2. جرب تسجيل الدخول بحساب المدير الافتراضي
3. اختبر الوظائف الأساسية

### الوصول من الهاتف:
- التطبيق يعمل على الهاتف أيضاً
- افتح الرابط في متصفح الهاتف

---

## ⚠️ ملاحظات مهمة / Important Notes

1. **أول تشغيل قد يكون بطيئاً:**
   - Render يعطل التطبيقات المجانية بعد 15 دقيقة من عدم الاستخدام
   - أول طلب بعد الإيقاف قد يستغرق 30-60 ثانية

2. **إعداد Keep-Alive (منع الإيقاف):**
   - **استخدم Uptime Robot:** [uptimerobot.com](https://uptimerobot.com)
   - **URL للفحص:** `https://your-app-name.onrender.com/health`
   - **الفترة:** كل 5 دقائق
   - 📋 راجع [RENDER_CHECKLIST.md](RENDER_CHECKLIST.md) للتفاصيل الكاملة

3. **قاعدة البيانات:**
   - SQLite يعمل، لكن للعملاء الكبار، استخدم PostgreSQL
   - Render يقدم PostgreSQL مجاني

4. **النسخ الاحتياطي:**
   - قم بعمل نسخ احتياطي دوري للبيانات
   - استخدم `DATABASE_URL` من Render للاتصال

---

## 📱 الوصول للعملاء / Customer Access

بعد النشر، يمكن للعملاء الوصول من خلال:
- **الرابط:** `https://your-app-name.onrender.com`
- **للإدارة:** `https://your-app-name.onrender.com/admin`
- **للموظفين:** `https://your-app-name.onrender.com/employee`

---

**تم التطوير بواسطة / Developed by: زهير حسون (Zoheir Hassoun)**

