# INDEX Study Assistant — GitHub Actions

## الهدف
GitHub Actions يبني لك برنامج Windows (`.exe`) تلقائياً.

## أسهل طريقة للرفع
استخدم GitHub Desktop لرفع هذا المجلد كاملًا. مهم جداً أن يبقى المسار:
`.github/workflows/windows-build.yml`

## بدون GitHub Desktop
يمكنك رفع ملفات المشروع من موقع GitHub، ثم إنشاء الملف:
`.github/workflows/windows-build.yml`
ولصق محتواه من المجلد `.github/workflows`.

## تشغيل البناء
بعد رفع المشروع:
1. افتح تبويب **Actions**.
2. اختر **Build Windows EXE**.
3. اضغط **Run workflow**.
4. بعد النجاح، افتح عملية البناء ثم **Artifacts** وحمّل `INDEX-Study-Assistant-Windows`.

## إصدار Release
أنشئ Tag يبدأ بـ `v` مثل `v1.0.1`. سيتم بناء الـ EXE وإرفاقه تلقائياً بالـ GitHub Release.
