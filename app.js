 document.addEventListener("DOMContentLoaded", function() {
    
    const loginBtn = document.getElementById("login-btn");
    const forgotLink = document.getElementById("forgot-link");

    // عناصر إدخال أرقام الهواتف
    const studentPhoneInput = document.getElementById("student-phone");
    const parentPhoneInput = document.getElementById("parent-phone");

    // فحص ما إذا كانت أرقام الهاتف محفوظة سابقاً لدى الطالب
    const savedStudentPhone = localStorage.getItem("student_phone");
    const savedParentPhone = localStorage.getItem("parent_phone");
    const isRegistered = savedStudentPhone && savedParentPhone;

    // إذا كان قد سجل أرقامه من قبل، قم بإخفاء خانات الأرقام
    if (isRegistered) {
        // إخفاء الحقول مباشرة
        if (studentPhoneInput) studentPhoneInput.style.display = "none";
        if (parentPhoneInput) parentPhoneInput.style.display = "none";

        // إخفاء الحاويات (Containers) الخاصة بالـ Input إن وجدت مع الـ Label
        const studentPhoneBox = document.getElementById("student-phone-box");
        const parentPhoneBox = document.getElementById("parent-phone-box");
        if (studentPhoneBox) studentPhoneBox.style.display = "none";
        if (parentPhoneBox) parentPhoneBox.style.display = "none";
    }

    // دالة إظهار التحذيرات والرسائل
    function showMessage(text, type) {
        let msgBox = document.getElementById("custom-alert-msg");
        if (!msgBox) return;

        msgBox.innerText = text;
        msgBox.style.display = "block";

        if (type === "error") {
            msgBox.style.backgroundColor = "rgba(255, 0, 0, 0.15)";
            msgBox.style.color = "#ff4d4d";
            msgBox.style.border = "1px solid rgba(255, 0, 0, 0.3)";
        } else if (type === "success") {
            msgBox.style.backgroundColor = "rgba(0, 255, 0, 0.15)";
            msgBox.style.color = "#25d366"; 
            msgBox.style.border = "1px solid rgba(0, 255, 0, 0.3)";
        }
    }

    // عند الضغط على نسيت كود الاختبار
    if (forgotLink) {
        forgotLink.addEventListener("click", function(e) {
            e.preventDefault();
            showMessage("⚠️ نسيت الكود؟ يرجى التواصل مع الدعم الفني للحصول عليه!", "error");

            var info = document.getElementById("support-message");
            if (info) {
                info.style.display = (info.style.display === "block") ? "none" : "block";
            }
        });
    }

    // عند الضغط على زر دخول المنصة
    if (loginBtn) {
        loginBtn.addEventListener("click", function() {
            
            const studentNameInput = document.getElementById("login-name");
            const examCodeInput = document.getElementById("login-pass");

            const studentName = studentNameInput ? studentNameInput.value.trim() : "";
            const examCode = examCodeInput ? examCodeInput.value.trim() : "";

            let studentPhone = "";
            let parentPhone = "";

            // 1. التحقق من اسم الطالب
            if (studentName === "") {
                showMessage("⚠️ يرجى كتابة اسمك الرباعي أولاً!", "error");
                return;
            }

            // 2. التحقق من أرقام الهواتف (سواء جلبها من الـ Storage أو قراءتها من المدخلات)
            if (isRegistered) {
                studentPhone = savedStudentPhone;
                parentPhone = savedParentPhone;
            } else {
                studentPhone = studentPhoneInput ? studentPhoneInput.value.trim() : "";
                parentPhone = parentPhoneInput ? parentPhoneInput.value.trim() : "";

                if (studentPhone === "" || studentPhone.length < 10 || isNaN(studentPhone)) {
                    showMessage("⚠️ يرجى إدخال رقم هاتف الطالب بشكل صحيح!", "error");
                    return;
                }

                if (parentPhone === "" || parentPhone.length < 10 || isNaN(parentPhone)) {
                    showMessage("⚠️ يرجى إدخال رقم هاتف ولي الأمر بشكل صحيح!", "error");
                    return;
                }
            }

            // 3. التحقق من كود الاختبار
            if (examCode === "") {
                showMessage("⚠️ يرجى إدخال كود الاختبار!", "error");
                return;
            }

            // قائمة الطلاب المعترف بهم
            const allowedStudents = {
                "محمد علي": { code: "455", subject: "history_geography" },
                "محمود صابر": { code: "788", subject: "history" },
                "مي صلاح": { code: "344", subject: "geography" },
                "محمد صلاح صبري علي": { code: "563218", subject: "history_geography" }
            };

            // التحقق والتسجيل
            if (allowedStudents.hasOwnProperty(studentName) && allowedStudents[studentName].code === examCode) {
                const studentData = allowedStudents[studentName];
                
                // حفظ البيانات في المتصفح لاستخدامها لاحقاً
                localStorage.setItem("student_fullname", studentName);
                localStorage.setItem("student_phone", studentPhone);
                localStorage.setItem("parent_phone", parentPhone);
                localStorage.setItem("allowed_subject_key", studentData.subject);

                showMessage(`مرحباً بك يا ${studentName} ✅\nتم تسجيل دخولك، جاري تحويلك للمنصة...`, "success");

                // إرسال كافة البيانات إلى Formspree
                fetch("https://formspree.io/f/mojodlvd", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "اسم الطالب": studentName,
                        "رقم الطالب": studentPhone,
                        "رقم ولي الأمر": parentPhone,
                        "كود الاختبار": examCode,
                        "وقت الدخول": new Date().toLocaleString("ar-EG")
                    })
                }).finally(() => {
                    setTimeout(function() {
                        window.location.href = "platform.html";
                    }, 1500);
                });

            } else {
                showMessage("❌ الاسم أو كود الاختبار غير صحيح، يرجى التأكد وإعادة المحاولة!", "error");
            }
        });
    }
});