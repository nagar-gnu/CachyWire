#!/bin/bash
echo "========================================================="
echo "🔍 CACHYWIRE CODE AUDIT REPORT (Senior Review)"
echo "📅 Date: $(date)"
echo "========================================================="
echo ""

# 1. فحص الـ Rust Backend (إصلاحات الأمان)
echo "1️⃣ CHECKING RUST BACKEND (src-rust-backend/main.rs)"
if grep -q "Access-Control-Allow-Origin" src-rust-backend/main.rs; then
    echo "   ❌ [FAIL] ثغرة CORS لا تزال موجودة! لم يتم حذف الهيدرز."
else
    echo "   ✅ [PASS] تم إزالة هيدرز CORS بنجاح."
fi

if grep -q "write_atomic" src-rust-backend/main.rs; then
    echo "   ✅ [PASS] دالة الكتابة الآمنة (Atomic Write) موجودة."
else
    echo "   ❌ [FAIL] دالة الكتابة الآمنة (Atomic Write) مفقودة."
fi

if grep -q "content_length.min(64" src-rust-backend/main.rs; then
    echo "   ✅ [PASS] تم وضع حد أقصى لحجم الطلبات (64MB) لمنع الـ DoS."
else
    echo "   ❌ [FAIL] لم يتم وضع حد أقصى لحجم الطلبات."
fi

echo ""
# 2. فحص واجهة المستخدم (إصلاحات XSS)
echo "2️⃣ CHECKING FRONTEND SECURITY (XSS Prevention)"
if [ -f "src/utils/escape.js" ]; then
    echo "   ✅ [PASS] ملف escape.js موجود."
    if grep -q "import { esc }" src/presentation/traffic-monitor.js; then
        echo "   ✅ [PASS] تم استيراد دالة esc في traffic-monitor.js"
    else
        echo "   ❌ [FAIL] لم يتم استيراد دالة esc في traffic-monitor.js"
    fi
    if grep -q "import { esc }" src/presentation/alerts-timeline.js; then
        echo "   ✅ [PASS] تم استيراد دالة esc في alerts-timeline.js"
    else
        echo "   ❌ [FAIL] لم يتم استيراد دالة esc في alerts-timeline.js"
    fi
else
    echo "   ❌ [FAIL] ملف src/utils/escape.js مفقود تماماً!"
fi

echo ""
# 3. فحص سكريبت التشغيل (الأمان والصلاحيات)
echo "3️⃣ CHECKING RUN SCRIPT (run-cachywire.sh)"
if grep -q "XDG_RUNTIME_DIR" run-cachywire.sh; then
    echo "   ✅ [PASS] يتم استخدام مجلد آمن (XDG_RUNTIME_DIR) بدلاً من /tmp."
else
    echo "   ❌ [FAIL] لا يزال يستخدم مجلد /tmp غير الآمن."
fi

if grep -q "stop_by_pidfile" run-cachywire.sh; then
    echo "   ✅ [PASS] يتم إيقاف العمليات بأمان عبر PID Files (بدون pkill العشوائي)."
else
    echo "   ❌ [FAIL] لا يزال يستخدم pkill -f العشوائي والخطير."
fi

echo ""
# 4. فحص حالة البناء (Build Status)
echo "4️⃣ CHECKING BUILD STATUS"
if [ -f "cachywire-daemon" ]; then
    echo "   ℹ️  [INFO] ملف cachywire-daemon موجود."
    if [ "src-rust-backend/main.rs" -nt "cachywire-daemon" ]; then
        echo "   ⚠️  [WARN] ملف main.rs أحدث من الملف التنفيذي. يجب إعادة البناء (Compile)!"
    else
        echo "   ✅ [PASS] الملف التنفيذي محدث ومطابق للكود."
    fi
else
    echo "   ❌ [FAIL] ملف cachywire-daemon غير موجود. لم يتم بناء المشروع بعد."
fi

echo ""
echo "========================================================="
echo "🏁 END OF AUDIT REPORT"
echo "========================================================="
