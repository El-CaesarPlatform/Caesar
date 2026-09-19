// ==========================================
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
// ⚙️ 2. المتغيرات العامة والدوال المساعدة
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

// دالة توحيد النصوص العربية لتجنب أخطاء الإملاء
function normalizeArabicText(text) {
    if (!text) return "";
    return text.toString().trim().toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/\s+/g, " ");
}

// دالة إنشاء معرف المستند الموحد في Firebase
function getUniqueDocId(identifier, subjectKey) {
    const cleanId = (identifier || "").toString().trim().replace(/[/\\.#$\[\]\s]/g, '_');
    const cleanSub = (subjectKey || "").toString().trim().replace(/[/\\.#$\[\]\s]/g, '_');
    return `${cleanId}_${cleanSub}`;
}

// دالة تنظيف الرموز الخاصة في نصوص الـ HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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

// دالة تنظيف مخزن المتصفح من بقايا الامتحانات القديمة غير النشطة
function cleanStaleExamStorage(activeExamIds = []) {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('saved_exam_answers_') || key.startsWith('finished_'))) {
                const examId = key.replace('saved_exam_answers_', '').replace('finished_', '');
                if (activeExamIds.length > 0 && !activeExamIds.includes(examId)) {
                    keysToRemove.push(key);
                }
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn("خطأ أثناء تنظيف الـ LocalStorage القديم:", e);
    }
}

// دالة توليد قالب مراجعة الأسئلة مع إجابة الطالب والإجابة النموذجية
function generateQuestionsReviewHtml(answers) {
    if (!answers || !Array.isArray(answers) || answers.length === 0) return '';
    
    let html = `
        <div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 18px;">
            <h5 style="color: #00d2ff; font-size: 1.1rem; font-weight: bold; margin-bottom: 16px; text-align: right; display: flex; align-items: center; gap: 8px;">
                📝 تفاصيل الأسئلة ونموذج الإجابة:
            </h5>
    `;

    answers.forEach((item, index) => {
        const qText = item.question || `سؤال ${index + 1}`;
        const stAns = item.studentAnswer || "لم يحل";
        const crAns = item.correctAnswer || "غير محدد";
        const isCorrect = item.isCorrect === true;
        const qType = item.type || "choice";

        let boxBg, borderColor, icon, statusText;

        if (qType === "essay" && item.isCorrect === undefined) {
            boxBg = "rgba(241, 196, 15, 0.06)";
            borderColor = "#f1c40f";
            icon = "✍️";
            statusText = "سؤال مقالي (قيد المراجعة)";
        } else if (isCorrect) {
            boxBg = "rgba(46, 204, 113, 0.08)";
            borderColor = "#2ecc71";
            icon = "✅";
            statusText = "إجابة صحيحة";
        } else {
            boxBg = "rgba(231, 76, 60, 0.08)";
            borderColor = "#e74c3c";
            icon = "❌";
            statusText = "إجابة خاطئة";
        }

        html += `
            <div style="background: ${boxBg}; border: 1px solid rgba(255,255,255,0.06); border-right: 4px solid ${borderColor}; padding: 14px; margin-bottom: 14px; border-radius: 12px; text-align: right;">
                <div style="margin-bottom: 8px;">
                    <strong style="color: #fff; font-size: 0.98rem; line-height: 1.6;">
                        س${index + 1}: ${escapeHtml(qText)}
                    </strong>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <span style="color: #cbd5e1; font-size: 0.9rem;">
                            إجابتك: <strong style="color: ${borderColor}; font-size: 0.95rem;">${escapeHtml(stAns)}</strong>
                        </span>
                        <span style="font-size: 0.78rem; background: rgba(0,0,0,0.5); padding: 3px 9px; border-radius: 6px; color: ${borderColor}; font-weight: bold;">
                            ${icon} ${statusText}
                        </span>
                    </div>

                    ${(!isCorrect || qType === "essay") ? `
                        <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px; margin-top: 4px;">
                            <span style="color: #cbd5e1; font-size: 0.9rem;">
                                الإجابة النموذجية الصحيحة: <strong style="color: #00d2ff; text-shadow: 0 0 5px rgba(0,210,255,0.3);">${escapeHtml(crAns)}</strong>
                            </span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

// ==========================================
// 💾 نظام مزامنة "حسابي" مع النتائج الحقيقية فقط
// ==========================================
function getStoredHistory() {
    try {
        let history = JSON.parse(localStorage.getItem('alqeisar_exam_history') || '[]');
        // حذف أي امتحانات تجريبية أو وهمية ممتحنهاش الطالب
        history = history.filter(item => {
            if (!item || !item.examName) return false;
            const s = String(item.serial || '');
            if (['11028', '83978', '84457'].includes(s)) return false;
            if (item.id && item.id.startsWith('init_')) return false;
            // استبعاد الامتحانات الصفرية الوهمية التي لم يؤدها
            if (item.solvedQuestions === 0 && item.score && item.score.includes('0.0')) return false;
            return true;
        });
        localStorage.setItem('alqeisar_exam_history', JSON.stringify(history));
        return history;
    } catch (e) {
        return [];
    }
}

// مزامنة دقيقة مع Firebase لجلب نتائج الطالب الفعلية فقط والتحقق من موافقة الأدمن
async function syncAccountWithFirebase() {
    const studentCode = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    const studentName = normalizeArabicText(localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "");

    if (!studentCode && !studentName) {
        renderAccountHistoryTable();
        return;
    }

    if (typeof db !== 'undefined') {
        try {
            let snapshot = await db.collection("students").where("studentCode", "==", studentCode).get();
            if (snapshot.empty && studentCode) {
                snapshot = await db.collection("students").where("code", "==", studentCode).get();
            }

            let realSubmissions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.hasSubmitted === true || data.isSubmitted === true || (data.answers && data.answers.length > 0)) {
                    realSubmissions.push({ id: doc.id, ...data });
                }
            });

            if (realSubmissions.length === 0 && studentName) {
                const allSnap = await db.collection("students").get();
                allSnap.forEach(doc => {
                    const data = doc.data();
                    const sName = normalizeArabicText(data.studentName || data.name || "");
                    if (sName && (sName.includes(studentName) || studentName.includes(sName))) {
                        if (data.hasSubmitted === true || data.isSubmitted === true || (data.answers && data.answers.length > 0)) {
                            realSubmissions.push({ id: doc.id, ...data });
                        }
                    }
                });
            }

            if (realSubmissions.length > 0) {
                const updatedHistory = realSubmissions.map((docData, idx) => {
                    // شرط موافقة الأدمن لإظهار الدرجة والإجابات
                    const isApproved = (docData.showScore === true || docData.showResult === true || docData.isResultVisible === true);
                    const score = (docData.finalScore !== undefined) ? docData.finalScore : ((docData.score !== undefined) ? docData.score : 0);
                    const maxScore = docData.maxScore || docData.maxExamScore || 10;
                    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                    
                    const totalQuestions = (docData.answers && Array.isArray(docData.answers)) ? docData.answers.length : (docData.totalQuestions || 10);
                    const solvedCount = (docData.answers && Array.isArray(docData.answers)) 
                        ? docData.answers.filter(a => a.studentAnswer && a.studentAnswer !== "لم يحل" && a.studentAnswer !== "لم يكتب إجابة").length 
                        : (docData.correctCount || totalQuestions);

                    return {
                        id: docData.id,
                        serial: (docData.serial || (20000 + idx)).toString(),
                        examName: docData.examName || docData.examTitle || docData.title || "اختبار أونلاين",
                        totalQuestions: totalQuestions,
                        percentage: isApproved ? `% ${percentage}` : '⏳ قيد التصحيح',
                        score: isApproved ? `${score}.0 من ${maxScore}` : 'قيد التصحيح ⏳',
                        solvedQuestions: solvedCount,
                        canReview: isApproved,
                        startTime: docData.startTimeFormatted || docData.submittedAt || 'غير محدد',
                        endTime: docData.submittedAt || 'تم التسليم',
                        answers: docData.answers || []
                    };
                });

                localStorage.setItem('alqeisar_exam_history', JSON.stringify(updatedHistory));
            }
        } catch (e) {
            console.warn("خطأ في المزامنة مع السيرفر:", e);
        }
    }

    renderAccountHistoryTable();
}

function renderAccountHistoryTable() {
    const tbody = document.getElementById('student-history-tbody');
    const countDisplay = document.getElementById('history-count-display');
    const totalDisplay = document.getElementById('history-total-display');
    if (!tbody) return;

    let history = getStoredHistory();

    if (countDisplay) countDisplay.textContent = history.length;
    if (totalDisplay) totalDisplay.textContent = history.length;

    tbody.innerHTML = '';

    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 35px 15px; color: var(--text-sub);">
                    📭 لا توجد نتائج سابقة مسجلة حتى الآن.<br>
                    <span style="font-size: 0.82rem; color: #64748b;">ستظهر درجاتك هنا فور أداء وتسليم أي اختبار مخصص لك.</span>
                </td>
            </tr>
        `;
        return;
    }

    history.forEach((row) => {
        const isUnderReview = !row.canReview || (row.score && row.score.includes('قيد التصحيح'));
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: var(--accent-gold); font-weight: 800;">${row.serial || '---'}</td>
            <td style="font-weight: 800; color: #ffffff;">${escapeHtml(row.examName)}</td>
            <td>${row.totalQuestions}</td>
            <td style="font-weight: 800; color: ${isUnderReview ? '#f1c40f' : 'var(--accent-cyan)'};">
                ${row.percentage}
            </td>
            <td style="font-weight: 800; color: ${isUnderReview ? '#f1c40f' : '#2ecc71'};">
                ${row.score}
            </td>
            <td>${row.solvedQuestions}</td>
            <td>
                ${!isUnderReview 
                    ? `<button class="tag-answers-btn" onclick="openAnswersReviewModal('${row.id || row.serial}')">عرض الاجابات</button>` 
                    : `<span class="tag-answers-disabled" style="color: #ff0055; font-weight: 700; font-size: 0.82rem;">--الاجابات غير متاحة--</span>`}
            </td>
            <td style="font-size: 0.8rem; color: #94a3b8;">${row.startTime || 'غير محدد'}</td>
            <td style="font-size: 0.8rem; color: #94a3b8;">${row.endTime || 'غير محدد'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function openAnswersReviewModal(recordId) {
    const history = getStoredHistory();
    const item = history.find(h => (h.id === recordId || h.serial === recordId));
    
    if (!item || !item.canReview || !item.answers || item.answers.length === 0) {
        showCustomToast("🔒 الإجابات غير متاحة حالياً لحين اعتمادها من المعلم.", "warning");
        return;
    }

    let reviewModal = document.getElementById('answers-review-modal');
    if (!reviewModal) {
        reviewModal = document.createElement('div');
        reviewModal.id = 'answers-review-modal';
        reviewModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(5, 6, 8, 0.94);
            backdrop-filter: blur(10px);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 18px;
            direction: rtl;
        `;
        document.body.appendChild(reviewModal);
    }

    reviewModal.innerHTML = `
        <div style="background: #0f1422; border: 1px solid rgba(0,242,254,0.3); border-radius: 20px; max-width: 650px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 16px 20px; background: #141c2c; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                <h4 style="color: #00f2fe; margin: 0; font-size: 1.1rem; font-weight: 800;">📖 مراجعة إجابات: ${escapeHtml(item.examName)}</h4>
                <button onclick="document.getElementById('answers-review-modal').style.display='none'" style="background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer;">✕</button>
            </div>
            <div style="padding: 18px; overflow-y: auto; flex: 1;">
                ${generateQuestionsReviewHtml(item.answers)}
            </div>
            <div style="padding: 12px; background: #141c2c; text-align: center;">
                <button onclick="document.getElementById('answers-review-modal').style.display='none'" style="padding: 8px 24px; background: #0088ff; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">إغلاق</button>
            </div>
        </div>
    `;

    reviewModal.style.display = 'flex';
}

function updateProfileUI() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "طالب";
    let studentStage = localStorage.getItem("student_stage") || "الصف الثاني الإعدادي";

    if (document.getElementById("profile-name")) document.getElementById("profile-name").textContent = studentName;
    if (document.getElementById("profile-stage")) document.getElementById("profile-stage").textContent = studentStage;
    if (document.getElementById("user-display-name")) document.getElementById("user-display-name").textContent = "أهلاً: " + studentName;
}

// ==========================================
// 🔍 دالة فحص استحقاق الطالب للامتحان
// ==========================================
function canStudentAccessExam(exam, studentCode, studentStage, studentName, studentPhone) {
    const cleanCode = (studentCode || "").toString().trim().toLowerCase();
    const cleanName = normalizeArabicText(studentName);
    const cleanPhone = (studentPhone || "").toString().trim().toLowerCase();

    const targetType = exam.targetType || 'all';

    if (targetType === 'specific' || targetType === 'single') {
        const targetCode = (exam.targetCode || exam.targetStudentCode || (exam.targetStudent && exam.targetStudent.code) || "").toString().trim().toLowerCase();
        const targetName = normalizeArabicText(exam.targetName || exam.targetStudentName || (exam.targetStudent && exam.targetStudent.name) || "");
        const targetPhone = (exam.targetPhone || (exam.targetStudent && exam.targetStudent.phone) || "").toString().trim().toLowerCase();

        return (cleanCode && targetCode === cleanCode) ||
               (cleanPhone && targetPhone === cleanPhone) ||
               (cleanName && targetName && (cleanName.includes(targetName) || targetName.includes(cleanName)));
    }

    if (targetType === 'multiple' || targetType === 'selected') {
        const rawCodes = Array.isArray(exam.targetCodes) ? exam.targetCodes : (Array.isArray(exam.selectedCodes) ? exam.selectedCodes : []);
        const targetCodes = rawCodes.map(c => (c || "").toString().trim().toLowerCase());

        const rawNames = Array.isArray(exam.targetNames) ? exam.targetNames : (Array.isArray(exam.selectedStudents) ? exam.selectedStudents : []);
        const targetNames = rawNames.map(n => normalizeArabicText(typeof n === 'object' ? (n.name || n.code || '') : n));

        return (cleanCode && targetCodes.includes(cleanCode)) || 
               (cleanName && targetNames.some(tn => tn && (cleanName.includes(tn) || tn.includes(cleanName))));
    }

    if (targetType === 'all' || targetType === 'عام' || !targetType) {
        if (exam.grade && exam.grade !== "عام" && exam.grade !== "الكل" && studentStage && studentStage !== "غير محدد") {
            return exam.grade === studentStage;
        }
        return true;
    }

    return false;
}

// ==========================================
// 🚀 عند تحميل الصفحة والتجهيز
// ==========================================
window.onload = function() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    let studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || localStorage.getItem("code") || "";
    let studentPhone = localStorage.getItem("student_phone") || "";
    let parentPhone = localStorage.getItem("parent_phone") || "";
    let studentStage = localStorage.getItem("student_stage") || "الصف الثاني الإعدادي";

    if (!studentName || !studentCode) {
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

        if (!studentName || !studentCode) {
            showCustomToast("⚠️ بيانات الدخول غير مكتملة، جاري توجيهك لصفحة التسجيل...", "warning");
            setTimeout(() => { window.location.href = "login.html"; }, 2000);
            return;
        }
    }

    const displayElement = document.getElementById('user-display-name');
    if (displayElement) displayElement.textContent = "أهلاً: " + studentName;

    updateProfileUI();
    syncAccountWithFirebase();

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
// 📚 جلب وعرض الاختبارات المخصصة
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

        const now = Date.now();

        const accessibleExams = allExams.filter(exam => {
            if (exam.isActive === false || exam.status === 'archived' || exam.status === 'expired' || exam.isOld === true) {
                return false;
            }

            if (exam.expiryDate) {
                const expTime = new Date(exam.expiryDate).getTime();
                if (!isNaN(expTime) && now > expTime) return false;
            }
            if (exam.endDate) {
                const endTime = new Date(exam.endDate).getTime();
                if (!isNaN(endTime) && now > endTime) return false;
            }

            return canStudentAccessExam(exam, studentCode, studentStage, studentName, studentPhone);
        });

        cleanStaleExamStorage(accessibleExams.map(e => e.id));

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
        if (btn.classList.contains('btn-result-card') || btn.classList.contains('tag-answers-btn')) continue;

        const onClickAttr = btn.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes('resetPortalToStep1')) {
            const matches = onClickAttr.match(/'([^']+)'/g);
            if (matches && matches.length >= 2) {
                const subjectKey = matches[0].replace(/'/g, '').trim();
                const type = matches[1].replace(/'/g, '').trim();

                let isSubmittedInDB = false;
                let isCheckedFromDB = false;

                if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
                    const uniqueDocId = getUniqueDocId(studentCode || studentFullName, subjectKey);
                    try {
                        const doc = await db.collection("students").doc(uniqueDocId).get();
                        isCheckedFromDB = true;
                        
                        if (doc.exists && (doc.data().hasSubmitted === true || doc.data().isSubmitted === true)) {
                            isSubmittedInDB = true;
                        } else {
                            isSubmittedInDB = false;
                            localStorage.removeItem('finished_' + subjectKey);
                            localStorage.removeItem('saved_exam_answers_' + subjectKey);
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
// 🔍 الاستعلام عن النتائج في كشف النتائج (مع عرض الأسئلة ونموذج الإجابة)
// ==========================================
async function checkStudentResult() {
    const studentNameInput = document.getElementById("search-student-name");
    const studentCodeInput = document.getElementById("search-student-code");

    const rawNameSearch = studentNameInput ? studentNameInput.value.trim() : "";
    const rawCodeSearch = studentCodeInput ? studentCodeInput.value.trim() : "";
    
    const querySearchNorm = normalizeArabicText(rawNameSearch);
    const codeSearchLower = rawCodeSearch.toLowerCase();
    const displayBox = document.getElementById("result-display-box");

    if (!rawNameSearch || !rawCodeSearch) {
        showCustomToast("⚠️ خطأ: يجب إدخال (اسم الطالب) و (كود الطالب) معاً للاستعلام!", "warning");
        if (displayBox) {
            displayBox.style.display = "block";
            displayBox.innerHTML = `
                <div style="background: rgba(231, 76, 60, 0.1); border-right: 5px solid #e74c3c; padding: 18px; border-radius: 12px; text-align: right; margin-top: 15px;">
                    <p style="color:#e74c3c; font-weight:bold; margin:0; font-size:1.1rem;">
                        ⚠️ حقل الاسم وكود الطالب مطلوبان معاً لإجراء الاستعلام!
                    </p>
                </div>
            `;
        }
        return;
    }

    if (!displayBox) return;

    displayBox.style.display = "block";
    displayBox.innerHTML = "<p style='text-align:center; color:#00d2ff; font-weight:bold; text-shadow: 0 0 10px rgba(0, 210, 255, 0.5);'>⏳ جاري البحث عن الامتحانات التي قمت بأدائها...</p>";

    let foundResults = [];

    if (typeof db !== 'undefined') {
        try {
            let snapshot = await db.collection("students").where("studentCode", "==", rawCodeSearch).get();

            if (snapshot.empty && rawCodeSearch !== codeSearchLower) {
                snapshot = await db.collection("students").where("studentCode", "==", codeSearchLower).get();
            }

            if (snapshot.empty) {
                snapshot = await db.collection("students").where("code", "==", rawCodeSearch).get();
            }

            if (!snapshot.empty) {
                snapshot.forEach((doc) => {
                    foundResults.push({ id: doc.id, ...doc.data() });
                });
            } else {
                const allSnap = await db.collection("students").get();
                allSnap.forEach((doc) => {
                    const data = doc.data();
                    const stCode = (data.studentCode || data.code || "").toString().trim();
                    if (stCode.toLowerCase() === codeSearchLower || doc.id.toLowerCase().includes(codeSearchLower)) {
                        foundResults.push({ id: doc.id, ...data });
                    }
                });
            }

            let finalFilteredResults = [];
            foundResults.forEach(docData => {
                const storedNameNorm = normalizeArabicText(docData.studentName || docData.name || "");
                const storedCode = (docData.studentCode || docData.code || "").toString().trim().toLowerCase();

                const isCodeMatch = (storedCode === codeSearchLower || docData.id.toLowerCase().includes(codeSearchLower));
                const isNameMatch = storedNameNorm && querySearchNorm && (storedNameNorm.includes(querySearchNorm) || querySearchNorm.includes(storedNameNorm));

                const hasSubmittedFlag = (docData.hasSubmitted === true || docData.isSubmitted === true || docData.status === "submitted");
                const hasAnswers = (docData.answers && Array.isArray(docData.answers) && docData.answers.length > 0);

                if (isCodeMatch && isNameMatch && (hasSubmittedFlag || hasAnswers)) {
                    finalFilteredResults.push(docData);
                }
            });

            if (finalFilteredResults.length > 0) {
                let html = `<h4 style="color: #00d2ff; text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 1.2rem;">📊 كشف الامتحانات التي قمت بأدائها (${finalFilteredResults.length})</h4>`;

                finalFilteredResults.forEach(docData => {
                    const studentStage = docData.stage || docData.studentGrade || localStorage.getItem('student_stage') || "غير محدد";
                    const examTitle = docData.examName || docData.examTitle || docData.title || "امتحان عام";
                    const submittedDate = docData.submittedAt || "تم التسليم بنجاح";
                    
                    const isResultVisible = (docData.showScore === true || docData.showResult === true || docData.isResultVisible === true);

                    if (isResultVisible) {
                        const score = (docData.finalScore !== undefined) ? docData.finalScore : ((docData.score !== undefined) ? docData.score : (docData.mcqScore || 0));
                        const maxScore = (docData.maxScore !== undefined) ? docData.maxScore : ((docData.maxExamScore !== undefined) ? docData.maxExamScore : 10);
                        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                        let scoreColor = percentage >= 85 ? '#2ecc71' : (percentage >= 50 ? '#f1c40f' : '#e74c3c');

                        html += `
                            <div style="background: rgba(20, 20, 35, 0.8); border: 1px solid rgba(255,255,255,0.1); border-right: 5px solid ${scoreColor}; box-shadow: 0 0 15px rgba(0,0,0,0.5); padding: 18px; margin-bottom: 20px; border-radius: 12px; text-align: right;">
                                <h4 style="color: ${scoreColor}; margin-bottom: 15px; font-weight: bold;">🏆 النتيجة النهائية</h4>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name}</p>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong>🏫 الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                
                                <div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; text-align: center;">
                                    <span style="font-size: 1.1rem; color: #fff;">الدرجة: </span>
                                    <span style="color:${scoreColor}; font-weight:bold; font-size:1.6rem;">${score}</span> 
                                    <span style="color:#fff; font-size:1.2rem;"> / ${maxScore}</span>
                                    <div style="margin-top: 10px; font-size: 1.25rem; color: ${scoreColor}; font-weight: bold;">النسبة المئوية: %${percentage}</div>
                                </div>

                                <!-- 📝 إظهار الأسئلة وإجابة الطالب والنموذج الصحيح -->
                                ${generateQuestionsReviewHtml(docData.answers)}
                            </div>
                        `;
                    } else {
                        html += `
                            <div style="background: rgba(241, 196, 15, 0.1); border-right: 5px solid #f1c40f; padding: 18px; border-radius: 12px; text-align: right; margin-bottom: 15px;">
                                <h4 style="color: #f1c40f; margin-bottom: 10px;">⏳ قيد التصحيح والمراجعة</h4>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name}</p>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong>📅 وقت التسليم:</strong> ${submittedDate}</p>
                                <p style="color: #2ecc71; font-weight: bold; margin-top: 10px;">
                                    📩 تم حفظ إجاباتك بنجاح، وستظهر الدرجة ونموذج الإجابات هنا فور اعتمادها من المعلم.
                                </p>
                            </div>
                        `;
                    }
                });

                displayBox.innerHTML = html;
                syncAccountWithFirebase();
                return;
            }
        } catch (err) {
            console.warn("خطأ في جلب بيانات النتيجة:", err);
        }
    }

    displayBox.innerHTML = `
        <div style="background: rgba(231, 76, 60, 0.1); border-right: 5px solid #e74c3c; padding: 20px; border-radius: 12px; text-align: right;">
            <p style="color:#e74c3c; font-weight:bold; margin:0 0 10px 0; font-size:1.1rem;">❌ لم يتم العثور على أي امتحان مُسلّم</p>
            <p style="color: #cbd5e1; font-size: 0.95rem; margin:0;">عفواً، لم تقم بأداء وتسليم أي امتحان بعد تحت هذا الاسم والكود.</p>
        </div>
    `;
}

// ==========================================
// 🔄 التنقل بين التبويبات الثلاثة
// ==========================================
function switchTab(tab) {
    if (window.isExamRunning) {
        showCustomToast("⚠️ عذراً! لا يمكنك التنقل بين الأقسام أثناء أداء الامتحان.", "warning");
        return;
    }

    const tabs = {
        'exams': { btn: document.getElementById('tab-btn-exams'), sec: document.getElementById('exams-section') },
        'results': { btn: document.getElementById('tab-btn-results'), sec: document.getElementById('results-section') },
        'account': { btn: document.getElementById('tab-btn-account'), sec: document.getElementById('account-section') }
    };

    const quizBox = document.getElementById('quiz-wrapper-box');
    if (quizBox) quizBox.style.display = 'none';

    for (let key in tabs) {
        if (tabs[key].sec) tabs[key].sec.style.display = 'none';
        if (tabs[key].btn) tabs[key].btn.classList.remove('active');
    }

    if (tabs[tab]) {
        if (tabs[tab].sec) tabs[tab].sec.style.display = 'block';
        if (tabs[tab].btn) tabs[tab].btn.classList.add('active');
    }

    if (tab === 'account') {
        updateProfileUI();
        syncAccountWithFirebase();
    }
}

async function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";

    if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
        const uniqueDocId = getUniqueDocId(studentCode || studentFullName, cleanSubjectKey);

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

    if (document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
    if (document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';
    if (document.getElementById('account-section')) document.getElementById('account-section').style.display = 'none';

    window.isExamRunning = true;

    const examData = typeof dynamicExamsDatabase !== 'undefined' ? dynamicExamsDatabase[currentActiveSubject] : null;
    const durationInMinutes = (examData && examData.duration) ? examData.duration : DEFAULT_EXAM_DURATION;
    
    const startTime = Date.now();
    const endTime = startTime + (durationInMinutes * 60 * 1000);

    const examSessionState = {
        subjectKey: currentActiveSubject,
        type: currentActiveType,
        questions: activeQuestionsList,
        startTime: startTime,
        endTime: endTime
    };
    localStorage.setItem('active_running_exam_session', JSON.stringify(examSessionState));
    
    const timerBanner = document.getElementById('timer-banner');
    if (timerBanner) timerBanner.style.display = 'flex';
    startTimer(endTime);

    renderQuestions();
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

        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const portalModal = document.getElementById('portal-modal');
        const quizWrapper = document.getElementById('quiz-wrapper-box');

        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'none';
        if (portalModal) portalModal.style.display = 'none';
        if (quizWrapper) quizWrapper.style.display = 'block';
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'none';

        if (document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
        if (document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';
        if (document.getElementById('account-section')) document.getElementById('account-section').style.display = 'none';

        window.isExamRunning = true;

        renderQuestions();

        const timerBanner = document.getElementById('timer-banner');
        if (timerBanner) timerBanner.style.display = 'flex';
        startTimer(sessionData.endTime);

        showCustomToast("🔄 تم استعادة جلسة الامتحان وإجاباتك بنجاح!", "success");

    } catch (e) {
        console.warn("خطأ في استعادة الجلسة الحالية:", e);
    }
}

// ==========================================
// 🎨 عرض الأسئلة
// ==========================================
function renderQuestions() {
    const container = document.getElementById('questions-container');
    if (!container) return;

    const examTitle = dynamicExamsDatabase[currentActiveSubject]?.examTitle || "الامتحان الحالي";
    
    let fullHtml = `<h3 style='text-align:right; margin-bottom:12px; font-weight:bold; font-size:1.3rem; color:#00d2ff;'>${escapeHtml(examTitle)}</h3><hr style='margin-bottom:20px; opacity:0.15;'>`;

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
                <img src="${escapeHtml(q.imageUrl)}" alt="صورة السؤال" style="max-width:100%; border-radius:8px;">
            </div>`;
        }

        html += `<h3>س${qIndex + 1}: ${escapeHtml(q.question)} <span style="color:#e74c3c;">*</span></h3>`;

        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);

        if (isChoice) {
            html += `<div class="options-group" style="display:flex; flex-direction:column; gap:10px;">`;
            q.options.forEach((opt) => {
                let isChecked = (savedAnswers[`q${qIndex}`] === opt) ? 'checked' : '';
                const escapedOpt = escapeHtml(opt);
                const jsEscapedOpt = opt.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                html += `
                    <label class="option-label">
                        <input type="radio" name="q${qIndex}" value="${escapedOpt}" ${isChecked} onchange="autoSaveAnswer('q${qIndex}', '${jsEscapedOpt}')">
                        <span style="font-size:0.95rem; color:#fff;">${escapedOpt}</span>
                    </label>
                `;
            });
            html += `</div>`;
        } else {
            let savedText = savedAnswers[`q${qIndex}`] || '';
            html += `<textarea name="q${qIndex}" oninput="autoSaveAnswer('q${qIndex}', this.value)" style="width:100%; height:110px; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.4); color:#fff; resize:vertical; outline:none;" placeholder="اكتب إجابتك التفصيلية هنا...">${escapeHtml(savedText)}</textarea>`;
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
// ⏱️ دالة التايمر
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
// 🔍 الفحص قبل التسليم
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
// 📤 تصحيح وتسليم الإجابات (تظهر "قيد التصحيح ⏳" لحين إظهارها من الأدمن)
// ==========================================
function calculateAndSend(bypassValidation = false) {
    let studentAnswersText = {};
    let answersForAdmin = [];
    let mcqScoreObtained = 0;
    let maxMcqScorePossible = 0;
    let totalExamPointsPossible = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let solvedQuestionsCount = 0;

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
                solvedQuestionsCount++;

                let correctText = (q.correctAnswer || "").toString().trim();
                if (typeof q.correctAnswerIndex === "number" && q.options && q.options[q.correctAnswerIndex] !== undefined) {
                    correctText = q.options[q.correctAnswerIndex].toString().trim();
                }

                if (studentValue.trim().toLowerCase() === correctText.toLowerCase()) {
                    mcqScoreObtained += points;
                    isCorrect = true;
                    correctCount++;
                    correctionStatus = ` [✅ صحيح]`;
                } else {
                    isCorrect = false;
                    wrongCount++;
                    correctionStatus = ` [❌ خطأ]`;
                }
            } else {
                studentValue = "لم يحل";
                isCorrect = false;
                wrongCount++;
                correctionStatus = ` [❌ لم يحل]`;
            }
        } else {
            let textarea = document.querySelector(`textarea[name="q${qIndex}"]`);
            if (textarea && textarea.value.trim() !== "") {
                studentValue = textarea.value.trim();
                solvedQuestionsCount++;
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
    let studentStage = localStorage.getItem('student_stage') || "الصف الثاني الإعدادي";

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

    const serialGenerated = Math.floor(10000 + Math.random() * 90000).toString();

    // 🔒 حفظ النتيجة محلياً كـ "قيد التصحيح ⏳" وحجب الإجابات لحين تفعيلها من الأدمن
    let history = getStoredHistory();
    history.unshift({
        id: `exam_${Date.now()}`,
        serial: serialGenerated,
        examName: currentExamTitle,
        totalQuestions: activeQuestionsList.length,
        percentage: '⏳ قيد التصحيح',
        score: 'قيد التصحيح ⏳',
        solvedQuestions: solvedQuestionsCount,
        canReview: false,
        startTime: currentFormattedTime,
        endTime: currentFormattedTime,
        answers: answersForAdmin
    });
    localStorage.setItem('alqeisar_exam_history', JSON.stringify(history));

    if (typeof db !== 'undefined') {
        const uniqueDocId = getUniqueDocId(studentCode || studentFullName, currentActiveSubject);

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
            correctCount: correctCount,
            wrongCount: wrongCount,
            serial: serialGenerated,
            answers: answersForAdmin,
            hasSubmitted: true,
            isSubmitted: true,
            showScore: false,      // تظل "قيد التصحيح" حتى تظهرها أنت من لوحة الأدمن
            showResult: false,
            isResultVisible: false,
            submittedAt: currentFormattedTime,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
            localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
            localStorage.removeItem('active_running_exam_session');

            showCustomToast("🎉 تم تسليم الامتحان بنجاح! نتيجتك قيد التصحيح.", "success");
            
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
    } else {
        localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
        localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
        localStorage.removeItem('active_running_exam_session');
        showCustomToast("🎉 تم تسليم الامتحان بنجاح! نتيجتك قيد التصحيح.", "success");
        setTimeout(() => { window.location.reload(); }, 2000);
    }
}

// ==========================================
// 👑 دالة إعادة الامتحان للطالب من لوحة الأدمن
// ==========================================
async function resetStudentExamByAdmin(studentFullName, subjectKey, studentCode = "") {
    if (typeof db === 'undefined' || (!studentFullName && !studentCode) || !subjectKey) {
        showCustomToast("❌ بيانات الطالب أو الامتحان غير مكتملة!", "error");
        return;
    }

    const uniqueDocId = getUniqueDocId(studentCode || studentFullName, subjectKey);

    try {
        await db.collection("students").doc(uniqueDocId).delete();

        localStorage.removeItem('finished_' + subjectKey);
        localStorage.removeItem('saved_exam_answers_' + subjectKey);
        localStorage.removeItem('active_running_exam_session');

        showCustomToast(`✅ تم إعادة فتح الامتحان بنجاح للطالب (${studentFullName})!`, "success");
        
        updateExamButtonsStatus();

    } catch (error) {
        console.error("خطأ في إعادة الامتحان للطالب:", error);
        showCustomToast("❌ حدث خطأ أثناء إعادة الامتحان للطالب.", "error");
    }
}

// ==========================================
// 🗑️ دالة مسح وحذف الامتحانات القديمة نهائياً (للأدمن)
// ==========================================
async function deleteOldExamsFromDB(daysOld = 30) {
    if (typeof db === 'undefined') return;
    try {
        const snapshot = await db.collection("exams").get();
        const now = Date.now();
        const cutoffTime = daysOld * 24 * 60 * 60 * 1000;
        let deletedCount = 0;

        snapshot.forEach(async (docSnapshot) => {
            const examData = docSnapshot.data();
            const createdAtMillis = examData.createdAt && examData.createdAt.toMillis ? examData.createdAt.toMillis() : null;
            
            if (examData.isOld === true || examData.status === 'archived' || (createdAtMillis && (now - createdAtMillis > cutoffTime))) {
                await db.collection("exams").doc(docSnapshot.id).delete();
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            showCustomToast(`🗑️ تم مسح ${deletedCount} امتحان قديم بنجاح!`, "success");
            loadAssignedExam();
        }
    } catch (e) {
        console.error("خطأ أثناء حذف الامتحانات القديمة:", e);
    }
}