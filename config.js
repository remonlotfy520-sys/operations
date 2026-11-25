// ضع هنا إعدادات مشروع Firebase (من Project settings → Your apps → Web app).
// طالما apiKey فاضي، البرنامج يشتغل في "وضع التجربة" على الجهاز فقط (localStorage).
export const firebaseConfig = {
  apiKey: 'AIzaSyBzAupbo1q25wduK3_7oW80lt_EcjxFJSU',
  authDomain: 'operations-4b35a.firebaseapp.com',
  projectId: 'operations-4b35a',
  storageBucket: 'operations-4b35a.firebasestorage.app',
  messagingSenderId: '170996749916',
  appId: '1:170996749916:web:a9c4b75e8708a2f0737899',
};

// النطاق الوهمي اللي بيتحول له اسم المستخدم كإيميل داخل Firebase
export const USER_EMAIL_DOMAIN = 'opsapp.local';
