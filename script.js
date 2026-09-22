// ==========================================
// ==========================================
// ==========================================
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
let currentQuestionIndex = 0; // متغير مؤشر السؤال المعروض حالياً

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

// هل فيه جلسة امتحان شغالة (أو لسه متسلمتش) للامتحان ده؟ لو آه: إجابات الطالب ممنوع تتمسح
function isExamSessionActive(subjectKey) {
    if (window.isExamRunning && currentActiveSubject === subjectKey) return true;
    try {
        const session = JSON.parse(localStorage.getItem('active_running_exam_session') || 'null');
        return !!(session && session.subjectKey === subjectKey);
    } catch (e) {
        return false;
    }
}

// حفظ لقطة من كل الإجابات الظاهرة في الصفحة (احتياط قبل الريفريش أو قفل الصفحة)
function saveAllAnswersFromDOM() {
    if (!window.isExamRunning || !currentActiveSubject || !activeQuestionsList || activeQuestionsList.length === 0) return;
    try {
        const storageKey = 'saved_exam_answers_' + currentActiveSubject;
        let saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        activeQuestionsList.forEach((q, i) => {
            const radio = document.querySelector(`input[name="q${i}"]:checked`);
            if (radio) {
                saved[`q${i}`] = radio.value;
                return;
            }
            const ta = document.querySelector(`textarea[name="q${i}"]`);
            if (ta && ta.value.trim() !== "") saved[`q${i}`] = ta.value;
        });
        localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch (e) {
        console.warn("خطأ في حفظ لقطة الإجابات:", e);
    }
}

// دالة تنظيف مخزن المتصفح من بقايا الامتحانات القديمة غير النشطة
function cleanStaleExamStorage(activeExamIds = []) {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('saved_exam_answers_') || key.startsWith('finished_'))) {
                const examId = key.replace('saved_exam_answers_', '').replace('finished_', '');
                if (activeExamIds.length > 0 && !activeExamIds.includes(examId) && !isExamSessionActive(examId)) {
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
// تنسيق الدرجات (0.5 / 1 / 2.25)
function fmtPts(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return "0";
    return String(Math.round(v * 100) / 100);
}

// صيغة الدرجة في الجدول: 8 -> "8.0" ، 4.5 -> "4.5"
// تنسيق المدة اللي استغرقها الطالب في حل الامتحان (مثلاً "12 دقيقة و 30 ثانية")
function formatDurationTaken(ms) {
    if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (m <= 0) return `${sec} ثانية`;
    if (sec === 0) return `${m} دقيقة`;
    return `${m} دقيقة و ${sec} ثانية`;
}

function fmtScoreText(n) {
    const v = Math.round((parseFloat(n) || 0) * 100) / 100;
    return Number.isInteger(v) ? `${v}.0` : String(v);
}

// تقييم إجابة واحدة: pending (مقالي لسه متصححش) / correct / partial / wrong
function getAnswerGrade(ans) {
    const points = parseFloat(ans.points) || 1;
    const isEssay = (ans.type === "essay");
    const hasEarned = (ans.earnedPoints !== undefined && ans.earnedPoints !== null && ans.earnedPoints !== "");

    if (hasEarned) {
        const e = Math.min(parseFloat(ans.earnedPoints) || 0, points);
        return { state: e >= points ? 'correct' : (e > 0 ? 'partial' : 'wrong'), earned: e, points: points };
    }
    if (ans.isCorrect === true) return { state: 'correct', earned: points, points: points };
    if (isEssay) return { state: 'pending', earned: null, points: points };
    return { state: 'wrong', earned: 0, points: points };
}

// عرض الأسئلة وإجابات الطالب. released=false: الإجابات ظاهرة بس من غير صح/غلط ولا درجات
function generateQuestionsReviewHtml(answers, released = true) {
    if (!answers || !Array.isArray(answers) || answers.length === 0) return '';

    let html = `
        <div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 18px;">
            <h5 style="color: #00d2ff; font-size: 1.1rem; font-weight: bold; margin-bottom: 16px; text-align: right; display: flex; align-items: center; gap: 8px;">
                ${released ? '📝 تفاصيل الأسئلة ونموذج الإجابة:' : '📝 إجاباتك اللي سلّمتها:'}
            </h5>
            ${released ? '' : `<p style="color:#f1c40f; font-size:0.85rem; margin: -6px 0 14px; text-align:right;">🔒 الصح والغلط والدرجات هتظهر بعد ما المعلم يعتمد النتيجة.</p>`}
    `;

    answers.forEach((item, index) => {
        const qText = item.question || `سؤال ${index + 1}`;
        const stAns = item.studentAnswer || "لم يحل";
        const qType = item.type || "choice";
        const isEssay = (qType === "essay");
        const crAns = isEssay ? (item.modelAnswer || "") : (item.correctAnswer || "");

        // قبل اعتماد النتيجة: عرض محايد من غير أي إشارة للصح والغلط
        if (!released) {
            html += `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-right: 4px solid #64748b; padding: 14px; margin-bottom: 14px; border-radius: 12px; text-align: right;">
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #fff; font-size: 0.98rem; line-height: 1.6;">س${index + 1}: ${escapeHtml(qText)}</strong>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; white-space: pre-wrap;">
                        <span style="color: #cbd5e1; font-size: 0.9rem;">إجابتك: <strong style="color: #fff;">${escapeHtml(stAns)}</strong></span>
                    </div>
                </div>
            `;
            return;
        }

        const g = getAnswerGrade(item);
        let boxBg, borderColor, icon, statusText;

        if (g.state === 'pending') {
            boxBg = "rgba(241, 196, 15, 0.06)";
            borderColor = "#f1c40f";
            icon = "✍️";
            statusText = "سؤال مقالي (قيد المراجعة)";
        } else if (g.state === 'correct') {
            boxBg = "rgba(46, 204, 113, 0.08)";
            borderColor = "#2ecc71";
            icon = "✅";
            statusText = "إجابة صحيحة";
        } else if (g.state === 'partial') {
            boxBg = "rgba(241, 196, 15, 0.08)";
            borderColor = "#f1c40f";
            icon = "🟡";
            statusText = "درجة جزئية";
        } else {
            boxBg = "rgba(231, 76, 60, 0.08)";
            borderColor = "#e74c3c";
            icon = "❌";
            statusText = "إجابة خاطئة";
        }

        const pointsBadge = (g.state === 'pending')
            ? ''
            : `<span style="font-size: 0.78rem; background: rgba(0,0,0,0.5); padding: 3px 9px; border-radius: 6px; color: ${borderColor}; font-weight: bold;">🎯 ${fmtPts(g.earned)} من ${fmtPts(g.points)}</span>`;

        const showCorrect = (isEssay ? !!crAns : (g.state !== 'correct' && !!crAns));

        html += `
            <div style="background: ${boxBg}; border: 1px solid rgba(255,255,255,0.06); border-right: 4px solid ${borderColor}; padding: 14px; margin-bottom: 14px; border-radius: 12px; text-align: right;">
                <div style="margin-bottom: 8px;">
                    <strong style="color: #fff; font-size: 0.98rem; line-height: 1.6;">
                        س${index + 1}: ${escapeHtml(qText)}
                    </strong>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <span style="color: #cbd5e1; font-size: 0.9rem; white-space: pre-wrap;">
                            إجابتك: <strong style="color: ${borderColor}; font-size: 0.95rem;">${escapeHtml(stAns)}</strong>
                        </span>
                        <span style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${pointsBadge}
                            <span style="font-size: 0.78rem; background: rgba(0,0,0,0.5); padding: 3px 9px; border-radius: 6px; color: ${borderColor}; font-weight: bold;">
                                ${icon} ${statusText}
                            </span>
                        </span>
                    </div>

                    ${showCorrect ? `
                        <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px; margin-top: 4px; white-space: pre-wrap;">
                            <span style="color: #cbd5e1; font-size: 0.9rem;">
                                ${isEssay ? 'الإجابة النموذجية' : 'الإجابة الصحيحة'}: <strong style="color: #00d2ff; text-shadow: 0 0 5px rgba(0,210,255,0.3);">${escapeHtml(crAns)}</strong>
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
// معرّف صاحب السجل (كود الطالب الحالي) عشان نتايج طالب متظهرش عند طالب تاني على نفس المتصفح
function getHistoryOwner() {
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").toString().trim().toLowerCase();
    if (code) return code;
    return normalizeArabicText(localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "");
}

// كل السجلات المحفوظة في المتصفح (لكل الطلاب اللي استخدموه) بعد تنظيف السجلات الوهمية
function getAllStoredHistory() {
    try {
        let history = JSON.parse(localStorage.getItem('alqeisar_exam_history') || '[]');
        history = history.filter(item => {
            if (!item || !item.examName) return false;
            if (!item.owner) return false; // سجل قديم مش معروف صاحبه
            const s = String(item.serial || '');
            if (['11028', '83978', '84457'].includes(s)) return false;
            if (item.id && item.id.startsWith('init_')) return false;
            if (item.solvedQuestions === 0 && item.score && item.score.includes('0.0') && (!item.answers || item.answers.length === 0)) return false;
            return true;
        });
        localStorage.setItem('alqeisar_exam_history', JSON.stringify(history));
        return history;
    } catch (e) {
        return [];
    }
}

// سجلات الطالب الحالي فقط
function getStoredHistory() {
    const owner = getHistoryOwner();
    if (!owner) return [];
    return getAllStoredHistory().filter(item => item.owner === owner);
}

// حفظ سجلات الطالب الحالي مع الإبقاء على سجلات باقي الطلاب زي ما هي
function saveStoredHistory(currentList) {
    const owner = getHistoryOwner();
    if (!owner) return;
    const others = getAllStoredHistory().filter(item => item.owner !== owner);
    const mine = (currentList || []).map(r => ({ ...r, owner: owner }));
    localStorage.setItem('alqeisar_exam_history', JSON.stringify(others.concat(mine)));
}

// ==========================================
// 🗄️ حفظ دائم لنتائج الطالب (لا يتأثر بالمسح من لوحة الأدمن)
// ==========================================
// مفتاح فريد لكل محاولة (الرقم التسلسلي أو معرف المستند)
function getHistoryRecordKey(r) {
    return String((r && (r.key || r.serial || r.id)) || '');
}

function getHistoryRecordTime(r) {
    if (!r) return 0;
    if (r.timestampMs) return Number(r.timestampMs) || 0;
    const id = String(r.id || '');
    if (id.startsWith('exam_')) return Number(id.slice(5)) || 0;
    return 0;
}

// دمج (المحفوظ محلياً + الأرشيف + النتائج الحية من السيرفر) بدون فقدان أي امتحان اتحذف من الأدمن
function mergeHistoryRecords(localList, archiveList, liveList) {
    const map = new Map();

    (localList || []).forEach(r => {
        if (r && r.examName) map.set(getHistoryRecordKey(r), r);
    });

    (archiveList || []).forEach(r => {
        if (!r || !r.examName) return;
        const k = getHistoryRecordKey(r);
        const ex = map.get(k);
        if (!ex || (r.canReview && !ex.canReview)) map.set(k, r);
    });

    (liveList || []).forEach(r => {
        if (!r || !r.examName) return;
        const k = getHistoryRecordKey(r);
        const ex = map.get(k);
        if (ex && !r.timestampMs && getHistoryRecordTime(ex)) r.timestampMs = getHistoryRecordTime(ex);
        map.set(k, r);
    });

    return Array.from(map.values()).sort((a, b) => getHistoryRecordTime(b) - getHistoryRecordTime(a));
}

// حفظ نسخة من نتيجة الطالب في مجموعة منفصلة (results_archive) لا يمسحها الأدمن
async function archiveHistoryRecord(record) {
    if (typeof db === 'undefined' || !record) return;
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    const name = (localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "").trim();
    if (!code && !name) return;

    try {
        const clean = JSON.parse(JSON.stringify(record));
        clean.key = getHistoryRecordKey(record);
        clean.studentCode = code;
        clean.studentName = name;
        clean.archivedAtMs = Date.now();
        await db.collection("results_archive")
            .doc(getUniqueDocId(code || name, clean.key))
            .set(clean, { merge: true });
    } catch (e) {
        console.warn("تعذر حفظ نسخة الأرشيف (غير مؤثر على النتائج المحلية):", e);
    }
}

async function fetchArchivedHistory(studentCode) {
    if (typeof db === 'undefined' || !studentCode) return [];
    try {
        const snap = await db.collection("results_archive").where("studentCode", "==", studentCode).get();
        const list = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d && d.examName) {
                const rec = { ...d };
                delete rec.studentCode;
                delete rec.studentName;
                delete rec.archivedAtMs;
                list.push(rec);
            }
        });
        return list;
    } catch (e) {
        console.warn("تعذر قراءة أرشيف النتائج:", e);
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
        let liveRecords = [];
        let archiveRecords = [];

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

            // احتياطي بالاسم: اسم مطابق تماماً، وبشرط ألا يكون المستند مسجّلاً بكود طالب آخر
            if (realSubmissions.length === 0 && studentName) {
                const allSnap = await db.collection("students").get();
                allSnap.forEach(doc => {
                    const data = doc.data();
                    const sName = normalizeArabicText(data.studentName || data.name || "");
                    const docCode = (data.studentCode || data.code || "").toString().trim();
                    const codeOk = !docCode || !studentCode || docCode.toLowerCase() === studentCode.toLowerCase();
                    if (sName && sName === studentName && codeOk) {
                        if (data.hasSubmitted === true || data.isSubmitted === true || (data.answers && data.answers.length > 0)) {
                            realSubmissions.push({ id: doc.id, ...data });
                        }
                    }
                });
            }

            liveRecords = realSubmissions.map((docData, idx) => {
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
                    key: docData.serial ? String(docData.serial) : String(docData.id),
                    serial: (docData.serial || (20000 + idx)).toString(),
                    examName: docData.examName || docData.examTitle || docData.title || "اختبار أونلاين",
                    totalQuestions: totalQuestions,
                    percentage: isApproved ? `% ${percentage}` : '⏳ قيد التصحيح',
                    score: isApproved ? `${fmtScoreText(score)} من ${fmtPts(maxScore)}` : 'قيد التصحيح ⏳',
                    scoreNum: Number(score) || 0,
                    maxScoreNum: Number(maxScore) || 10,
                    solvedQuestions: solvedCount,
                    canReview: isApproved,
                    startTime: docData.startTimeFormatted || docData.submittedAt || 'غير محدد',
                    endTime: docData.submittedAt || 'تم التسليم',
                    durationTaken: docData.durationTaken || '',
                    examId: docData.examCode || docData.id || '',
                    timestampMs: (docData.timestamp && typeof docData.timestamp.toMillis === 'function') ? docData.timestamp.toMillis() : 0,
                    answers: docData.answers || []
                };
            });
        } catch (e) {
            console.warn("خطأ في المزامنة مع السيرفر:", e);
        }

        try {
            archiveRecords = await fetchArchivedHistory(studentCode);
        } catch (e) {
            archiveRecords = [];
        }

        // دمج بدل الاستبدال: أي امتحان اتسلّم قبل كده يفضل موجود حتى لو اتمسح من لوحة الأدمن
        const mergedHistory = mergeHistoryRecords(getStoredHistory(), archiveRecords, liveRecords);
        if (mergedHistory.length > 0) {
            saveStoredHistory(mergedHistory);
        }

        // تحديث نسخة الأرشيف لو النتيجة اتغيرت (مثلاً الأدمن اعتمد الدرجة)
        const archiveMap = new Map(archiveRecords.map(r => [getHistoryRecordKey(r), r]));
        liveRecords.forEach(r => {
            const a = archiveMap.get(getHistoryRecordKey(r));
            if (!a || a.score !== r.score || a.percentage !== r.percentage || a.canReview !== r.canReview ||
                JSON.stringify(a.answers || []) !== JSON.stringify(r.answers || [])) {
                archiveHistoryRecord(r);
            }
        });
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
                <td colspan="10" style="text-align: center; padding: 35px 15px; color: var(--text-sub);">
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
                ${isUnderReview ? '⏳' : '🏆'} ${row.score}
            </td>
            <td>${row.solvedQuestions}</td>
            <td>
                ${(row.answers && row.answers.length > 0)
                    ? `<button class="tag-answers-btn" onclick="openAnswersReviewModal('${row.id || row.serial}')">عرض الاجابات</button>` 
                    : `<span class="tag-answers-disabled" style="color: #ff0055; font-weight: 700; font-size: 0.82rem;">--الاجابات غير متاحة--</span>`}
            </td>
            <td style="font-size: 0.8rem; color: #94a3b8;">${row.startTime || 'غير محدد'}</td>
            <td style="font-size: 0.8rem; color: #94a3b8;">${row.endTime || 'غير محدد'}</td>
            <td style="font-size: 0.8rem; color: var(--accent-cyan); font-weight: 700;">${row.durationTaken || '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function openAnswersReviewModal(recordId) {
    const history = getStoredHistory();
    const item = history.find(h => (h.id === recordId || h.serial === recordId));
    
    if (!item || !item.answers || item.answers.length === 0) {
        showCustomToast("🔒 الإجابات غير متاحة لهذا الامتحان.", "warning");
        return;
    }

    const released = item.canReview === true;

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

    const scoreBanner = released
        ? `<div style="text-align:center; margin-bottom: 14px; padding: 12px; background: rgba(0,242,254,0.07); border: 1px solid rgba(0,242,254,0.25); border-radius: 12px; color:#fff; font-weight:800;">🏆 درجتك: <span style="color:#2ecc71;">${escapeHtml(item.score)}</span></div>`
        : `<div style="text-align:center; margin-bottom: 14px; padding: 12px; background: rgba(241,196,15,0.08); border: 1px solid rgba(241,196,15,0.3); border-radius: 12px; color:#f1c40f; font-weight:800;">⏳ النتيجة قيد التصحيح</div>`;

    reviewModal.innerHTML = `
        <div style="background: #0f1422; border: 1px solid rgba(0,242,254,0.3); border-radius: 20px; max-width: 650px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 16px 20px; background: #141c2c; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                <h4 style="color: #00f2fe; margin: 0; font-size: 1.1rem; font-weight: 800;">📖 مراجعة إجابات: ${escapeHtml(item.examName)}</h4>
                <button onclick="document.getElementById('answers-review-modal').style.display='none'" style="background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer;">✕</button>
            </div>
            <div style="padding: 18px; overflow-y: auto; flex: 1;">
                ${scoreBanner}
                ${generateQuestionsReviewHtml(item.answers, released)}
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
// false = صف الامتحان مش شرط (الوحدة هي اللي بتحدد مين يشوف الامتحان). خليها true لو عايز ترجّع الشرط القديم.
const ENFORCE_EXAM_GRADE = false;
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
        // الامتحانات بقت بتتفتح من جوه الوحدات، والوحدة نفسها هي اللي بتحدد الصف. فمبنمنعش الامتحان بسبب صفه.
        if (ENFORCE_EXAM_GRADE && exam.grade && exam.grade !== "عام" && exam.grade !== "الكل" && studentStage && studentStage !== "غير محدد") {
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
    updateStudentLastActive();
    window.__examsReady = loadAssignedExam();
    checkAndResumeRunningExam();

    // التبويب الافتراضي: المحتوى التعليمي (أو حسابي لو الطالب لسه مسلّم امتحان وضغط "روح لحسابي")
    try {
        let nextTab = sessionStorage.getItem('open_tab_after_reload') || 'units';
        sessionStorage.removeItem('open_tab_after_reload');
        if (!window.isExamRunning) switchTab(nextTab);
    } catch (e) {}
};

// 🕒 تسجيل آخر نشاط للطالب (بيظهر للأدمن) - مرة كل 5 دقايق بالكتير عشان ميستهلكش عمليات كتابة
async function updateStudentLastActive() {
    try {
        if (typeof db === 'undefined') return;
        const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
        if (!code) return;

        const pingKey = 'last_active_ping_' + code.toLowerCase();
        if (Date.now() - Number(localStorage.getItem(pingKey) || 0) < 5 * 60 * 1000) return;

        const [byStudentCode, byCode] = await Promise.all([
            db.collection("students").where("studentCode", "==", code).get(),
            db.collection("students").where("code", "==", code).get()
        ]);

        const refs = new Map();
        [byStudentCode, byCode].forEach(snap => snap.forEach(d => refs.set(d.id, d.ref)));
        if (refs.size === 0) return;

        const stamp = firebase.firestore.FieldValue.serverTimestamp();
        await Promise.all(Array.from(refs.values()).map(ref => ref.update({ lastActive: stamp }).catch(() => {})));
        localStorage.setItem(pingKey, String(Date.now()));
    } catch (e) {
        console.warn("تعذر تسجيل آخر نشاط:", e);
    }
}

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
    // حفظ الإجابات فوراً قبل أي ريفريش أو قفل أو خروج من الصفحة
    window.addEventListener('pagehide', saveAllAnswersFromDOM);

    // حفظ تلقائي احتياطي لأي اختيار/كتابة (شغال حتى لو نص الاختيار فيه علامات تنصيص)
    document.addEventListener('change', function (e) {
        const t = e.target;
        if (window.isExamRunning && t && t.type === 'radio' && /^q\d+$/.test(t.name) && t.closest('.single-question-card')) {
            autoSaveAnswer(t.name, t.value);
        }
    });
    document.addEventListener('input', function (e) {
        const t = e.target;
        if (window.isExamRunning && t && t.tagName === 'TEXTAREA' && /^q\d+$/.test(t.name) && t.closest('.single-question-card')) {
            autoSaveAnswer(t.name, t.value);
        }
    });

    window.addEventListener('beforeunload', function (e) {
        saveAllAnswersFromDOM();
        if (window.isExamRunning) {
            const confirmationMessage = '⚠️ تنبيه: إغلاق الصفحة أو إعادة تحميلها قد يؤدي إلى فقدان إجاباتك ورصد الاختبار!';
            (e || window.event).returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });

    document.addEventListener("visibilitychange", function() {
        if (window.isExamRunning && document.hidden) {
            saveAllAnswersFromDOM();
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
            window.__allExamsRaw = [];
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'>📭 لا يوجد امتحان منشور حالياً.</p>";
            return;
        }

        let allExams = [];
        snapshot.forEach(doc => allExams.push({ id: doc.id, ...doc.data() }));
        window.__allExamsRaw = allExams;

        const now = Date.now();

        const accessibleExams = allExams.filter(exam => {
            if (exam.isActive === false || exam.status === 'archived' || exam.status === 'expired' || exam.isOld === true) {
                return false;
            }

            // المسودات مخفية عن الطلاب
            if (exam.isPublished === false || exam.status === 'draft') return false;

            // لسه ماوصلش موعد فتح الامتحان
            if (exam.scheduledAt) {
                const openTime = new Date(exam.scheduledAt).getTime();
                if (!isNaN(openTime) && now < openTime) return false;
            }

            // موعد غلق الامتحان عدّى (والأدمن بيمسحه تلقائياً)
            if (exam.closesAt) {
                const closeTime = new Date(exam.closesAt).getTime();
                if (!isNaN(closeTime) && now >= closeTime) return false;
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
                    modelAnswer: q.modelAnswer || "",
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
                            // مهم: متمسحش إجابات الطالب لو الامتحان شغال دلوقتي (ريفريش بالغلط)
                            if (!isExamSessionActive(subjectKey)) {
                                localStorage.removeItem('finished_' + subjectKey);
                                localStorage.removeItem('saved_exam_answers_' + subjectKey);
                            }
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
// 🔍 الاستعلام عن النتائج في كشف النتائج
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
                                    <span style="color:${scoreColor}; font-weight:bold; font-size:1.6rem;">${fmtPts(score)}</span> 
                                    <span style="color:#fff; font-size:1.2rem;"> / ${fmtPts(maxScore)}</span>
                                    <div style="margin-top: 10px; font-size: 1.25rem; color: ${scoreColor}; font-weight: bold;">النسبة المئوية: %${percentage}</div>
                                </div>

                                <!-- 📝 إظهار الأسئلة وإجابة الطالب والنموذج الصحيح -->
                                ${generateQuestionsReviewHtml(docData.answers, true)}
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
                                    📩 تم حفظ إجاباتك بنجاح، وستظهر الدرجة والصح والغلط هنا فور اعتمادها من المعلم.
                                </p>
                                ${generateQuestionsReviewHtml(docData.answers, false)}
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
        'units': { btn: document.getElementById('tab-btn-units'), sec: document.getElementById('units-section') },
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

    if (tab === 'units') {
        renderUnitsSection();
    }
}

async function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";

    if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
        const uniqueDocId = getUniqueDocId(studentCode || studentFullName, cleanSubjectKey);

        // 🔒 قفل إعادة الامتحان: بيتسجل مرة واحدة عند التسليم ومبيتشالش إلا لو المعلم ضغط "إعادة الامتحان" من لوحة الأدمن.
        // فحتى لو المعلم مسح إجابات الطالب من قايمة الطلاب، الامتحان يفضل مقفول له.
        try {
            const lockSnap = await db.collection("exam_locks").doc(uniqueDocId).get();
            if (lockSnap.exists) {
                localStorage.setItem('finished_' + cleanSubjectKey, (dynamicExamsDatabase[cleanSubjectKey]?.version || 1).toString());
                showCustomToast("⚠️ عذراً، لقد قمت بأداء هذا الاختبار مسبقاً!", "error");
                updateExamButtonsStatus();
                renderUnitsSection();
                return;
            }
        } catch (e) {
            console.warn("تعذر فحص قفل الامتحان:", e);
        }

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
    if (document.getElementById('units-section')) document.getElementById('units-section').style.display = 'none';

    window.isExamRunning = true;
    document.body.classList.add('exam-mode');
    currentQuestionIndex = 0; // بدء الامتحان دائماً من السؤال الأول

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
        if (document.getElementById('units-section')) document.getElementById('units-section').style.display = 'none';

        window.isExamRunning = true;
        document.body.classList.add('exam-mode');
        currentQuestionIndex = 0;

        renderQuestions();
        startTimer(sessionData.endTime);

        showCustomToast("🔄 تم استعادة جلسة الامتحان وإجاباتك بنجاح!", "success");

    } catch (e) {
        console.warn("خطأ في استعادة الجلسة الحالية:", e);
    }
}

// ==========================================
// 🎨 عرض الأسئلة وشريط الأرقام والتنقل الفردي
// ==========================================
function renderQuestions() {
    const container = document.getElementById('questions-container');
    const navBar = document.getElementById('questions-nav-bar');
    const footerNav = document.getElementById('exam-footer-nav');
    if (!container) return;

    if (!activeQuestionsList || activeQuestionsList.length === 0) {
        container.innerHTML = "<p style='color:#e74c3c; text-align:center;'>لا توجد أسئلة متوفرة حالياً.</p>";
        return;
    }

    let savedAnswers = {};
    try {
        savedAnswers = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch(e) {
        savedAnswers = {};
    }

    // 1. توليد كروت الأسئلة داخل الحاوية
    let fullHtml = '';
    activeQuestionsList.forEach((q, qIndex) => {
        let isActive = (qIndex === currentQuestionIndex);
        let html = `<div id="block-q${qIndex}" class="single-question-card ${isActive ? 'active-question' : ''}">`;

        const isChoiceHead = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);
        html += `
        <div class="q-card-head">
            <span class="q-card-tag">📝 السؤال ${qIndex + 1} من ${activeQuestionsList.length}</span>
            <span class="q-card-type">${isChoiceHead ? 'اختر الإجابة الصحيحة' : 'اكتب إجابتك'}</span>
        </div>`;

        if (q.imageUrl && q.imageUrl.trim() !== "") {
            html += `
            <div class="question-image-wrapper">
                <img src="${escapeHtml(q.imageUrl)}" alt="صورة السؤال">
            </div>`;
        }

        html += `<h3>${escapeHtml(q.question)} <span style="color:#e74c3c;">*</span></h3>`;

        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);

        if (isChoice) {
            html += `<div class="options-group" style="display:flex; flex-direction:column; gap:10px;">`;
            q.options.forEach((opt) => {
                let isChecked = (savedAnswers[`q${qIndex}`] === opt) ? 'checked' : '';
                let selectedClass = isChecked ? 'selected-option' : '';
                const escapedOpt = escapeHtml(opt);
                const jsEscapedOpt = escapeHtml(opt.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " "));
                html += `
                    <label class="option-label ${selectedClass}">
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
        html += `</div>`;
        fullHtml += html;
    });

    container.innerHTML = fullHtml;

    // 2. توليد شريط أرقام الأسئلة (1، 2، 3 ...)
    if (navBar) {
        navBar.innerHTML = activeQuestionsList.map((_, idx) => `
            <button type="button" id="q-nav-btn-${idx}" class="q-nav-btn ${idx === currentQuestionIndex ? 'active' : ''}" onclick="showQuestion(${idx})">
                ${idx + 1}
            </button>
        `).join('');
    }

    if (footerNav) footerNav.style.display = 'flex';

    // ظبط المساحة تحت الهيدر الثابت
    setupExamBarSpacing();

    // 3. إظهار السؤال الحالي وتحديث العدادات
    showQuestion(currentQuestionIndex);
    updateExamProgressCounters();
}

// الهيدر بتاع الامتحان ثابت (fixed) فبنحسب ارتفاعه ونسيب مساحة بنفس الارتفاع تحته عشان ميغطيش على السؤال
let examBarObserver = null;
function setupExamBarSpacing() {
    const bar = document.querySelector('.exam-top-bar');
    if (!bar) return;

    const apply = () => {
        document.documentElement.style.setProperty('--exam-bar-h', bar.offsetHeight + 'px');
    };
    apply();

    if (!examBarObserver) {
        if (typeof ResizeObserver !== 'undefined') {
            examBarObserver = new ResizeObserver(apply);
            examBarObserver.observe(bar);
        } else {
            examBarObserver = true;
        }
        window.addEventListener('resize', apply);
    }
}

// دالة الانتقال لسؤال محدد برقم المؤشر
function showQuestion(index) {
    if (index < 0 || index >= activeQuestionsList.length) return;
    currentQuestionIndex = index;

    // إخفاء كل الأسئلة وإظهار السؤال المحدد فقط
    activeQuestionsList.forEach((_, idx) => {
        const card = document.getElementById(`block-q${idx}`);
        const navBtn = document.getElementById(`q-nav-btn-${idx}`);
        if (card) {
            if (idx === index) {
                card.classList.add('active-question');
            } else {
                card.classList.remove('active-question');
            }
        }
        if (navBtn) {
            if (idx === index) {
                navBtn.classList.add('active');
                // خلّي الرقم الحالي ظاهر في الشريط (مهم لو الأسئلة كتيرة على الموبايل)
                try { navBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (e) {}
            } else {
                navBtn.classList.remove('active');
            }
        }
    });

    // رجّع الصفحة لأول السؤال الجديد فوراً من غير حركة (الهيدر ثابت فوق)
    if (window.isExamRunning) {
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    }

    // تحديث أزرار التنقل السريع (السابق / التالي)
    const prevBtn = document.getElementById('prev-q-btn');
    const nextBtn = document.getElementById('next-q-btn');
    const indicator = document.getElementById('current-q-indicator');

    if (prevBtn) prevBtn.disabled = (currentQuestionIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentQuestionIndex === activeQuestionsList.length - 1);
    if (indicator) indicator.textContent = `السؤال (${currentQuestionIndex + 1}) من (${activeQuestionsList.length})`;
}

// دالة التنقل بخطوة (1 للتالي و -1 للسابق)
function navigateQuestion(step) {
    showQuestion(currentQuestionIndex + step);
}

// دالة تحديث عدادات الأسئلة المحلولة والمتبقية وتلوين الأرقام
function updateExamProgressCounters() {
    let savedAnswers = {};
    try {
        savedAnswers = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch(e) {
        savedAnswers = {};
    }

    let solvedCount = 0;
    activeQuestionsList.forEach((_, idx) => {
        const val = savedAnswers[`q${idx}`];
        const isSolved = (val !== undefined && val !== null && String(val).trim() !== "");
        if (isSolved) solvedCount++;

        const navBtn = document.getElementById(`q-nav-btn-${idx}`);
        if (navBtn) {
            if (isSolved) {
                navBtn.classList.add('answered');
            } else {
                navBtn.classList.remove('answered');
            }
        }
    });

    const total = activeQuestionsList.length;
    const remainingCount = Math.max(0, total - solvedCount);

    const solvedBadge = document.getElementById('solved-count-badge');
    const remainingBadge = document.getElementById('remaining-count-badge');

    if (solvedBadge) solvedBadge.textContent = solvedCount;
    if (remainingBadge) remainingBadge.textContent = remainingCount;

    // شريط التقدم
    const progressFill = document.getElementById('exam-progress-fill');
    if (progressFill) progressFill.style.width = (total > 0 ? Math.round((solvedCount / total) * 100) : 0) + '%';

    // رسالة تشجيع حسب تقدم الطالب
    const motivation = document.getElementById('exam-motivation');
    if (motivation) {
        let msg;
        if (total > 0 && solvedCount >= total) {
            msg = "ممتاز! جاوبت على كل الأسئلة ✅ راجع إجاباتك قبل التسليم";
        } else if (solvedCount === 0) {
            msg = "ابدأ بهدوء وتركيز… إنت مذاكر وقادر تحلها 💪";
        } else if (solvedCount < total / 2) {
            msg = "ماشي كويس! خد نفس وكمّل سؤال ورا التاني ✨";
        } else {
            msg = "قربت تخلّص! فاضل القليل، كمّل بنفس التركيز 🔥";
        }
        if (motivation.textContent !== msg) motivation.textContent = msg;
    }
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

    // تحديث العدادات وشريط أرقام الأسئلة مباشرة فور اختيار الإجابة
    updateExamProgressCounters();
}

// ==========================================
// ⏱️ دالة التايمر المربع في المنتصف
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
            display.textContent = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        }

        // تلوين التايمر: أصفر آخر 5 دقايق - أحمر آخر دقيقة
        const timerBox = document.querySelector('.exam-square-timer-box');
        if (timerBox) {
            timerBox.classList.toggle('danger', totalSecondsLeft <= 60);
            timerBox.classList.toggle('warn', totalSecondsLeft > 60 && totalSecondsLeft <= 300);
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
        // الانتقال تلقائياً لأول سؤال غير محلول
        showQuestion(unansweredIndices[0] - 1);

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
    // لو الصفحة اتفتحت بعد انتهاء الوقت مفيش عناصر معروضة، فبنقرأ الإجابات المحفوظة من المتصفح
    let savedAnswersForSubmit = {};
    try {
        savedAnswersForSubmit = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch (e) {
        savedAnswersForSubmit = {};
    }

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
            let chosenValue = selected ? selected.value : (savedAnswersForSubmit[`q${qIndex}`] || "");
            if (chosenValue) {
                studentValue = chosenValue;
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
            let essayValue = textarea ? textarea.value.trim() : String(savedAnswersForSubmit[`q${qIndex}`] || "").trim();
            if (essayValue !== "") {
                studentValue = essayValue;
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
            modelAnswer: isChoice ? "" : (q.modelAnswer || ""),
            isCorrect: isCorrect,
            type: isChoice ? "choice" : "essay",
            points: points
        });
    });

    // لو الامتحان كله اختيارات: الدرجة بتظهر للطالب علطول. لو فيه مقالي: قيد التصحيح لحد ما المعلم يعتمد
    const hasEssay = answersForAdmin.some(a => a.type === "essay");
    const releaseNow = !hasEssay;
    const finalPercent = totalExamPointsPossible > 0 ? Math.round((mcqScoreObtained / totalExamPointsPossible) * 100) : 0;

    clearInterval(timerInterval);
    window.isExamRunning = false;

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

    // 🕒 وقت البدء الحقيقي (محفوظ لحظة ما الطالب بدأ الامتحان فعلياً) عشان نحسب منه المدة اللي استغرقها
    let realStartMs = null;
    try {
        const runningSession = JSON.parse(localStorage.getItem('active_running_exam_session') || 'null');
        if (runningSession && runningSession.startTime) realStartMs = runningSession.startTime;
    } catch (e) {}
    const realEndMs = Date.now();
    const durationTaken = realStartMs ? formatDurationTaken(realEndMs - realStartMs) : '';
    const timeFormatOpts = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
    const realStartFormatted = realStartMs ? new Date(realStartMs).toLocaleString('ar-EG', timeFormatOpts) : currentFormattedTime;
    const realEndFormatted = new Date(realEndMs).toLocaleString('ar-EG', timeFormatOpts);

    const serialGenerated = Math.floor(10000 + Math.random() * 90000).toString();

    // 🔒 حفظ النتيجة محلياً كـ "قيد التصحيح ⏳" وحجب الإجابات لحين تفعيلها من الأدمن
    let history = getStoredHistory();
    const newHistoryRecord = {
        id: `exam_${Date.now()}`,
        key: serialGenerated,
        serial: serialGenerated,
        examName: currentExamTitle,
        totalQuestions: activeQuestionsList.length,
        percentage: releaseNow ? `% ${finalPercent}` : '⏳ قيد التصحيح',
        score: releaseNow ? `${fmtScoreText(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}` : 'قيد التصحيح ⏳',
        scoreNum: mcqScoreObtained,
        maxScoreNum: totalExamPointsPossible || 10,
        solvedQuestions: solvedQuestionsCount,
        canReview: releaseNow,
        startTime: realStartFormatted,
        endTime: realEndFormatted,
        durationTaken: durationTaken,
        examId: currentActiveSubject,
        timestampMs: Date.now(),
        answers: answersForAdmin
    };
    history.unshift(newHistoryRecord);
    saveStoredHistory(history);

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
            startTimeFormatted: realStartFormatted,
            durationTaken: durationTaken,
            hasSubmitted: true,
            isSubmitted: true,
            hasEssay: hasEssay,
            showScore: releaseNow,      // اختيارات فقط: الدرجة تظهر علطول | فيه مقالي: قيد التصحيح لحد اعتماد المعلم
            showResult: releaseNow,
            isResultVisible: releaseNow,
            submittedAt: currentFormattedTime,
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
            localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
            localStorage.removeItem('active_running_exam_session');

            // نسخة دائمة من النتيجة لا يمسحها الأدمن
            archiveHistoryRecord(newHistoryRecord);

            showSubmissionResultModal({
                examTitle: currentExamTitle,
                released: releaseNow,
                scoreText: `${fmtPts(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}`,
                percent: finalPercent
            });

        }).catch((error) => {
            console.error("خطأ أثناء تسليم الامتحان: ", error);
            showCustomToast("❌ حدث خطأ أثناء تسليم إجاباتك، يرجى المحاولة مرة أخرى.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "تسليم الامتحان 📤";
            }
        });
    } else {
        localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
        localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
        localStorage.removeItem('active_running_exam_session');
        showSubmissionResultModal({
            examTitle: currentExamTitle,
            released: releaseNow,
            scoreText: `${fmtPts(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}`,
            percent: finalPercent
        });
    }
}

// 🏆 نافذة النتيجة بعد التسليم: الدرجة علطول لو اختيارات، أو "قيد التصحيح" لو فيه مقالي
function showSubmissionResultModal(info) {
    const old = document.getElementById('submission-result-modal');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'submission-result-modal';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 100000; padding: 15px; direction: rtl; font-family: 'Cairo', sans-serif;
    `;

    const pct = info.percent || 0;
    const color = pct >= 85 ? '#2ecc71' : (pct >= 50 ? '#f1c40f' : '#e74c3c');
    const cheer = pct >= 85 ? 'ممتاز! استمر 🔥' : (pct >= 50 ? 'كويس! تقدر تبقى أحسن 💪' : 'متزعلش، راجع إجاباتك وهتتحسن ✨');

    const body = info.released
        ? `
            <div style="font-size: 3rem; margin-bottom: 6px;">🎉</div>
            <h3 style="color:#fff; margin: 0 0 4px; font-size: 1.3rem;">تم تسليم الامتحان بنجاح</h3>
            <p style="color:#94a3b8; margin: 0 0 18px; font-size: 0.92rem;">${escapeHtml(info.examTitle)}</p>
            <div style="background: rgba(0,0,0,0.35); border: 1px solid ${color}; border-radius: 16px; padding: 16px; margin-bottom: 14px;">
                <div style="color:#cbd5e1; font-size: 0.95rem;">درجتك</div>
                <div style="color:${color}; font-size: 2rem; font-weight: 900;">${escapeHtml(info.scoreText)}</div>
                <div style="color:${color}; font-weight: 800;">%${pct}</div>
            </div>
            <p style="color:#cbd5e1; margin: 0 0 6px; font-weight: 700;">${cheer}</p>
            <p style="color:#94a3b8; margin: 0 0 18px; font-size: 0.85rem;">تقدر تشوف درجتك وإجاباتك في أي وقت من <strong>حسابي</strong>.</p>`
        : `
            <div style="font-size: 3rem; margin-bottom: 6px;">✅</div>
            <h3 style="color:#fff; margin: 0 0 4px; font-size: 1.3rem;">تم تسليم الامتحان بنجاح</h3>
            <p style="color:#94a3b8; margin: 0 0 18px; font-size: 0.92rem;">${escapeHtml(info.examTitle)}</p>
            <div style="background: rgba(241,196,15,0.08); border: 1px solid rgba(241,196,15,0.4); border-radius: 16px; padding: 16px; margin-bottom: 14px;">
                <div style="color:#f1c40f; font-size: 1.4rem; font-weight: 900;">⏳ قيد التصحيح</div>
                <p style="color:#cbd5e1; margin: 8px 0 0; font-size: 0.88rem; line-height: 1.8;">الامتحان فيه أسئلة مقالية والمعلم هيراجعها. إجاباتك محفوظة وتقدر تشوفها من <strong>حسابي</strong> (من غير ما يبان الصح والغلط لحد ما النتيجة تتعتمد).</p>
            </div>`;

    overlay.innerHTML = `
        <div style="background: #1e1e38; padding: 26px; border-radius: 20px; max-width: 420px; width: 95%; text-align: center; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
            ${body}
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button onclick="closeSubmissionResultModal('account')" style="padding: 11px 20px; background: linear-gradient(135deg,#0088ff,#9d4edd); color:#fff; border:none; border-radius:12px; font-weight:800; cursor:pointer; font-family:inherit;">📊 روح لحسابي</button>
                <button onclick="closeSubmissionResultModal()" style="padding: 11px 20px; background:#334155; color:#fff; border:none; border-radius:12px; font-weight:800; cursor:pointer; font-family:inherit;">تمام</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeSubmissionResultModal(openTab) {
    try {
        if (openTab) sessionStorage.setItem('open_tab_after_reload', openTab);
    } catch (e) {}
    window.location.reload();
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

// ==========================================
// 📚 الوحدات والمحتوى التعليمي (ملفات + فيديوهات + امتحانات)
// ==========================================
let studentUnitsCache = [];
let examLockedIdsCache = new Set();
let finishedExamStatsCache = new Map();

// نتائج الامتحانات المتاحة للطالب (محلياً + احتياطي من الأرشيف لو فتح من جهاز تاني) - بنجيبها مرة واحدة بس
async function loadFinishedExamStatsCache() {
    finishedExamStatsCache = new Map();
    getStoredHistory().forEach(r => { if (r.examId) finishedExamStatsCache.set(r.examId, r); });

    if (typeof db === 'undefined') return;
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    if (!code) return;
    try {
        const snap = await db.collection("results_archive").where("studentCode", "==", code).get();
        snap.forEach(d => {
            const data = d.data();
            if (data.examId && !finishedExamStatsCache.has(data.examId)) finishedExamStatsCache.set(data.examId, data);
        });
    } catch (e) {
        console.warn("تعذر تحميل نتائج الامتحانات المحفوظة:", e);
    }
}
let unitsCountdownTimer = null;

// جلب أقفال إعادة الامتحان الخاصة بالطالب (امتحانات سبق له تسليمها فعلاً)
async function loadExamLocksCache() {
    examLockedIdsCache = new Set();
    if (typeof db === 'undefined') return;
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    if (!code) return;
    try {
        const snap = await db.collection("exam_locks").where("studentCode", "==", code).get();
        snap.forEach(d => { const ex = d.data().examId; if (ex) examLockedIdsCache.add(ex); });
    } catch (e) {
        console.warn("تعذر تحميل أقفال الامتحانات:", e);
    }
}

// عداد تنازلي لموعد غلق الامتحان (يظهر للطالب فاضل كام يوم/ساعة/دقيقة)
function formatCountdown(ms) {
    if (ms <= 0) return null;
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days} يوم${hours > 0 ? ' و ' + hours + ' ساعة' : ''}`;
    if (hours > 0) return `${hours} ساعة${mins > 0 ? ' و ' + mins + ' دقيقة' : ''}`;
    return `${Math.max(mins, 1)} دقيقة`;
}

function tickUnitCountdowns() {
    document.querySelectorAll('.unit-countdown[data-closes-at]').forEach(el => {
        const closesAt = Number(el.getAttribute('data-closes-at'));
        const left = closesAt - Date.now();
        const text = formatCountdown(left);
        if (!text) {
            el.textContent = '🔒 قفل الامتحان الآن';
            el.classList.add('closed-now');
            renderUnitsSection();
        } else {
            el.textContent = '⏳ يُقفل الامتحان خلال: ' + text;
        }
    });
}

// تحويل رابط الفيديو لرابط قابل للتضمين (يوتيوب / درايف / فيميو)
function toEmbedUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') {
            const id = u.pathname.slice(1);
            return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
        }
        if (host.endsWith('youtube.com')) {
            if (u.pathname.startsWith('/embed/')) return `https://www.youtube.com${u.pathname}?rel=0`;
            if (u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}?rel=0`;
            const v = u.searchParams.get('v');
            return v ? `https://www.youtube.com/embed/${v}?rel=0` : null;
        }
        if (host === 'drive.google.com') {
            const m = u.pathname.match(/\/file\/d\/([^/]+)/);
            if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
            const idParam = u.searchParams.get('id');
            if (idParam) return `https://drive.google.com/file/d/${idParam}/preview`;
        }
        if (host === 'vimeo.com') {
            const id = u.pathname.split('/').filter(Boolean)[0];
            if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
        }
    } catch (e) {}
    return null;
}

function openVideoModal(title, url) {
    const embed = toEmbedUrl(url);
    if (!embed) {
        window.open(url, '_blank', 'noopener');
        return;
    }

    let modal = document.getElementById('video-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.93); z-index: 100000; display: flex;
        justify-content: center; align-items: center; padding: 14px; direction: rtl;
    `;
    modal.innerHTML = `
        <div style="width: 100%; max-width: 900px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                <strong style="color:#fff; font-size: 1.05rem;">🎬 ${escapeHtml(title)}</strong>
                <button onclick="closeVideoModal()" style="background:#e74c3c; color:#fff; border:none; border-radius:10px; padding:8px 16px; font-weight:800; cursor:pointer; font-family:inherit;">✕ إغلاق</button>
            </div>
            <div style="position: relative; width: 100%; padding-top: 56.25%; background:#000; border-radius: 14px; overflow: hidden;">
                <iframe src="${embed}" style="position:absolute; inset:0; width:100%; height:100%; border:0;" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
            </div>
            <div style="text-align:center; margin-top:10px;">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:#94a3b8; font-size:0.85rem;">لو الفيديو مش شغال اضغط هنا لفتحه في صفحة جديدة</a>
            </div>
        </div>
    `;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeVideoModal(); });
    document.body.appendChild(modal);
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    if (modal) modal.remove();   // حذف العنصر بيوقف الفيديو
}

function toggleUnitAccordion(unitId) {
    const acc = document.getElementById('unit-acc-' + unitId);
    if (acc) acc.classList.toggle('open');
}

async function renderUnitsSection() {
    const box = document.getElementById('units-list');
    if (!box) return;

    clearInterval(unitsCountdownTimer);

    if (typeof db === 'undefined') {
        box.innerHTML = "<p style='text-align:center;color:#e74c3c;'>❌ تعذر الاتصال بقاعدة البيانات.</p>";
        return;
    }

    box.innerHTML = "<p style='text-align:center;color:var(--text-sub);'>⏳ جاري تحميل المحتوى...</p>";

    // نستنى تحميل الامتحانات الأول عشان نعرف أنهي امتحان متاح للطالب
    try { if (window.__examsReady) await window.__examsReady; } catch (e) {}
    await Promise.all([loadExamLocksCache(), loadFinishedExamStatsCache()]);

    try {
        const snap = await db.collection("units").get();
        const stage = localStorage.getItem("student_stage") || "";

        let units = [];
        snap.forEach(d => units.push({ id: d.id, ...d.data() }));
        units = units
            .filter(u => u.isPublished !== false)
            .filter(u => !u.grade || u.grade === 'الكل' || u.grade === 'كل الصفوف' || !stage || u.grade === stage)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        studentUnitsCache = units;

        if (units.length === 0) {
            box.innerHTML = "<p style='text-align:center;color:#cbd5e1;padding:25px;'>📭 لا يوجد محتوى منشور حالياً.</p>";
            return;
        }

        const icons = { file: '📄', video: '▶️', exam: '📝' };
        const btnText = { file: 'فتح الملف', video: 'مشاهدة', exam: 'ابدأ الامتحان' };

        box.innerHTML = units.map((unit, idx) => {
            const items = Array.isArray(unit.items) ? unit.items : [];

            const rows = items.length === 0
                ? `<div class="unit-row-empty">لا يوجد محتوى في هذه الوحدة بعد.</div>`
                : items.map(it => {
                    let label = btnText[it.type] || 'فتح';
                    let disabled = false;

                    let reasonHtml = '';
                    let detailsHtml = '';
                    let rowExtraClass = '';

                    if (it.type === 'exam') {
                        const examObj = (window.__allExamsRaw || []).find(e => e.id === it.examId);
                        const hasSubmitted = !!localStorage.getItem('finished_' + it.examId) || examLockedIdsCache.has(it.examId) || finishedExamStatsCache.has(it.examId);
                        const available = !!(dynamicExamsDatabase && dynamicExamsDatabase[it.examId]);
                        const closeTs = (examObj && examObj.closesAt) ? new Date(examObj.closesAt).getTime() : NaN;
                        const isHardClosed = !!(examObj && (examObj.isClosed === true || (!isNaN(closeTs) && Date.now() >= closeTs)));

                        const statParts = [];
                        if (it.desc) statParts.push(`📝 ${escapeHtml(it.desc)}`);
                        if (examObj) {
                            statParts.push(`❓ عدد الأسئلة: ${(examObj.questions || []).length} سؤال`);
                            statParts.push(`⏱ مدة الامتحان: ${examObj.duration || 30} دقيقة`);
                        }
                        if (statParts.length) detailsHtml = `<div class="unit-row-stats">${statParts.map(x => `<span>${x}</span>`).join('')}</div>`;

                        if (hasSubmitted) {
                            label = 'تم التسليم ✅';
                            disabled = true;
                            rowExtraClass = ' unit-row-done';

                            const stats = finishedExamStatsCache.get(it.examId);
                            if (stats) {
                                const released = stats.canReview === true;
                                const scoreChip = released
                                    ? `<div class="exam-result-chip score">🏆 <b>${escapeHtml(stats.score || '')}</b>${stats.percentage ? ' (' + escapeHtml(stats.percentage) + ')' : ''}</div>`
                                    : `<div class="exam-result-chip pending">⏳ <b>قيد التصحيح</b></div>`;
                                const metaChips = [];
                                if (stats.startTime) metaChips.push(`<span>🟢 بدأ: ${escapeHtml(stats.startTime)}</span>`);
                                if (stats.endTime) metaChips.push(`<span>🏁 سلّم: ${escapeHtml(stats.endTime)}</span>`);
                                if (stats.durationTaken) metaChips.push(`<span>⏱ المدة: ${escapeHtml(stats.durationTaken)}</span>`);
                                detailsHtml += `
                                    <div class="exam-result-panel">
                                        ${scoreChip}
                                        ${metaChips.length ? `<div class="exam-result-meta">${metaChips.join('')}</div>` : ''}
                                    </div>`;
                            }
                        } else if (isHardClosed) {
                            label = '⚠️ أول إنذار';
                            disabled = true;
                            rowExtraClass = ' unit-row-locked';
                            reasonHtml = `<div class="unit-row-sub" style="color:#ff4d6d;">🔒 الامتحان اتقفل ولم تقم بحله</div>`;
                        } else if (!available) {
                            label = 'غير متاح حالياً';
                            disabled = true;
                            const why = getExamUnavailableReason(it.examId);
                            if (why) reasonHtml = `<div class="unit-row-sub">${escapeHtml(why)}</div>`;
                        } else if (!isNaN(closeTs) && closeTs > Date.now()) {
                            detailsHtml += `<div class="unit-countdown" data-closes-at="${closeTs}">⏳ يُقفل الامتحان خلال: ${escapeHtml(formatCountdown(closeTs - Date.now()) || '')}</div>`;
                        }
                    } else if (it.type === 'video') {
                        const viewKey = 'video_views_' + it.id;
                        const watched = parseInt(localStorage.getItem(viewKey) || '0', 10);
                        const remaining = it.maxViews ? Math.max(it.maxViews - watched, 0) : null;

                        const statParts = [];
                        if (it.desc) statParts.push(`📝 ${escapeHtml(it.desc)}`);
                        if (it.durationMin) statParts.push(`⏱ مدة الفيديو: ${it.durationMin} دقيقة`);
                        if (remaining !== null) statParts.push(`👁 المشاهدات المتبقية لك: ${remaining}`);
                        if (statParts.length) detailsHtml = `<div class="unit-row-stats">${statParts.map(x => `<span>${x}</span>`).join('')}</div>`;

                        if (remaining === 0) { label = 'انتهت مرات المشاهدة'; disabled = true; }
                    }

                    return `
                        <div class="unit-row unit-row-${it.type}${rowExtraClass}">
                            <div class="unit-row-icon">${icons[it.type] || '📌'}</div>
                            <div class="unit-row-main">
                                <div class="unit-row-title">${escapeHtml(it.title)}${reasonHtml}</div>
                                ${detailsHtml}
                            </div>
                            <button class="unit-row-btn" ${disabled ? 'disabled' : ''} onclick="openUnitItem('${unit.id}', '${it.id}')">${label}</button>
                        </div>
                    `;
                }).join('');

            return `
                <div class="unit-acc ${idx === 0 ? 'open' : ''}" id="unit-acc-${unit.id}">
                    <button class="unit-acc-head" onclick="toggleUnitAccordion('${unit.id}')">
                        <span class="unit-acc-chevron">⌄</span>
                        <span class="unit-acc-title">${escapeHtml(unit.title)}</span>
                        <span class="unit-acc-count">${items.length}</span>
                    </button>
                    <div class="unit-acc-body">${rows}</div>
                </div>
            `;
        }).join('');

        clearInterval(unitsCountdownTimer);
        unitsCountdownTimer = setInterval(tickUnitCountdowns, 30000);
    } catch (err) {
        console.error("خطأ في تحميل الوحدات:", err);
        box.innerHTML = "<p style='text-align:center;color:#e74c3c;'>❌ تعذر تحميل المحتوى. حاول مرة أخرى.</p>";
    }
}

// ليه الامتحان مش متاح؟ (بيظهر تحت اسم الامتحان في الوحدة)
function getExamUnavailableReason(examId) {
    const list = window.__allExamsRaw;
    if (!Array.isArray(list)) return "";
    const exam = list.find(e => e.id === examId);
    if (!exam) return "الامتحان ده اتمسح أو انتهى موعده";

    const now = Date.now();
    if (exam.isPublished === false || exam.status === 'draft') return "الامتحان لسه مسودة ومتنشرش (انشره من لوحة الأدمن)";
    if (exam.scheduledAt) {
        const t = new Date(exam.scheduledAt).getTime();
        if (!isNaN(t) && now < t) return "هيفتح يوم " + new Date(t).toLocaleString('ar-EG');
    }
    if (exam.closesAt) {
        const t = new Date(exam.closesAt).getTime();
        if (!isNaN(t) && now >= t) return "انتهى موعد الامتحان";
    }
    if (exam.isActive === false || exam.status === 'archived' || exam.status === 'expired' || exam.isOld === true) return "الامتحان مقفول";

    const stage = localStorage.getItem("student_stage") || "";
    const code = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "";
    const name = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    const phone = localStorage.getItem("student_phone") || "";
    if (!canStudentAccessExam(exam, code, stage, name, phone)) return "الامتحان ده مخصص لطلاب تانيين";
    return "";
}

function openUnitItem(unitId, itemId) {
    const unit = studentUnitsCache.find(u => u.id === unitId);
    if (!unit) return;
    const it = (unit.items || []).find(x => x.id === itemId);
    if (!it) return;

    if (it.type === 'file') {
        window.open(it.url, '_blank', 'noopener');
    } else if (it.type === 'video') {
        const viewKey = 'video_views_' + it.id;
        const watched = parseInt(localStorage.getItem(viewKey) || '0', 10);
        if (it.maxViews && watched >= it.maxViews) {
            showCustomToast("🔒 خلّصت عدد مرات المشاهدة المتاحة لهذا الفيديو.", "warning");
            return;
        }
        localStorage.setItem(viewKey, String(watched + 1));
        openVideoModal(it.title, it.url);
        renderUnitsSection();
    } else if (it.type === 'exam') {
        resetPortalToStep1(it.examId, 'exam');
    }
}