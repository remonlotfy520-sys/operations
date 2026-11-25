# برنامج إدارة العمليات

## التجربة بدون Firebase
افتح البرنامج كما هو (بعد رفعه على GitHub Pages). هيشتغل في **وضع التجربة** والبيانات بتتحفظ على نفس الجهاز بس.
الدخول: `admin` / `admin123`

## التشغيل الحقيقي (Firebase) — مرة واحدة
1. ادخل https://console.firebase.google.com واعمل **مشروع جديد** (مثلًا `operations-szah`). الخطة المجانية Spark تكفي.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** → اختر Production mode وأقرب منطقة (مثلًا `europe-west`).
4. في Firestore افتح تبويب **Rules**، امسح اللي موجود، والصق محتوى ملف `firestore.rules` كله، ثم **Publish**.

5. **Project settings (الترس) → Your apps → أيقونة الويب `</>`** → سجّل التطبيق → انسخ قيم `firebaseConfig`.
6. افتح `js/config.js` والصق القيم مكان الخانات الفاضية (apiKey, authDomain, projectId, …).
7. **Authentication → Settings → Authorized domains → Add domain** وأضف دومين GitHub Pages (مثلًا `username.github.io`).
8. ارفع الملفات على GitHub Pages وافتح الرابط.
9. أول مرة هتظهر شاشة **"إنشاء حساب الأدمن"** — اعمل حسابك. بعدها الشاشة دي بتختفي نهائيًا.
10. من **الإعدادات** أضف الاستشاريين وأطباء التخدير والشركات وجهات التعاقد، وبعدين المستخدمين.

## الصلاحيات
- **الأدمن**: كل حاجة (تعديل، حذف، إعدادات، مستخدمين).
- **المستخدم**: يضيف عمليات فقط. لكل مستخدم: يرى كل السجلات أو سجلاته هو بس / الإحصائيات / التصدير.
- منع التعديل والمسح مطبّق في قواعد Firebase نفسها، مش في الشاشة بس.
- لو مستخدم نسي كلمة المرور: أوقف حسابه واعمله اسم مستخدم جديد.

## الملفات
- `index.html`, `css/style.css`, `js/app.js` — الواجهة
- `js/logic.js` — التحقق والإحصائيات والاقتراحات (عليها اختبارات: `node --test tests/`)
- `js/data-firebase.js` / `js/data-local.js` — حفظ البيانات (Firebase / وضع التجربة)
- `js/config.js` — إعدادات Firebase
- `firestore.rules` — قواعد الأمان
