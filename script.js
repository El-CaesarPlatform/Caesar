// ==========================================
// 💥 1. إعدادات وتصريح Firebase
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDSaHZfMovOtZVkv5HDtfsy4Kh_ttszSLI",
    authDomain: "el-kaiser-platform.firebaseapp.com",
    projectId: "el-kaiser-platform",
    storageBucket: "el-kaiser-platform.firebasestorage.app",
    messagingSenderId: "639617459641",
    appId: "1:639617459641:web:7804a357079b1b559c4268",
    measurementId: "G-B1E4Y13JBE"
};

// تهيئة Firebase
let db;
if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    } catch (e) {
        console.error("خطأ أثناء تهيئة Firebase:", e);
    }
}

// ==========================================
// ⚙️ 2. المتغيرات العامة ورسائل التنبيه
// ==========================================
const DEFAULT_EXAM_DURATION = 15;
let timerInterval = null;
let currentActiveSubject = "";
let currentActiveType = "exam";
let activeQuestionsList = [];
let currentSubjectVersion = 1;

window.isExamRunning = false;
let dynamicExamsDatabase = {};
const homeworksDatabase = {};

function showCustomToast(message, type = 'error') {
    let toast = document.getElementById('custom-toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'custom-toast-notification';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10001;
            padding: 14px 28px;
            border-radius: 14px;
            font-weight: bold;
            font-size: 0.95rem;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.35);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            backdrop-filter: blur(12px);
            color: #fff;
            min-width: 300px;
            max-width: 90%;
            display: none;
            opacity: 0;
            direction: rtl;
            font-family: inherit;
        `;
        document.body.appendChild(toast);
    }

    if (type === 'success') {
        toast.style.background = 'rgba(39, 174, 96, 0.95)';
        toast.style.border = '1px solid #2ecc71';
        toast.style.color = '#fff';
    } else if (type === 'warning') {
        toast.style.background = 'rgba(243, 156, 18, 0.95)';
        toast.style.border = '1px solid #f1c40f';
        toast.style.color = '#111';
    } else {
        toast.style.background = 'rgba(231, 76, 60, 0.95)';
        toast.style.border = '1px solid #e74c3c';
        toast.style.color = '#fff';
    }

    toast.innerHTML = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.opacity = '1'; }, 10);

    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
    }, 3800);
}

function isExamFinished(subjectKey, type) {
    const dbSource = (type === "exam") ? dynamicExamsDatabase : homeworksDatabase;
    if (!dbSource || !dbSource[subjectKey]) return false;
    const currentVer = dbSource[subjectKey].version.toString().trim();
    const savedVer = localStorage.getItem('finished_' + subjectKey);
    return savedVer && savedVer === currentVer;
}

// ==========================================
// 🔍 دالة فحص استحقاق الطالب للامتحان (مُحدثة مع حماية من الأخطاء)
// ==========================================
function canStudentAccessExam(exam, studentCode, studentStage, studentName, studentPhone) {
    const cleanCode = (studentCode || "").toString().trim().toLowerCase();
    const cleanName = (studentName || "").toString().trim().toLowerCase();
    const cleanPhone = (studentPhone || "").toString().trim().toLowerCase();

    const targetType = exam.targetType || 'all';

    // 1️⃣ إذا كان الامتحان موجه لطالب شخصي محدد (حسب الكود أو الاسم أو الهاتف)
    if (targetType === 'specific' || targetType === 'single') {
        const targetCode = (exam.targetCode || exam.targetStudentCode || (exam.targetStudent && exam.targetStudent.code) || "").toString().trim().toLowerCase();
        const targetName = (exam.targetName || exam.targetStudentName || (exam.targetStudent && exam.targetStudent.name) || "").toString().trim().toLowerCase();
        const targetPhone = (exam.targetPhone || (exam.targetStudent && exam.targetStudent.phone) || "").toString().trim().toLowerCase();

        const isMatch = (cleanCode && targetCode === cleanCode) ||
                        (cleanPhone && targetPhone === cleanPhone) ||
                        (cleanName && targetName === cleanName);
        return isMatch;
    }

    // 2️⃣ إذا كان الامتحان موجه لعدة طلاب محددين القائمة (مع حماية Array.isArray)
    if (targetType === 'multiple' || targetType === 'selected') {
        const rawCodes = Array.isArray(exam.targetCodes) ? exam.targetCodes : (Array.isArray(exam.selectedCodes) ? exam.selectedCodes : []);
        const targetCodes = rawCodes.map(c => (c || "").toString().trim().toLowerCase());

        const rawNames = Array.isArray(exam.targetNames) ? exam.targetNames : (Array.isArray(exam.selectedStudents) ? exam.selectedStudents : []);
        const targetNames = rawNames.map(n => (typeof n === 'object' ? (n.name || n.code || '') : n).toString().trim().toLowerCase());

        const matchCode = cleanCode && targetCodes.includes(cleanCode);
        const matchName = cleanName && targetNames.includes(cleanName);

        return matchCode || matchName;
    }

    // 3️⃣ إذا كان الامتحان عام للجميع أو حسب الصف الدراسي
    if (targetType === 'all' || targetType === 'عام' || !targetType) {
        if (exam.grade && exam.grade !== "عام" && exam.grade !== "الكل" && studentStage && studentStage !== "غير محدد") {
            return exam.grade === studentStage;
        }
        return true;
    }

    return false;
}

// ==========================================
// 🚀 عند تحميل الصفحة والتجهيز (معالجة تغيير التليفون والبيانات الناقصة)
// ==========================================
window.onload = function() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    let studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || localStorage.getItem("code") || "";
    let studentPhone = localStorage.getItem("student_phone") || "";
    let parentPhone = localStorage.getItem("parent_phone") || "";
    let studentStage = localStorage.getItem("student_stage") || "غير محدد";

    // إذا كانت بيانات الطالب ناقصة (مثل الفتح من تليفون جديد بدون دخول سابق)
    if (!studentName || !studentCode || studentStage === "غير محدد") {
        if (!studentName) {
            studentName = prompt("🔑 يرجى إدخال اسمك الثلاثي لدخول المنصة:") || "";
            if (studentName.trim() !== "") {
                studentName = studentName.trim();
                localStorage.setItem("student_fullname", studentName);
            }
        }
        if (!studentCode) {
            studentCode = prompt("🔑 يرجى إدخال كود الطالب الخاص بك:") || "";
            if (studentCode.trim() !== "") {
                studentCode = studentCode.trim();
                localStorage.setItem("student_code", studentCode);
            }
        }

        // إذا ما زالت البيانات ناقصة يتم التحويل لصفحة التسجيل لتفادي التعليق
        if (!studentName || !studentCode) {
            showCustomToast("⚠️ بيانات الدخول غير مكتملة، جاري توجيهك لصفحة التسجيل...", "warning");
            setTimeout(() => { window.location.href = "login.html"; }, 2000);
            return;
        }
    }

    const displayElement = document.getElementById('user-display-name');
    if (displayElement) displayElement.textContent = "أهلاً: " + studentName;

    if (document.getElementById("profile-name")) document.getElementById("profile-name").textContent = studentName;
    if (document.getElementById("profile-stage")) document.getElementById("profile-stage").textContent = studentStage;
    if (document.getElementById("profile-code")) document.getElementById("profile-code").textContent = studentCode || "غير محدد";
    if (document.getElementById("profile-phone")) document.getElementById("profile-phone").textContent = studentPhone || "غير مسجل";
    if (document.getElementById("profile-parent-phone")) document.getElementById("profile-parent-phone").textContent = parentPhone || "غير مسجل";

    const searchInput = document.getElementById("search-student-name");
    if (searchInput) searchInput.value = studentName;

    const searchCodeInput = document.getElementById("search-student-code");
    if (searchCodeInput && studentCode) searchCodeInput.value = studentCode;

    createConfirmSubmitModal();
    setupAntiCheatListeners();
    loadAssignedExam();
    checkAndResumeRunningExam();
};

// 🚨 نافذة تأكيد التسليم المنبثقة
function createConfirmSubmitModal() {
    if (document.getElementById('submit-confirm-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'submit-confirm-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(6px);
        padding: 15px;
        direction: rtl;
        font-family: 'Cairo', sans-serif;
    `;
    modal.innerHTML = `
        <div style="background: #1e1e38; padding: 28px; border-radius: 16px; max-width: 440px; width: 95%; text-align: center; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
            <h3 style="color: #00d2ff; margin-bottom: 15px; font-size: 1.3rem; font-weight:900;">🚨 تأكيد تسليم الامتحان</h3>
            <p id="confirm-modal-text" style="color: #cbd5e1; margin-bottom: 25px; line-height: 1.6; font-size: 1rem;"></p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button onclick="confirmFinalSubmit()" style="flex: 1; padding: 12px; background: #2ecc71; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.95rem;">تأكيد التسليم 🚀</button>
                <button onclick="closeConfirmSubmitModal()" style="flex: 1; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.95rem;">استنى / مراجعة 🔙</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function setupAntiCheatListeners() {
    window.addEventListener('beforeunload', function (e) {
        if (window.isExamRunning) {
            const confirmationMessage = '⚠️ تنبيه: إغلاق الصفحة أو إعادة تحميلها قد يؤدي إلى فقدان إجاباتك ورصد الاختبار!';
            (e || window.event).returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });

    document.addEventListener("visibilitychange", function() {
        if (window.isExamRunning && document.hidden) {
            showCustomToast("⚠️ تنبيه أمني: يرجى عدم الخروج من شاشة الامتحان لضمان عدم الخصم أو الإلغاء!", "warning");
        }
    });
}

// ==========================================
// 📚 جلب وعرض الاختبارات المخصصة للطالب (مع حماية المهلة الزمانية)
// ==========================================
async function loadAssignedExam() {
    const examsGrid = document.getElementById('assigned-exam-grid');
    const studentStage = localStorage.getItem("student_stage") || "";
    const studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "";
    const studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    const studentPhone = localStorage.getItem("student_phone") || "";

    if (!examsGrid) return;

    if (typeof db === 'undefined') {
        examsGrid.innerHTML = "<p style='text-align:center;color:#e74c3c;grid-column:1/-1;'>❌ تعذر الاتصال بقاعدة البيانات. تحقق من الاتصال بالإنترنت.</p>";
        return;
    }

    try {
        const fetchPromise = db.collection("exams").get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
        
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

        if (snapshot.empty) {
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'>📭 لا يوجد امتحان منشور حالياً.</p>";
            return;
        }

        let allExams = [];
        snapshot.forEach(doc => allExams.push({ id: doc.id, ...doc.data() }));

        const accessibleExams = allExams.filter(exam => canStudentAccessExam(exam, studentCode, studentStage, studentName, studentPhone));

        if (accessibleExams.length === 0) {
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'>📭 لا يوجد امتحان مخصص لك حالياً.</p>";
            return;
        }

        accessibleExams.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });

        examsGrid.innerHTML = "";

        accessibleExams.forEach(activeExam => {
            const convertedQuestions = (activeExam.questions || []).map(q => {
                const isChoice = (q.type === "choice" || q.type === "mcq") || (Array.isArray(q.options) && q.options.length > 0);
                
                let correctAns = "";
                if (q.options && q.correctAnswerIndex !== undefined && q.options[q.correctAnswerIndex] !== undefined) {
                    correctAns = q.options[q.correctAnswerIndex];
                } else if (q.correctAnswer) {
                    correctAns = q.correctAnswer;
                }

                return {
                    section: "general",
                    type: isChoice ? "choice" : "essay",
                    question: q.question || q.text || q.questionText || "بدون نص",
                    imageUrl: q.imageUrl || q.image || "",
                    options: q.options || [],
                    correctAnswer: correctAns,
                    points: q.points || 1
                };
            });

            const examDuration = activeExam.duration || activeExam.durationMinutes || DEFAULT_EXAM_DURATION;

            dynamicExamsDatabase[activeExam.id] = {
                version: activeExam.version || 1,
                examTitle: activeExam.examCode || activeExam.title || activeExam.examName || "اختبار أونلاين",
                duration: examDuration,
                questions: convertedQuestions
            };

            examsGrid.innerHTML += `
                <div class="exam-card" id="card-${activeExam.id}">
                    <h3>🏫 ${activeExam.grade || studentStage || 'عام'}</h3>
                    <h4>${activeExam.examCode || activeExam.title || 'اختبار أونلاين'}</h4>
                    <p>📝 عدد الأسئلة: <strong>${convertedQuestions.length}</strong> أسئلة<br>⏱️ مدة الامتحان: <strong>${examDuration}</strong> دقيقة</p>
                    <button class="btn btn-exam" onclick="resetPortalToStep1('${activeExam.id}', 'exam')">ابدأ الآن 🚀</button>
                </div>
            `;
        });

        updateExamButtonsStatus();

    } catch (err) {
        console.error("خطأ أثناء تحميل الامتحان:", err);
        examsGrid.innerHTML = `
            <div style="text-align:center; color:#e74c3c; grid-column:1/-1; padding:20px;">
                <p>❌ تعذر تحميل الامتحانات بسبب بطء شبكة الموبايل أو عدم استجابة السيرفر.</p>
                <button onclick="location.reload()" style="padding:8px 16px; background:#0066ff; color:#fff; border:none; border-radius:6px; cursor:pointer;">إعادة المحاولة 🔄</button>
            </div>`;
    }
}

async function updateExamButtonsStatus() {
    const buttons = document.querySelectorAll('.main-content .btn');
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";

    for (let btn of buttons) {
        if (btn.classList.contains('btn-result-card')) continue;

        const onClickAttr = btn.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes('resetPortalToStep1')) {
            const matches = onClickAttr.match(/'([^']+)'/g);
            if (matches && matches.length >= 2) {
                const subjectKey = matches[0].replace(/'/g, '').trim();
                const type = matches[1].replace(/'/g, '').trim();

                let isSubmittedInDB = false;
                let isCheckedFromDB = false;

                if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
                    const safeSubjectKey = subjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
                    const safeIdentifier = (studentCode || studentFullName).replace(/[/\\.#$\[\]\s]/g, '_');
                    const uniqueDocId = `${safeIdentifier}_${safeSubjectKey}`;
                    try {
                        const doc = await db.collection("students").doc(uniqueDocId).get();
                        isCheckedFromDB = true;
                        
                        if (doc.exists && (doc.data().hasSubmitted === true || doc.data().isSubmitted === true)) {
                            isSubmittedInDB = true;
                        } else {
                            isSubmittedInDB = false;
                            localStorage.removeItem('finished_' + subjectKey);
                            localStorage.removeItem('finished_' + safeSubjectKey);
                            localStorage.removeItem('saved_exam_answers_' + subjectKey);
                            localStorage.removeItem('saved_exam_answers_' + safeSubjectKey);
                        }
                    } catch(e) {
                        console.warn("خطأ في الاتصال بقاعدة البيانات للفحص:", e);
                    }
                }

                const isLocallyFinished = isCheckedFromDB ? false : isExamFinished(subjectKey, type);

                if (isSubmittedInDB || isLocallyFinished) {
                    btn.style.background = "#64748b";
                    btn.style.cursor = "not-allowed";
                    btn.disabled = true;
                    btn.innerHTML = type === "exam" ? "🔒 تم أداء الامتحان" : "🔒 تم تسليم الواجب";
                } else {
                    btn.style.background = "#0066ff";
                    btn.style.cursor = "pointer";
                    btn.disabled = false;
                    btn.innerHTML = "ابدأ الآن 🚀";
                }
            }
        }
    }
}

// ==========================================
// 🔍 الاستعلام عن النتائج (محدث للاستعلام المباشر بالسيرفر)
// ==========================================
async function checkStudentResult() {
    const studentNameInput = document.getElementById("search-student-name");
    const studentCodeInput = document.getElementById("search-student-code");

    const querySearch = studentNameInput ? studentNameInput.value.trim().toLowerCase() : "";
    const codeSearch = studentCodeInput ? studentCodeInput.value.trim().toLowerCase() : "";
    const displayBox = document.getElementById("result-display-box");

    if (!querySearch || !codeSearch) {
        showCustomToast("⚠️ خطأ: يجب إدخال (اسم الطالب) و (كود الطالب / رقم الهاتف) معاً للاستعلام!", "warning");
        if (displayBox) {
            displayBox.style.display = "block";
            displayBox.innerHTML = `
                <div style="background: rgba(231, 76, 60, 0.1); border-right: 5px solid #e74c3c; padding: 18px; border-radius: 12px; text-align: right; margin-top: 15px;">
                    <p style="color:#e74c3c; font-weight:bold; margin:0; font-size:1.1rem;">
                        ⚠️ حقل الاسم وكود الطالب أو الهاتف مطلوبان معاً لإجراء الاستعلام!
                    </p>
                </div>
            `;
        }
        return;
    }

    displayBox.style.display = "block";
    displayBox.innerHTML = "<p style='text-align:center; color:#00d2ff; font-weight:bold;'>⏳ جاري البحث عن حالة النتيجة وتفاصيل الإجابات...</p>";

    let foundResults = [];

    if (typeof db !== 'undefined') {
        try {
            // استعلام سريع بدلالة الكود لتوفير موارد القراءة ورعايتها
            const snapshot = await db.collection("students")
                .where("studentCode", "==", codeSearch)
                .get();

            snapshot.forEach((doc) => {
                const data = doc.data();
                const storedName = (data.studentName || data.name || "").trim().toLowerCase();

                const hasSubmittedFlag = (data.hasSubmitted === true || data.isSubmitted === true || data.status === "submitted");
                const hasAnswers = (data.answers && Array.isArray(data.answers) && data.answers.length > 0) || 
                                   (data.answers && typeof data.answers === 'object' && Object.keys(data.answers).length > 0);
                const hasScore = (data.finalScore !== undefined || data.score !== undefined || data.mcqScore !== undefined);
                
                const isRealExamSubmitted = hasSubmittedFlag && (hasAnswers || hasScore);

                if (storedName.includes(querySearch) && isRealExamSubmitted) {
                    foundResults.push({ id: doc.id, ...data });
                }
            });

            if (foundResults.length > 0) {
                let html = `<h4 style="color: #00d2ff; text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 1.1rem;">📊 حالة أداء الامتحان ومراجعة الإجابات</h4>`;

                foundResults.forEach(docData => {
                    const studentStage = docData.stage || docData.studentGrade || localStorage.getItem('student_stage') || "غير محدد";
                    const examTitle = docData.examName || docData.examTitle || docData.title || "امتحان عام";
                    const submittedDate = docData.submittedAt || "تم التسليم بنجاح";

                    const isResultVisible = (docData.showScore === true || docData.showResult === true || docData.isResultVisible === true);

                    if (isResultVisible) {
                        const score = (docData.finalScore !== undefined) ? docData.finalScore : ((docData.score !== undefined) ? docData.score : (docData.mcqScore || 0));
                        const maxScore = (docData.maxScore !== undefined) ? docData.maxScore : ((docData.maxExamScore !== undefined) ? docData.maxExamScore : 10);
                        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

                        html += `
                            <div style="background: rgba(255, 255, 255, 0.05); border-right: 5px solid #2ecc71; padding: 18px; margin-bottom: 15px; border-radius: 12px; text-align: right;">
                                <h4 style="color: #2ecc71; margin-bottom: 10px; font-weight: bold;">🎉 النتيجة معتمدة ورسمية</h4>
                                <p style="margin-bottom: 8px;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name || docData.id}</p>
                                <p style="margin-bottom: 8px;"><strong>🏫 الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="margin-bottom: 12px; font-size: 1.1rem;"><strong>💯 الدرجة:</strong> 
                                    <span style="color:#2ecc71; font-weight:bold; font-size:1.3rem;">${score}</span> / <span>${maxScore}</span> (${percentage}%)
                                </p>
                        `;

                        // 🔍 مراجعة تفصيلية للأسئلة والإجابات
                        if (docData.answers && Array.isArray(docData.answers) && docData.answers.length > 0) {
                            html += `
                                <div style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 15px;">
                                    <h5 style="color: #00d2ff; margin-bottom: 15px; font-weight: bold; font-size: 1.05rem;">📝 مراجعة الإجابات والنموذج:</h5>
                            `;

                            docData.answers.forEach((item, index) => {
                                const qText = item.question || `سؤال ${index + 1}`;
                                const stAns = item.studentAnswer || "لم يحل";
                                const crAns = item.correctAnswer || "";
                                const isCorrect = item.isCorrect === true;
                                const qType = item.type || "choice";

                                let boxBg = isCorrect ? "rgba(46, 204, 113, 0.18)" : "rgba(231, 76, 60, 0.18)";
                                let borderColor = isCorrect ? "#2ecc71" : "#e74c3c";
                                let statusBadge = isCorrect ? "✅ إجابة صحيحة" : "❌ إجابة خاطئة";
                                let badgeColor = isCorrect ? "#2ecc71" : "#e74c3c";

                                if (qType === "essay" && item.isCorrect === undefined) {
                                    boxBg = "rgba(241, 196, 15, 0.18)";
                                    borderColor = "#f1c40f";
                                    statusBadge = "📝 سؤال مقالي";
                                    badgeColor = "#f1c40f";
                                }

                                html += `
                                    <div style="background: ${boxBg}; border-right: 5px solid ${borderColor}; padding: 14px 16px; margin-bottom: 12px; border-radius: 10px; text-align: right; transition: all 0.3s ease;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                            <strong style="color: #fff; font-size: 0.98rem;">س${index + 1}: ${qText}</strong>
                                            <span style="color: ${badgeColor}; font-weight: bold; font-size: 0.88rem; background: rgba(0,0,0,0.25); padding: 3px 10px; border-radius: 6px;">${statusBadge}</span>
                                        </div>
                                        <p style="margin: 6px 0; color: #cbd5e1; font-size: 0.92rem;">
                                            <strong>إجابتك:</strong> 
                                            <span style="color: ${isCorrect ? '#2ecc71' : '#e74c3c'}; font-weight: bold;">${stAns}</span>
                                        </p>
                                `;

                                if (!isCorrect && qType !== "essay" && crAns) {
                                    html += `
                                        <p style="margin: 6px 0; color: #2ecc71; font-size: 0.92rem;">
                                            <strong>الإجابة الصحيحة:</strong> <span style="font-weight: bold;">${crAns}</span>
                                        </p>
                                    `;
                                }

                                if (qType === "essay" && crAns) {
                                    html += `
                                        <p style="margin: 6px 0; color: #00d2ff; font-size: 0.92rem;">
                                            <strong>نموذج الإجابة:</strong> <span>${crAns}</span>
                                        </p>
                                    `;
                                }

                                html += `</div>`;
                            });

                            html += `</div>`;
                        }

                        html += `</div>`;

                    } else {
                        html += `
                            <div style="background: rgba(255, 255, 255, 0.05); border-right: 5px solid #f1c40f; padding: 18px; margin-bottom: 15px; border-radius: 12px; text-align: right;">
                                <h4 style="color: #f1c40f; margin-bottom: 10px; font-weight: bold;">⏳ تم التسليم وقيد المراجعة</h4>
                                <p style="margin-bottom: 8px;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name || docData.id}</p>
                                <p style="margin-bottom: 8px;"><strong>🏫 الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📅 وقت التسليم:</strong> ${submittedDate}</p>
                                <p style="color: #2ecc71; font-weight: bold; margin-top: 10px;">
                                    📩 الإجابات محفوظة لدى المعلم، وستظهر الدرجة ونموذج الإجابات هنا فور اعتمادها وإظهارها من اللوحة.
                                </p>
                            </div>
                        `;
                    }
                });

                displayBox.innerHTML = html;
                return;
            }
        } catch (err) {
            console.warn("خطأ في جلب بيانات النتيجة:", err);
        }
    }

    displayBox.innerHTML = `
        <div style="background: rgba(231, 76, 60, 0.1); border-right: 5px solid #e74c3c; padding: 20px; border-radius: 12px; text-align: right;">
            <p style="color:#e74c3c; font-weight:bold; margin:0 0 10px 0; font-size:1.1rem;">
                ❌ لم يتم العثور على امتحانات مكتملة
            </p>
            <p style="color: #cbd5e1; font-size: 0.95rem; margin:0;">
                عفواً، لم تقم بأداء أو تسليم أي امتحان بهذه البيانات حتى الآن. تذكر: لن تظهر النتيجة إلا بعد إنهاء الامتحان وتسليمه فعلياً.
            </p>
        </div>
    `;
}

// ==========================================
// 🔄 التنقل وبدء الامتحان
// ==========================================
function switchTab(tab) {
    if (window.isExamRunning) {
        showCustomToast("⚠️ عذراً! لا يمكنك التنقل بين الأقسام أثناء أداء الامتحان.", "warning");
        return;
    }

    const menuItems = document.querySelectorAll('.sidebar-menu li');
    menuItems.forEach(item => item.classList.remove('active'));

    if(document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
    if(document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';

    if (tab === 'exams') {
        document.getElementById('exams-section').style.display = 'block';
        if(menuItems[0]) menuItems[0].classList.add('active');
    } else if (tab === 'results') {
        document.getElementById('results-section').style.display = 'block';
        if(menuItems[1]) menuItems[1].classList.add('active');
    }
}

async function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";

    if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
        const safeSubjectKey = cleanSubjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
        const safeIdentifier = (studentCode || studentFullName).replace(/[/\\.#$\[\]\s]/g, '_');
        const uniqueDocId = `${safeIdentifier}_${safeSubjectKey}`;

        try {
            const docSnapshot = await db.collection("students").doc(uniqueDocId).get();
            if (docSnapshot.exists) {
                const data = docSnapshot.data();
                if (data.hasSubmitted === true || data.isSubmitted === true) {
                    localStorage.setItem('finished_' + cleanSubjectKey, (dynamicExamsDatabase[cleanSubjectKey]?.version || 1).toString());
                    showCustomToast("⚠️ عذراً، لقد قمت بأداء هذا الاختبار مسبقاً!", "error");
                    updateExamButtonsStatus();
                    return;
                }
            } else {
                localStorage.removeItem('finished_' + cleanSubjectKey);
                localStorage.removeItem('saved_exam_answers_' + cleanSubjectKey);
            }
        } catch (err) {
            console.error("خطأ في التحقق من حالة أداء الامتحان:", err);
        }
    }

    const dbSource = (cleanType === "exam") ? dynamicExamsDatabase : homeworksDatabase;
    if (!dbSource || !dbSource[cleanSubjectKey]) {
        showCustomToast(`⚠️ تنبيه: الامتحان غير متاح حالياً، حاول تحديث الصفحة.`, "warning");
        return;
    }

    currentActiveSubject = cleanSubjectKey;
    currentActiveType = cleanType;
    currentSubjectVersion = dbSource[cleanSubjectKey].version;

    activeQuestionsList = JSON.parse(JSON.stringify(dbSource[cleanSubjectKey].questions));

    document.getElementById('step-1').style.display = 'block';
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('portal-modal').style.display = 'flex';
}

function showInstructionsPage() {
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
}

function startExamActual() {
    document.getElementById('portal-modal').style.display = 'none';
    document.getElementById('quiz-wrapper-box').style.display = 'block';

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'none';

    if(document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
    if(document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';

    window.isExamRunning = true;

    renderQuestions();

    const examData = dynamicExamsDatabase[currentActiveSubject];
    const durationInMinutes = (examData && examData.duration) ? examData.duration : DEFAULT_EXAM_DURATION;

    if (currentActiveType === "exam") {
        const timerBanner = document.getElementById('timer-banner');
        if (timerBanner) timerBanner.style.display = 'flex';
        
        const endTime = Date.now() + (durationInMinutes * 60 * 1000);

        const examSessionState = {
            subjectKey: currentActiveSubject,
            type: currentActiveType,
            questions: activeQuestionsList,
            endTime: endTime
        };
        localStorage.setItem('active_running_exam_session', JSON.stringify(examSessionState));

        startTimer(endTime);
    }
}

function checkAndResumeRunningExam() {
    try {
        const savedSession = localStorage.getItem('active_running_exam_session');
        if (!savedSession) return;

        const sessionData = JSON.parse(savedSession);
        const remainingMs = sessionData.endTime - Date.now();

        if (remainingMs <= 0) {
            currentActiveSubject = sessionData.subjectKey;
            currentActiveType = sessionData.type;
            activeQuestionsList = sessionData.questions || [];
            localStorage.removeItem('active_running_exam_session');
            calculateAndSend(true);
            return;
        }

        currentActiveSubject = sessionData.subjectKey;
        currentActiveType = sessionData.type;
        activeQuestionsList = sessionData.questions;

        document.getElementById('quiz-wrapper-box').style.display = 'block';
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'none';

        if(document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
        if(document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';

        window.isExamRunning = true;

        renderQuestions();

        if (currentActiveType === "exam") {
            const timerBanner = document.getElementById('timer-banner');
            if (timerBanner) timerBanner.style.display = 'flex';
            startTimer(sessionData.endTime);
        }

        showCustomToast("🔄 تم استعادة جلسة الامتحان وإجاباتك بنجاح!", "success");

    } catch(e) {
        console.warn("خطأ في استعادة الجلسة الحالية:", e);
    }
}

// ==========================================
// 🎨 عرض الأسئلة (تعديل إصلاح innerHTML والتجميع المباشر)
// ==========================================
function renderQuestions() {
    const container = document.getElementById('questions-container');
    if (!container) return;

    const examTitle = dynamicExamsDatabase[currentActiveSubject]?.examTitle || "الامتحان الحالي";
    
    let fullHtml = `<h3 style='text-align:right; margin-bottom:12px; font-weight:bold; font-size:1.3rem; color:#00d2ff;'>${examTitle}</h3><hr style='margin-bottom:20px; opacity:0.15;'>`;

    if (!activeQuestionsList || activeQuestionsList.length === 0) {
        container.innerHTML = fullHtml + "<p style='color:#e74c3c; text-align:center;'>لا توجد أسئلة متوفرة حالياً.</p>";
        return;
    }

    let savedAnswers = {};
    try {
        savedAnswers = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch(e) {
        savedAnswers = {};
    }

    activeQuestionsList.forEach((q, qIndex) => {
        let html = `<div id="block-q${qIndex}" class="single-question-card">`;

        if (q.imageUrl && q.imageUrl.trim() !== "") {
            html += `
            <div style="margin-bottom: 15px; text-align:center;">
                <img src="${q.imageUrl}" alt="صورة السؤال">
            </div>`;
        }

        html += `<h3>س${qIndex + 1}: ${q.question} <span style="color:#e74c3c;">*</span></h3>`;

        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);

        if (isChoice) {
            html += `<div class="options-group" style="display:flex; flex-direction:column; gap:10px;">`;
            q.options.forEach((opt) => {
                let isChecked = (savedAnswers[`q${qIndex}`] === opt) ? 'checked' : '';
                const cleanOptEscaped = opt.replace(/'/g, "\\'");
                html += `
                    <label class="option-label">
                        <input type="radio" name="q${qIndex}" value="${opt}" ${isChecked} onchange="autoSaveAnswer('q${qIndex}', '${cleanOptEscaped}')">
                        <span style="font-size:0.95rem; color:#fff;">${opt}</span>
                    </label>
                `;
            });
            html += `</div>`;
        } else {
            let savedText = savedAnswers[`q${qIndex}`] || '';
            html += `<textarea name="q${qIndex}" oninput="autoSaveAnswer('q${qIndex}', this.value)" style="width:100%; height:110px; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.4); color:#fff; resize:vertical; outline:none;" placeholder="اكتب إجابتك التفصيلية هنا...">${savedText}</textarea>`;
        }
        fullHtml += html + `</div>`;
    });

    container.innerHTML = fullHtml;

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.style.display = 'block';
}

function autoSaveAnswer(questionKey, answerValue) {
    if (!currentActiveSubject) return;
    try {
        let storageKey = 'saved_exam_answers_' + currentActiveSubject;
        let savedAnswers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        savedAnswers[questionKey] = answerValue;
        localStorage.setItem(storageKey, JSON.stringify(savedAnswers));
    } catch(e) {
        console.warn("خطأ في الحفظ التلقائي:", e);
    }
}

// ==========================================
// ⏱️ دالة التايمر المحسّنة (تعتمد على الوقت الفعلي)
// ==========================================
function startTimer(targetEndTime) {
    clearInterval(timerInterval);

    if (!targetEndTime) {
        try {
            const savedSession = JSON.parse(localStorage.getItem('active_running_exam_session') || '{}');
            targetEndTime = savedSession.endTime;
        } catch(e) {}
    }

    if (!targetEndTime) {
        const duration = (dynamicExamsDatabase[currentActiveSubject]?.duration || DEFAULT_EXAM_DURATION) * 60 * 1000;
        targetEndTime = Date.now() + duration;
    }

    function updateTimerDisplay() {
        const now = Date.now();
        const totalSecondsLeft = Math.ceil((targetEndTime - now) / 1000);
        const display = document.getElementById('timer-display');

        if (totalSecondsLeft <= 0) {
            if (display) display.textContent = "00:00";
            clearInterval(timerInterval);
            showCustomToast("⏰ انتهى الوقت المحدد! سيتم تسليم الإجابات تلقائياً الآن.", "warning");
            calculateAndSend(true);
            return;
        }

        let m = Math.floor(totalSecondsLeft / 60);
        let s = totalSecondsLeft % 60;
        if (display) {
            display.textContent = `${m}:${s < 10 ? '0' + s : s}`;
        }
    }

    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

// ==========================================
// 🔍 الفحص قبل التسليم والتذكير بالأسئلة المنسية
// ==========================================
function submitExamWithCheck() {
    let unansweredIndices = [];

    activeQuestionsList.forEach((q, qIndex) => {
        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);
        if (isChoice) {
            let selected = document.querySelector(`input[name="q${qIndex}"]:checked`);
            if (!selected) unansweredIndices.push(qIndex + 1);
        } else {
            let textarea = document.querySelector(`textarea[name="q${qIndex}"]`);
            if (!textarea || textarea.value.trim() === "") unansweredIndices.push(qIndex + 1);
        }
    });

    createConfirmSubmitModal();
    const modalText = document.getElementById('confirm-modal-text');

    if (unansweredIndices.length > 0) {
        const firstUnansweredElem = document.getElementById(`block-q${unansweredIndices[0] - 1}`);
        if (firstUnansweredElem) {
            firstUnansweredElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstUnansweredElem.style.border = '2px solid #e74c3c';
            setTimeout(() => { firstUnansweredElem.style.border = '1px solid rgba(255,255,255,0.08)'; }, 4000);
        }

        showCustomToast(`⚠️ تذكير: نسيت الإجابة على السؤال رقم (${unansweredIndices.join(' ، ')})!`, "warning");

        if (modalText) {
            modalText.innerHTML = `⚠️ <strong style="color:#f1c40f;">تنبيه:</strong> نسيت الإجابة على الأسئلة التالية: <br><span style="color:#e74c3c; font-weight:bold; font-size:1.15rem;">(سؤال ${unansweredIndices.join(' ، ')})</span><br><br>هل تريد تسليم الامتحان رغم ذلك أم المراجعة؟`;
        }
    } else {
        if (modalText) {
            modalText.innerHTML = `🎉 ممتاز! لقد قمت بالإجابة على جميع الأسئلة.<br><br>هل أنت متأكد من تسليم الإجابات الآن؟`;
        }
    }

    document.getElementById('submit-confirm-modal').style.display = 'flex';
}

function closeConfirmSubmitModal() {
    const modal = document.getElementById('submit-confirm-modal');
    if (modal) modal.style.display = 'none';
}

function confirmFinalSubmit() {
    closeConfirmSubmitModal();
    calculateAndSend(true);
}

// ==========================================
// 📤 تصحيح وتسليم الإجابات (معدّل للحفظ بالكود ومقارنة الاختيارات بدقة)
// ==========================================
function calculateAndSend(bypassValidation = false) {
    let studentAnswersText = {};
    let answersForAdmin = [];
    let mcqScoreObtained = 0;
    let maxMcqScorePossible = 0;
    let totalExamPointsPossible = 0;

    activeQuestionsList.forEach((q, qIndex) => {
        let questionKey = "س" + (qIndex + 1) + ": " + q.question;
        let studentValue = "";
        let correctionStatus = "";
        let isCorrect = false;
        let points = q.points || 1;

        totalExamPointsPossible += points;
        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);

        if (isChoice) {
            maxMcqScorePossible += points;
            let selected = document.querySelector(`input[name="q${qIndex}"]:checked`);
            if (selected) {
                studentValue = selected.value;

                let correctText = (q.correctAnswer || "").toString().trim();
                if (typeof q.correctAnswerIndex === "number" && q.options && q.options[q.correctAnswerIndex] !== undefined) {
                    correctText = q.options[q.correctAnswerIndex].toString().trim();
                }

                if (studentValue.trim().toLowerCase() === correctText.toLowerCase()) {
                    mcqScoreObtained += points;
                    isCorrect = true;
                    correctionStatus = ` [✅ صحيح]`;
                } else {
                    isCorrect = false;
                    correctionStatus = ` [❌ خطأ]`;
                }
            } else {
                studentValue = "لم يحل";
                isCorrect = false;
                correctionStatus = ` [❌ لم يحل]`;
            }
        } else {
            let textarea = document.querySelector(`textarea[name="q${qIndex}"]`);
            if (textarea && textarea.value.trim() !== "") {
                studentValue = textarea.value.trim();
            } else {
                studentValue = "لم يكتب إجابة";
            }
            correctionStatus = ` [📝 مقالي]`;
        }

        studentAnswersText[questionKey] = studentValue + correctionStatus;

        answersForAdmin.push({
            question: q.question,
            studentAnswer: studentValue,
            correctAnswer: q.correctAnswer || "",
            isCorrect: isCorrect,
            type: isChoice ? "choice" : "essay",
            points: points
        });
    });

    clearInterval(timerInterval);
    window.isExamRunning = false;
    
    const timerBanner = document.getElementById('timer-banner');
    if (timerBanner) timerBanner.style.display = 'none';

    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "طالب مجهول";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";
    let studentPhone = localStorage.getItem('student_phone') || "";
    let parentPhone = localStorage.getItem('parent_phone') || "";
    let studentStage = localStorage.getItem('student_stage') || "غير محدد";

    let currentExamTitle = (dynamicExamsDatabase[currentActiveSubject] && dynamicExamsDatabase[currentActiveSubject].examTitle)
                            ? dynamicExamsDatabase[currentActiveSubject].examTitle
                            : currentActiveSubject;

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "جاري تسليم الإجابات...";
    }

    const currentFormattedTime = new Date().toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    if (typeof db !== 'undefined') {
        const safeSubjectKey = currentActiveSubject.replace(/[/\\.#$\[\]\s]/g, '_');
        const safeIdentifier = (studentCode || studentFullName).toString().replace(/[/\\.#$\[\]\s]/g, '_');
        const uniqueDocId = `${safeIdentifier}_${safeSubjectKey}`;

        db.collection("students").doc(uniqueDocId).set({
            studentName: studentFullName,
            name: studentFullName,
            studentCode: studentCode,
            code: studentCode,
            studentPhone: studentPhone,
            phone: studentPhone,
            parentPhone: parentPhone,
            stage: studentStage,
            grade: studentStage,
            examName: currentExamTitle,
            examTitle: currentExamTitle,
            title: currentExamTitle,
            examCode: currentActiveSubject,
            examType: currentActiveType,
            mcqScore: mcqScoreObtained,
            score: mcqScoreObtained,
            finalScore: mcqScoreObtained,
            maxScore: totalExamPointsPossible || 10,
            maxExamScore: totalExamPointsPossible || 10,
            answers: answersForAdmin,
            hasSubmitted: true,
            isSubmitted: true,
            showScore: false,
            showResult: false,
            isResultVisible: false,
            submittedAt: currentFormattedTime,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
            
            localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
            localStorage.removeItem('active_running_exam_session');

            showCustomToast("🎉 تم تسليم الامتحان بنجاح!", "success");
            
            setTimeout(() => {
                window.location.reload();
            }, 2500);

        }).catch((error) => {
            console.error("خطأ أثناء تسليم الامتحان: ", error);
            showCustomToast("❌ حدث خطأ أثناء تسليم إجاباتك، يرجى المحاولة مرة أخرى.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "تسليم الإجابات";
            }
        });
    }
}

// ==========================================
// 👑 دالة إعادة الامتحان للطالب من لوحة الأدمن (مُحدثة)
// ==========================================
async function resetStudentExamByAdmin(studentFullName, subjectKey, studentCode = "") {
    if (typeof db === 'undefined' || (!studentFullName && !studentCode) || !subjectKey) {
        showCustomToast("❌ بيانات الطالب أو الامتحان غير مكتملة!", "error");
        return;
    }

    const safeSubjectKey = subjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
    const safeIdentifier = (studentCode || studentFullName).toString().replace(/[/\\.#$\[\]\s]/g, '_');
    const uniqueDocId = `${safeIdentifier}_${safeSubjectKey}`;

    try {
        await db.collection("students").doc(uniqueDocId).delete();

        localStorage.removeItem('finished_' + subjectKey);
        localStorage.removeItem('finished_' + safeSubjectKey);
        localStorage.removeItem('saved_exam_answers_' + subjectKey);
        localStorage.removeItem('saved_exam_answers_' + safeSubjectKey);
        localStorage.removeItem('active_running_exam_session');

        showCustomToast(`✅ تم إعادة فتح الامتحان بنجاح للطالب (${studentFullName})!`, "success");
        
        updateExamButtonsStatus();

    } catch (error) {
        console.error("خطأ في إعادة الامتحان للطالب:", error);
        showCustomToast("❌ حدث خطأ أثناء إعادة الامتحان للطالب.", "error");
    }
}