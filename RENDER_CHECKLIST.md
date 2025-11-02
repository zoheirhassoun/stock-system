# ✅ قائمة التحقق قبل النشر على Render / Render Deployment Checklist

## 📋 قبل النشر / Before Deployment

### 1. متغيرات البيئة (Environment Variables)
تأكد من إضافة هذه المتغيرات في Render Dashboard:

```
✅ NODE_ENV = production
✅ PORT = 10000
✅ JWT_SECRET = <مفتاح عشوائي قوي> (مثل: openssl rand -base64 32)
✅ ALLOWED_ORIGINS = https://your-app-name.onrender.com
```

⚠️ **مهم:** بعد النشر، استبدل `your-app-name` بالاسم الفعلي للتطبيق!

### 2. قاعدة البيانات / Database
- ✅ SQLite سيعمل تلقائياً (لا يحتاج إعداد إضافي)
- 💡 للإنتاج الكبير: أضف PostgreSQL من Render

### 3. ملفات الإعداد / Configuration Files
- ✅ `render.yaml` موجود ومعد
- ✅ `package.json` يحتوي على scripts صحيحة
- ✅ `.gitignore` يتجاهل الملفات الحساسة

---

## 🚀 خطوات النشر على Render / Render Deployment Steps

### الخطوة 1: إعداد GitHub
```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### الخطوة 2: إنشاء حساب Render
1. اذهب إلى [render.com](https://render.com)
2. سجل بحساب GitHub
3. امنح Render صلاحية الوصول للمستودع

### الخطوة 3: إنشاء Web Service
1. انقر "New" → "Web Service"
2. اختر المستودع الخاص بك
3. Render سيكتشف `render.yaml` تلقائياً

### الخطوة 4: تحديث Environment Variables
في Render Dashboard → Environment:
```
NODE_ENV=production
PORT=10000
JWT_SECRET=<أنشئ مفتاح عشوائي قوي>
ALLOWED_ORIGINS=https://your-actual-app-name.onrender.com
```

⚠️ **مهم جداً:** بعد النشر الأول، اذهب إلى Settings → Environment وحدّث `ALLOWED_ORIGINS` بالرابط الفعلي!

### الخطوة 5: النشر
1. Render سيقوم بالبناء تلقائياً
2. انتظر حتى يكتمل Build
3. ✅ التطبيق متاح على: `https://your-app-name.onrender.com`

---

## 🔍 بعد النشر / After Deployment

### اختبار الوظائف:
- ✅ الصفحة الرئيسية: `https://your-app-name.onrender.com`
- ✅ صفحة المدير: `https://your-app-name.onrender.com/admin`
- ✅ صفحة الموظف: `https://your-app-name.onrender.com/employee`
- ✅ تسجيل الدخول
- ✅ إضافة منتج
- ✅ إضافة مستخدم
- ✅ العمليات

### تحديث CORS (إذا لزم):
إذا كان لديك domain مخصص، أضفه في `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-app-name.onrender.com,https://custom-domain.com
```

---

## ⚠️ ملاحظات مهمة / Important Notes

### 1. أول طلب قد يكون بطيئاً:
- Render يعطل التطبيقات المجانية بعد 15 دقيقة من عدم الاستخدام
- أول طلب بعد الإيقاف: 30-60 ثانية
- هذا طبيعي في الخطة المجانية

### 1.1 إعداد Keep-Alive (منع الإيقاف التلقائي):
**لجعل التطبيق يعمل 24/7 بدون إيقاف:**

#### خيار 1: استخدام Uptime Robot (موصى به / Recommended)
1. اذهب إلى [uptimerobot.com](https://uptimerobot.com) وأنشئ حساب مجاني
2. انقر على "Add New Monitor"
3. املأ البيانات:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Inventory System Keep-Alive
   - **URL:** `https://your-app-name.onrender.com/health`
   - **Monitoring Interval:** 5 minutes (أو 5 دقائق)
4. انقر "Create Monitor"
5. ✅ التطبيق سيبقى نشطاً 24/7

#### خيار 2: استخدام cron-job.org
1. اذهب إلى [cron-job.org](https://cron-job.org)
2. سجل دخول وأضف مهمة جديدة
3. املأ:
   - **URL:** `https://your-app-name.onrender.com/health`
   - **Schedule:** Every 5 minutes (كل 5 دقائق)
4. احفظ المهمة

#### خيار 3: خدمات Keep-Alive أخرى:
- **cronitor.io** - مجاني حتى 10 monitors
- **pingdom.com** - خيارات مجانية محدودة
- **StatusCake** - خطة مجانية متاحة

**ملاحظة:** استخدم endpoint `/health` المخصص لهذا الغرض بدلاً من الصفحة الرئيسية لتقليل الحمل.

**Note:** Use the dedicated `/health` endpoint instead of homepage to reduce load.

### 2. قاعدة البيانات:
- ⚠️ **مهم جداً:** SQLite على Render Free Tier - البيانات ستُفقد عند كل إعادة تشغيل!
- ⚠️ **Critical:** SQLite on Render Free Tier - data will be lost on every restart!
- ملفات SQLite تُحفظ في filesystem ephemeral (مؤقت)
- SQLite files are stored in ephemeral filesystem
- **الحل:** استخدم PostgreSQL (مجاني في Render) للإنتاج
- **Solution:** Use PostgreSQL (free on Render) for production

### 3. النسخ الاحتياطي:
- قم بتنزيل قاعدة البيانات دورياً
- أو استخدم PostgreSQL مع نسخ احتياطي تلقائي

### 4. التحديثات:
- أي push إلى GitHub = إعادة نشر تلقائية
- Render سيقوم ببناء ونشر التحديثات تلقائياً

---

## 🎯 روابط مهمة / Important Links

- **Render Dashboard:** https://dashboard.render.com
- **Documentation:** https://render.com/docs
- **Support:** https://render.com/help

---

## ✅ الحالة الحالية / Current Status

- ✅ الكود جاهز للنشر
- ✅ لا يوجد hardcoded URLs
- ✅ جميع API calls تستخدم relative paths
- ✅ إعدادات Render موجودة في `render.yaml`
- ✅ Environment variables محددة بشكل صحيح

**أنت جاهز للنشر! / You're ready to deploy!** 🚀

---

**تم التطوير بواسطة / Developed by: زهير حسون (Zoheir Hassoun)**

