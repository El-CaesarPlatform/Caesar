// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// ==========================================
// <i class="fas fa-bolt"></i> 1. إعدادات وتصريح Firebase
// ==========================================
const firebaseConfig = {
    APIkey2: "AIzaSyDLNe8dO5ihVHFzGS7jd-t6VDLnXakxxao",
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
// <i class="fas fa-gear"></i> 2. المتغيرات العامة والدوال المساعدة
// ==========================================
const DEFAULT_EXAM_DURATION = 15;
let timerInterval = null;
let currentActiveSubject = "";
let currentActiveType = "exam";
let activeQuestionsList = [];
let currentSubjectVersion = 1;
let currentQuestionIndex = 0;

window.isExamRunning = false;
let dynamicExamsDatabase = {};
const homeworksDatabase = {};

function normalizeArabicText(text) {
    if (!text) return "";
    return text.toString().trim().toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/\s+/g, " ");
}

function getUniqueDocId(identifier, subjectKey) {
    const cleanId = (identifier || "").toString().trim().replace(/[/\\.#$\[\]\s]/g, '_');
    const cleanSub = (subjectKey || "").toString().trim().replace(/[/\\.#$\[\]\s]/g, '_');
    return `${cleanId}_${cleanSub}`;
}

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

function isExamSessionActive(subjectKey) {
    if (window.isExamRunning && currentActiveSubject === subjectKey) return true;
    try {
        const session = JSON.parse(localStorage.getItem('active_running_exam_session') || 'null');
        return !!(session && session.subjectKey === subjectKey);
    } catch (e) {
        return false;
    }
}

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

function fmtPts(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return "0";
    return String(Math.round(v * 100) / 100);
}

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

function generateQuestionsReviewHtml(answers, released = true) {
    if (!answers || !Array.isArray(answers) || answers.length === 0) return '';

    let html = `
        <div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 18px;">
            <h5 style="color: #00d2ff; font-size: 1.1rem; font-weight: bold; margin-bottom: 16px; text-align: right; display: flex; align-items: center; gap: 8px;">
                ${released ? '<i class="fas fa-pen-to-square"></i> تفاصيل الأسئلة ونموذج الإجابة:' : '<i class="fas fa-pen-to-square"></i> إجاباتك اللي سلّمتها:'}
            </h5>
            ${released ? '' : `<p style="color:#f1c40f; font-size:0.85rem; margin: -6px 0 14px; text-align:right;"><i class="fas fa-lock"></i> الصح والغلط والدرجات هتظهر بعد ما المعلم يعتمد النتيجة.</p>`}
    `;

    answers.forEach((item, index) => {
        const qText = item.question || `سؤال ${index + 1}`;
        const stAns = item.studentAnswer || "لم يحل";
        const qType = item.type || "choice";
        const isEssay = (qType === "essay");
        const crAns = isEssay ? (item.modelAnswer || "") : (item.correctAnswer || "");

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
            icon = "<i class='fas fa-pen'></i>";
            statusText = "سؤال مقالي (قيد المراجعة)";
        } else if (g.state === 'correct') {
            boxBg = "rgba(46, 204, 113, 0.08)";
            borderColor = "#2ecc71";
            icon = "<i class='fas fa-circle-check'></i>";
            statusText = "إجابة صحيحة";
        } else if (g.state === 'partial') {
            boxBg = "rgba(241, 196, 15, 0.08)";
            borderColor = "#f1c40f";
            icon = "<i class='fas fa-circle'></i>";
            statusText = "درجة جزئية";
        } else {
            boxBg = "rgba(231, 76, 60, 0.08)";
            borderColor = "#e74c3c";
            icon = "<i class='fas fa-circle-xmark'></i>";
            statusText = "إجابة خاطئة";
        }

        const pointsBadge = (g.state === 'pending')
            ? ''
            : `<span style="font-size: 0.78rem; background: rgba(0,0,0,0.5); padding: 3px 9px; border-radius: 6px; color: ${borderColor}; font-weight: bold;"><i class="fas fa-bullseye"></i> ${fmtPts(g.earned)} من ${fmtPts(g.points)}</span>`;

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
// <i class="fas fa-floppy-disk"></i> نظام مزامنة "حسابي" مع النتائج الحقيقية فقط
// ==========================================
function getHistoryOwner() {
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").toString().trim().toLowerCase();
    if (code) return code;
    return normalizeArabicText(localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "");
}

function getAllStoredHistory() {
    try {
        let history = JSON.parse(localStorage.getItem('alqeisar_exam_history') || '[]');
        history = history.filter(item => {
            if (!item || !item.examName) return false;
            if (!item.owner) return false;
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

function getStoredHistory() {
    const owner = getHistoryOwner();
    if (!owner) return [];
    return getAllStoredHistory().filter(item => item.owner === owner);
}

function saveStoredHistory(currentList) {
    const owner = getHistoryOwner();
    if (!owner) return;
    const others = getAllStoredHistory().filter(item => item.owner !== owner);
    const mine = (currentList || []).map(r => ({ ...r, owner: owner }));
    localStorage.setItem('alqeisar_exam_history', JSON.stringify(others.concat(mine)));
}

function getHistoryRecordKey(r) {
    // لازم الدمج والتفريد يكونوا بمعرّف الامتحان الثابت، مش بالسيريال العشوائي
    // (السيريال بيتغيّر كل مرة الطالب يعيد الامتحان، فكان بيعمل صف مكرر بدل ما يحدّث نفس الصف)
    if (r && r.examId) return String(r.examId);
    return String((r && (r.key || r.serial || r.id)) || '');
}

function prettifyExamName(name, totalQuestions) {
    const n = (name || '').toString().trim();
    // أسماء زي كود مستندات فايربيز العشوائي (حروف وأرقام متلخبطة من غير مسافات) مش اسم امتحان حقيقي
    const looksLikeRawId = /^[A-Za-z0-9_-]{12,}$/.test(n) && !/\s/.test(n) && /[a-z]/.test(n) && /[A-Z0-9]/.test(n);
    if (!n || looksLikeRawId) return "امتحان غير متاح حالياً (محذوف أو منتهي)";
    return n;
}

function getHistoryRecordTime(r) {
    if (!r) return 0;
    if (r.timestampMs) return Number(r.timestampMs) || 0;
    const id = String(r.id || '');
    if (id.startsWith('exam_')) return Number(id.slice(5)) || 0;
    return 0;
}

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
                const sName = normalizeArabicText(data.studentName || data.name || "");
                // لازم الاسم يتطابق برضو مش بس الكود، عشان لو حصل واتكرر نفس الكود بالغلط بين طالبين مختلفين ميحصلش تداخل في النتايج
                if (studentName && sName && sName !== studentName) return;
                if (data.hasSubmitted === true || data.isSubmitted === true || (data.answers && data.answers.length > 0)) {
                    realSubmissions.push({ id: doc.id, ...data });
                }
            });

            if (realSubmissions.length === 0 && studentName && !studentCode) {
                const allSnap = await db.collection("students").get();
                allSnap.forEach(doc => {
                    const data = doc.data();
                    const sName = normalizeArabicText(data.studentName || data.name || "");
                    const docCode = (data.studentCode || data.code || "").toString().trim();
                    const codeOk = !docCode;
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
                    percentage: isApproved ? `% ${percentage}` : '<i class="fas fa-hourglass-half"></i> قيد التصحيح',
                    score: isApproved ? `${fmtScoreText(score)} من ${fmtPts(maxScore)}` : 'قيد التصحيح <i class="fas fa-hourglass-half"></i>',
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

        const mergedHistory = mergeHistoryRecords(getStoredHistory(), archiveRecords, liveRecords);
        if (mergedHistory.length > 0) {
            saveStoredHistory(mergedHistory);
        }

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
                    <i class="fas fa-inbox"></i> لا توجد نتائج سابقة مسجلة حتى الآن.<br>
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
            <td style="font-weight: 800; color: #ffffff;">${escapeHtml(prettifyExamName(row.examName, row.totalQuestions))}</td>
            <td>${row.totalQuestions}</td>
            <td style="font-weight: 800; color: ${isUnderReview ? '#f1c40f' : 'var(--accent-cyan)'};">
                ${row.percentage}
            </td>
            <td style="font-weight: 800; color: ${isUnderReview ? '#f1c40f' : '#2ecc71'};">
                ${isUnderReview ? '<i class="fas fa-hourglass-half"></i>' : '<i class="fas fa-trophy"></i>'} ${row.score}
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
        showCustomToast("<i class='fas fa-lock'></i> الإجابات غير متاحة لهذا الامتحان.", "warning");
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
        ? `<div style="text-align:center; margin-bottom: 14px; padding: 12px; background: rgba(0,242,254,0.07); border: 1px solid rgba(0,242,254,0.25); border-radius: 12px; color:#fff; font-weight:800;"><i class="fas fa-trophy"></i> درجتك: <span style="color:#2ecc71;">${escapeHtml(item.score)}</span></div>`
        : `<div style="text-align:center; margin-bottom: 14px; padding: 12px; background: rgba(241,196,15,0.08); border: 1px solid rgba(241,196,15,0.3); border-radius: 12px; color:#f1c40f; font-weight:800;"><i class="fas fa-hourglass-half"></i> النتيجة قيد التصحيح</div>`;

    reviewModal.innerHTML = `
        <div style="background: #0f1422; border: 1px solid rgba(0,242,254,0.3); border-radius: 20px; max-width: 650px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 16px 20px; background: #141c2c; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                <h4 style="color: #00f2fe; margin: 0; font-size: 1.1rem; font-weight: 800;"><i class="fas fa-book-open"></i> مراجعة إجابات: ${escapeHtml(prettifyExamName(item.examName, item.totalQuestions))}</h4>
                <button onclick="document.getElementById('answers-review-modal').style.display='none'" style="background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer;"><i class="fas fa-xmark"></i></button>
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
        if (ENFORCE_EXAM_GRADE && exam.grade && exam.grade !== "عام" && exam.grade !== "الكل" && studentStage && studentStage !== "غير محدد") {
            return exam.grade === studentStage;
        }
        return true;
    }

    return false;
}

// ==========================================
// تسجيل الخروج: تفريغ بيانات الطالب بالكامل من الجهاز
// ==========================================
function logoutStudent() {
    if (!confirm("هل أنت متأكد من تسجيل الخروج؟")) return;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
            key === "student_code" || key === "exam_code" || key === "code" ||
            key === "student_fullname" || key === "student_name" ||
            key === "student_stage" || key === "student_phone" || key === "parent_phone" ||
            key.startsWith("finished_") ||
            key.startsWith("saved_exam_answers_") ||
            key.startsWith("active_running_exam_session") ||
            key.startsWith("last_ping_")
        ) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();

    window.location.href = "index.html";
}

window.onload = function() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    let studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || localStorage.getItem("code") || "";
    let studentPhone = localStorage.getItem("student_phone") || "";
    let parentPhone = localStorage.getItem("parent_phone") || "";
    let studentStage = localStorage.getItem("student_stage") || "الصف الثاني الإعدادي";

    if (!studentName || !studentCode) {
        if (!studentName) {
            studentName = prompt("يرجى إدخال اسمك الثلاثي لدخول المنصة:") || "";
            if (studentName.trim() !== "") {
                studentName = studentName.trim();
                localStorage.setItem("student_fullname", studentName);
            }
        }
        if (!studentCode) {
            studentCode = prompt("يرجى إدخال كود الطالب الخاص بك:") || "";
            if (studentCode.trim() !== "") {
                studentCode = studentCode.trim();
                localStorage.setItem("student_code", studentCode);
            }
        }

        if (!studentName || !studentCode) {
            showCustomToast("<i class='fas fa-triangle-exclamation'></i> بيانات الدخول غير مكتملة، جاري توجيهك لصفحة التسجيل...", "warning");
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

    try {
        let nextTab = sessionStorage.getItem('open_tab_after_reload') || 'home';
        sessionStorage.removeItem('open_tab_after_reload');
        if (!window.isExamRunning) switchTab(nextTab);
    } catch (e) {}
};

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
            <h3 style="color: #00d2ff; margin-bottom: 15px; font-size: 1.3rem; font-weight:900;"><i class="fas fa-triangle-exclamation"></i> تأكيد تسليم الامتحان</h3>
            <p id="confirm-modal-text" style="color: #cbd5e1; margin-bottom: 25px; line-height: 1.6; font-size: 1rem;"></p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button onclick="confirmFinalSubmit()" style="flex: 1; padding: 12px; background: #2ecc71; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.95rem;">تأكيد التسليم <i class="fas fa-rocket"></i></button>
                <button onclick="closeConfirmSubmitModal()" style="flex: 1; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.95rem;">استنى / مراجعة <i class="fas fa-arrow-right"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function setupAntiCheatListeners() {
    window.addEventListener('pagehide', saveAllAnswersFromDOM);

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
            const confirmationMessage = '<i class="fas fa-triangle-exclamation"></i> تنبيه: إغلاق الصفحة أو إعادة تحميلها قد يؤدي إلى فقدان إجاباتك ورصد الاختبار!';
            (e || window.event).returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });

    document.addEventListener("visibilitychange", function() {
        if (window.isExamRunning && document.hidden) {
            saveAllAnswersFromDOM();
            showCustomToast("<i class='fas fa-triangle-exclamation'></i> تنبيه أمني: يرجى عدم الخروج من شاشة الامتحان لضمان عدم الخصم أو الإلغاء!", "warning");
        }
    });
}

async function loadAssignedExam() {
    const examsGrid = document.getElementById('assigned-exam-grid');
    const studentStage = localStorage.getItem("student_stage") || "";
    const studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "";
    const studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    const studentPhone = localStorage.getItem("student_phone") || "";

    if (!examsGrid) return;

    if (typeof db === 'undefined') {
        examsGrid.innerHTML = "<p style='text-align:center;color:#e74c3c;grid-column:1/-1;'><i class='fas fa-circle-xmark'></i> تعذر الاتصال بقاعدة البيانات. تحقق من الاتصال بالإنترنت.</p>";
        return;
    }

    try {
        const fetchPromise = db.collection("exams").get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
        
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

        if (snapshot.empty) {
            window.__allExamsRaw = [];
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'><i class='fas fa-inbox'></i> لا يوجد امتحان منشور حالياً.</p>";
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

            if (exam.isPublished === false || exam.status === 'draft') return false;

            if (exam.scheduledAt) {
                const openTime = new Date(exam.scheduledAt).getTime();
                if (!isNaN(openTime) && now < openTime) return false;
            }

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
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'><i class='fas fa-inbox'></i> لا يوجد امتحان مخصص لك حالياً.</p>";
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
                questions: convertedQuestions,
                surveyQuestions: Array.isArray(activeExam.surveyQuestions) ? activeExam.surveyQuestions : []
            };

            examsGrid.innerHTML += `
                <div class="exam-card" id="card-${activeExam.id}">
                    <h3><i class="fas fa-school"></i> ${activeExam.grade || studentStage || 'عام'}</h3>
                    <h4>${activeExam.examCode || activeExam.title || 'اختبار أونلاين'}</h4>
                    <p><i class="fas fa-pen-to-square"></i> عدد الأسئلة: <strong>${convertedQuestions.length}</strong> أسئلة<br><i class="fas fa-stopwatch"></i> مدة الامتحان: <strong>${examDuration}</strong> دقيقة</p>
                    <button class="btn btn-exam" onclick="resetPortalToStep1('${activeExam.id}', 'exam')">ابدأ الآن <i class="fas fa-rocket"></i></button>
                </div>
            `;
        });

        updateExamButtonsStatus();

    } catch (err) {
        console.error("خطأ أثناء تحميل الامتحان:", err);
        examsGrid.innerHTML = `
            <div style="text-align:center; color:#e74c3c; grid-column:1/-1; padding:20px;">
                <p><i class="fas fa-circle-xmark"></i> تعذر تحميل الامتحانات بسبب بطء شبكة الموبايل أو عدم استجابة السيرفر.</p>
                <button onclick="location.reload()" style="padding:8px 16px; background:#0066ff; color:#fff; border:none; border-radius:6px; cursor:pointer;">إعادة المحاولة <i class="fas fa-arrows-rotate"></i></button>
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
                    btn.innerHTML = type === "exam" ? "<i class='fas fa-lock'></i> تم أداء الامتحان" : "<i class='fas fa-lock'></i> تم تسليم الواجب";
                } else {
                    btn.style.background = "#0066ff";
                    btn.style.cursor = "pointer";
                    btn.disabled = false;
                    btn.innerHTML = "ابدأ الآن <i class='fas fa-rocket'></i>";
                }
            }
        }
    }
}

async function checkStudentResult() {
    const studentNameInput = document.getElementById("search-student-name");
    const studentCodeInput = document.getElementById("search-student-code");

    const rawNameSearch = studentNameInput ? studentNameInput.value.trim() : "";
    const rawCodeSearch = studentCodeInput ? studentCodeInput.value.trim() : "";
    
    const querySearchNorm = normalizeArabicText(rawNameSearch);
    const codeSearchLower = rawCodeSearch.toLowerCase();
    const displayBox = document.getElementById("result-display-box");

    if (!rawNameSearch || !rawCodeSearch) {
        showCustomToast("<i class='fas fa-triangle-exclamation'></i> خطأ: يجب إدخال (اسم الطالب) و (كود الطالب) معاً للاستعلام!", "warning");
        if (displayBox) {
            displayBox.style.display = "block";
            displayBox.innerHTML = `
                <div style="background: rgba(231, 76, 60, 0.1); border-right: 5px solid #e74c3c; padding: 18px; border-radius: 12px; text-align: right; margin-top: 15px;">
                    <p style="color:#e74c3c; font-weight:bold; margin:0; font-size:1.1rem;">
                        <i class="fas fa-triangle-exclamation"></i> حقل الاسم وكود الطالب مطلوبان معاً لإجراء الاستعلام!
                    </p>
                </div>
            `;
        }
        return;
    }

    if (!displayBox) return;

    displayBox.style.display = "block";
    displayBox.innerHTML = "<p style='text-align:center; color:#00d2ff; font-weight:bold; text-shadow: 0 0 10px rgba(0, 210, 255, 0.5);'><i class='fas fa-hourglass-half'></i> جاري البحث عن الامتحانات التي قمت بأدائها...</p>";

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
                let html = `<h4 style="color: #00d2ff; text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 1.2rem;"><i class="fas fa-chart-column"></i> كشف الامتحانات التي قمت بأدائها (${finalFilteredResults.length})</h4>`;

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
                                <h4 style="color: ${scoreColor}; margin-bottom: 15px; font-weight: bold;"><i class="fas fa-trophy"></i> النتيجة النهائية</h4>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong><i class="fas fa-user"></i> الطالب:</strong> ${docData.studentName || docData.name}</p>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong><i class="fas fa-school"></i> الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px; color:#cbd5e1;"><strong><i class="fas fa-book-open"></i> الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                
                                <div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; text-align: center;">
                                    <span style="font-size: 1.1rem; color: #fff;">الدرجة: </span>
                                    <span style="color:${scoreColor}; font-weight:bold; font-size:1.6rem;">${fmtPts(score)}</span> 
                                    <span style="color:#fff; font-size:1.2rem;"> / ${fmtPts(maxScore)}</span>
                                    <div style="margin-top: 10px; font-size: 1.25rem; color: ${scoreColor}; font-weight: bold;">النسبة المئوية: %${percentage}</div>
                                </div>

                                ${generateQuestionsReviewHtml(docData.answers, true)}
                            </div>
                        `;
                    } else {
                        html += `
                            <div style="background: rgba(241, 196, 15, 0.1); border-right: 5px solid #f1c40f; padding: 18px; border-radius: 12px; text-align: right; margin-bottom: 15px;">
                                <h4 style="color: #f1c40f; margin-bottom: 10px;"><i class="fas fa-hourglass-half"></i> قيد التصحيح والمراجعة</h4>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong><i class="fas fa-user"></i> الطالب:</strong> ${docData.studentName || docData.name}</p>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong><i class="fas fa-book-open"></i> الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="color: #cbd5e1; margin-bottom: 8px;"><strong><i class="fas fa-calendar-days"></i> وقت التسليم:</strong> ${submittedDate}</p>
                                <p style="color: #2ecc71; font-weight: bold; margin-top: 10px;">
                                    <i class="fas fa-envelope"></i> تم حفظ إجاباتك بنجاح، وستظهر الدرجة والصح والغلط هنا فور اعتمادها من المعلم.
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
            <p style="color:#e74c3c; font-weight:bold; margin:0 0 10px 0; font-size:1.1rem;"><i class="fas fa-circle-xmark"></i> لم يتم العثور على أي امتحان مُسلّم</p>
            <p style="color: #cbd5e1; font-size: 0.95rem; margin:0;">عفواً، لم تقم بأداء وتسليم أي امتحان بعد تحت هذا الاسم والكود.</p>
        </div>
    `;
}

function switchTab(tab) {
    if (window.isExamRunning) {
        showCustomToast("<i class='fas fa-triangle-exclamation'></i> عذراً! لا يمكنك التنقل بين الأقسام أثناء أداء الامتحان.", "warning");
        return;
    }

    const tabs = {
        'home': { btn: document.getElementById('tab-btn-home'), sec: document.getElementById('home-section') },
        'courses': { btn: document.getElementById('tab-btn-courses'), sec: document.getElementById('courses-section') },
        'exams': { btn: document.getElementById('tab-btn-exams'), sec: document.getElementById('exams-section') },
        'units': { btn: document.getElementById('tab-btn-units'), sec: document.getElementById('units-section') },
        'forum': { btn: document.getElementById('tab-btn-forum'), sec: document.getElementById('forum-section') },
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
        renderStudentPerformanceSummary();
        renderSubscriptionsSection();
    }

    if (tab === 'units') {
        renderUnitsSection();
    }
    if (tab === 'courses') renderCoursesSection();
    if (tab === 'home') renderHomeSection();
}

function toggleSidebarCollapse() {
    const sb = document.getElementById('app-sidebar');
    if (sb) sb.classList.toggle('collapsed');
}

// <i class="fas fa-circle-check"></i> متوسّط النتائج بتصميم احترافي وألوان
function renderStudentPerformanceSummary() {
    const box = document.getElementById('student-performance-summary'); if (!box) return;
    const rows = getStoredHistory().filter(r => r.canReview && Number(r.maxScoreNum) > 0);
    if (!rows.length) {
        box.style.display = 'block';
        box.innerHTML = '<i class="fas fa-chart-column"></i> <b>متوسط نتائجك:</b> لم تُعتمد أي نتيجة بعد.';
        return;
    }
    const avg = Math.round(rows.reduce((s, r) => s + (Number(r.scoreNum || 0) / Number(r.maxScoreNum || 1) * 100), 0) / rows.length);
    const best = Math.max(...rows.map(r => Math.round(Number(r.scoreNum || 0) / Number(r.maxScoreNum || 1) * 100)));
    let level, color, emoji;
    if (avg >= 90)      { level = 'عاش يا وحش! ممتاز <i class="fas fa-star"></i>'; color = '#00f5d4'; emoji = '<i class="fas fa-trophy"></i>'; }
    else if (avg >= 85) { level = 'عاش يا بطل! ممتاز';    color = '#2ecc71'; emoji = '<i class="fas fa-medal"></i>'; }
    else if (avg >= 75) { level = 'كويس جداً، استمر';      color = '#3498db'; emoji = '<i class="fas fa-medal"></i>'; }
    else if (avg >= 60) { level = 'كويس، محتاج مراجعة';    color = '#f1c40f'; emoji = '<i class="fas fa-medal"></i>'; }
    else                { level = 'محتاج مراجعة جادة <i class="fas fa-hand-fist"></i>';  color = '#e74c3c'; emoji = '<i class="fas fa-book"></i>'; }

    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:space-around;text-align:center;">
        <div><div style="color:#94a3b8;font-size:.85rem;margin-bottom:4px;"><i class="fas fa-chart-column"></i> متوسط نتائجك</div><div style="color:${color};font-size:2.2rem;font-weight:900;">${avg}%</div></div>
        <div><div style="color:#94a3b8;font-size:.85rem;margin-bottom:4px;"><i class="fas fa-trophy"></i> أعلى نتيجة</div><div style="color:#00f2fe;font-size:2.2rem;font-weight:900;">${best}%</div></div>
        <div><div style="color:#94a3b8;font-size:.85rem;margin-bottom:4px;"><i class="fas fa-pen-to-square"></i> عدد الامتحانات</div><div style="color:#fff;font-size:2.2rem;font-weight:900;">${rows.length}</div></div>
      </div>
      <div style="margin-top:14px;padding:10px;background:rgba(0,0,0,0.3);border-radius:12px;color:${color};font-weight:900;font-size:1.1rem;text-align:center;">
        ${emoji} ${level}
      </div>`;
}

async function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";
    let studentCode = localStorage.getItem('student_code') || localStorage.getItem('exam_code') || "";

    if (typeof db !== 'undefined' && (studentCode || studentFullName)) {
        const uniqueDocId = getUniqueDocId(studentCode || studentFullName, cleanSubjectKey);

        try {
            const lockSnap = await db.collection("exam_locks").doc(uniqueDocId).get();
            if (lockSnap.exists) {
                localStorage.setItem('finished_' + cleanSubjectKey, (dynamicExamsDatabase[cleanSubjectKey]?.version || 1).toString());
                showCustomToast("<i class='fas fa-triangle-exclamation'></i> عذراً، لقد قمت بأداء هذا الاختبار مسبقاً!", "error");
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
                    showCustomToast("<i class='fas fa-triangle-exclamation'></i> عذراً، لقد قمت بأداء هذا الاختبار مسبقاً!", "error");
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
        showCustomToast(`<i class="fas fa-triangle-exclamation"></i> تنبيه: الامتحان غير متاح حالياً، حاول تحديث الصفحة.`, "warning");
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

// وضع "قفل شاشة الامتحان": بيخفي كل أقسام المنصة (بما فيها الرئيسية والمنتدى اللي كانت ناسيه الكود القديم)
// عشان الطالب يفضل حابس في شاشة الامتحان بس ومايقدرش يشوف/يروح حتة تانية وهو بيمتحن
function lockAllSectionsForExam() {
    ['home-section', 'courses-section', 'exams-section', 'units-section', 'forum-section', 'results-section', 'account-section']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'none';
}

function startExamActual() {
    document.getElementById('portal-modal').style.display = 'none';
    document.getElementById('quiz-wrapper-box').style.display = 'block';

    lockAllSectionsForExam();

    window.isExamRunning = true;
    window.__aiSig = { leaves: 0, paste: 0, copy: 0, hiddenMs: 0 };
    document.body.classList.add('exam-mode');
    currentQuestionIndex = 0;

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
        
        lockAllSectionsForExam();

        window.isExamRunning = true;
        document.body.classList.add('exam-mode');
        currentQuestionIndex = 0;

        renderQuestions();
        startTimer(sessionData.endTime);

        showCustomToast("<i class='fas fa-arrows-rotate'></i> تم استعادة جلسة الامتحان وإجاباتك بنجاح!", "success");

    } catch (e) {
        console.warn("خطأ في استعادة الجلسة الحالية:", e);
    }
}

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

    let fullHtml = '';
    activeQuestionsList.forEach((q, qIndex) => {
        let isActive = (qIndex === currentQuestionIndex);
        let html = `<div id="block-q${qIndex}" class="single-question-card ${isActive ? 'active-question' : ''}">`;

        const isChoiceHead = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);
        html += `
        <div class="q-card-head">
            <span class="q-card-tag"><i class="fas fa-pen-to-square"></i> السؤال ${qIndex + 1} من ${activeQuestionsList.length}</span>
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

    if (navBar) {
        navBar.innerHTML = activeQuestionsList.map((_, idx) => `
            <button type="button" id="q-nav-btn-${idx}" class="q-nav-btn ${idx === currentQuestionIndex ? 'active' : ''}" onclick="showQuestion(${idx})">
                ${idx + 1}
            </button>
        `).join('');
    }

    if (footerNav) footerNav.style.display = 'flex';

    setupExamBarSpacing();
    showQuestion(currentQuestionIndex);
    updateExamProgressCounters();
}

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

function showQuestion(index) {
    if (index < 0 || index >= activeQuestionsList.length) return;
    currentQuestionIndex = index;

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
                try { navBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (e) {}
            } else {
                navBtn.classList.remove('active');
            }
        }
    });

    if (window.isExamRunning) {
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    }

    const prevBtn = document.getElementById('prev-q-btn');
    const nextBtn = document.getElementById('next-q-btn');
    const indicator = document.getElementById('current-q-indicator');

    if (prevBtn) prevBtn.disabled = (currentQuestionIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentQuestionIndex === activeQuestionsList.length - 1);
    if (indicator) indicator.textContent = `السؤال (${currentQuestionIndex + 1}) من (${activeQuestionsList.length})`;
}

function navigateQuestion(step) {
    showQuestion(currentQuestionIndex + step);
}

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

    const progressFill = document.getElementById('exam-progress-fill');
    if (progressFill) progressFill.style.width = (total > 0 ? Math.round((solvedCount / total) * 100) : 0) + '%';

    const motivation = document.getElementById('exam-motivation');
    if (motivation) {
        let msg;
        if (total > 0 && solvedCount >= total) {
            msg = "ممتاز! جاوبت على كل الأسئلة <i class='fas fa-circle-check'></i> راجع إجاباتك قبل التسليم";
        } else if (solvedCount === 0) {
            msg = "ابدأ بهدوء وتركيز… إنت مذاكر وقادر تحلها <i class='fas fa-hand-fist'></i>";
        } else if (solvedCount < total / 2) {
            msg = "ماشي كويس! خد نفس وكمّل سؤال ورا التاني <i class='fas fa-wand-magic-sparkles'></i>";
        } else {
            msg = "قربت تخلّص! فاضل القليل، كمّل بنفس التركيز <i class='fas fa-fire'></i>";
        }
        if (motivation.textContent !== msg) motivation.innerHTML = msg;
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
    updateExamProgressCounters();
}

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
            showCustomToast("<i class='fas fa-clock'></i> انتهى الوقت المحدد! سيتم تسليم الإجابات تلقائياً الآن.", "warning");
            calculateAndSend(true);
            return;
        }

        let m = Math.floor(totalSecondsLeft / 60);
        let s = totalSecondsLeft % 60;
        if (display) {
            display.textContent = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        }

        const timerBox = document.querySelector('.exam-square-timer-box');
        if (timerBox) {
            timerBox.classList.toggle('danger', totalSecondsLeft <= 60);
            timerBox.classList.toggle('warn', totalSecondsLeft > 60 && totalSecondsLeft <= 300);
        }
    }

    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

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
        showQuestion(unansweredIndices[0] - 1);
        showCustomToast(`<i class="fas fa-triangle-exclamation"></i> تذكير: نسيت الإجابة على السؤال رقم (${unansweredIndices.join(' ، ')})!`, "warning");

        if (modalText) {
            modalText.innerHTML = `<i class="fas fa-triangle-exclamation"></i> <strong style="color:#f1c40f;">تنبيه:</strong> نسيت الإجابة على الأسئلة التالية: <br><span style="color:#e74c3c; font-weight:bold; font-size:1.15rem;">(سؤال ${unansweredIndices.join(' ، ')})</span><br><br>هل تريد تسليم الامتحان رغم ذلك أم المراجعة؟`;
        }
    } else {
        if (modalText) {
            modalText.innerHTML = `<i class="fas fa-champagne-glasses"></i> ممتاز! لقد قمت بالإجابة على جميع الأسئلة.<br><br>هل أنت متأكد من تسليم الإجابات الآن؟`;
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

function calculateAndSend(bypassValidation = false) {
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
                    correctionStatus = ` [<i class="fas fa-circle-check"></i> صحيح]`;
                } else {
                    isCorrect = false;
                    wrongCount++;
                    correctionStatus = ` [<i class="fas fa-circle-xmark"></i> خطأ]`;
                }
            } else {
                studentValue = "لم يحل";
                isCorrect = false;
                wrongCount++;
                correctionStatus = ` [<i class="fas fa-circle-xmark"></i> لم يحل]`;
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
            correctionStatus = ` [<i class="fas fa-pen-to-square"></i> مقالي]`;
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

    // احفظ أخطاء أسئلة الاختيار للكورس الحالي حتى تظهر في تدريب "أسئلة من أخطائك".
    const practiceCourseId = window.currentCourseIdForExam || activeCourseId;
    if (practiceCourseId && !String(currentActiveSubject).startsWith('mistake_practice_')) {
        const mistakeKey = getMistakeQuestionsStorageKey(practiceCourseId);
        let mistakeMap = {};
        try { mistakeMap = JSON.parse(localStorage.getItem(mistakeKey) || '{}') || {}; } catch (e) {}
        activeQuestionsList.forEach((q, qIndex) => {
            const answer = answersForAdmin[qIndex];
            const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);
            if (!isChoice || !answer || answer.isCorrect === true) return;
            const stableKey = `${currentActiveSubject}_${qIndex}_${(q.question || '').slice(0, 80)}`;
            mistakeMap[stableKey] = {
                question: q.question || 'سؤال بدون نص', options: Array.isArray(q.options) ? q.options : [],
                correctAnswer: q.correctAnswer || '', imageUrl: q.imageUrl || '', points: q.points || 1,
                sourceExam: currentActiveSubject
            };
        });
        try { localStorage.setItem(mistakeKey, JSON.stringify(mistakeMap)); } catch (e) { console.warn('تعذر حفظ أسئلة الأخطاء:', e); }
    }

    const hasEssay = answersForAdmin.some(a => a.type === "essay");
    const sig = window.__aiSig || {};
    const aiReasons = [];
    if ((sig.leaves || 0) >= 2) aiReasons.push('خرج من شاشة الامتحان ' + sig.leaves + ' مرات');
    if ((sig.paste || 0) >= 1) aiReasons.push('لصق نص ' + sig.paste + ' مرة');
    if ((sig.copy || 0) >= 1) aiReasons.push('نسخ نص ' + sig.copy + ' مرة');
    const aiSuspected = aiReasons.length > 0;
    const cancelExam = aiSuspected && !hasEssay;
    const releaseNow = !hasEssay && !cancelExam;
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

    let history = getStoredHistory();
    const newHistoryRecord = {
        id: `exam_${Date.now()}`,
        key: serialGenerated,
        serial: serialGenerated,
        examName: currentExamTitle,
        totalQuestions: activeQuestionsList.length,
        percentage: releaseNow ? `% ${finalPercent}` : '<i class="fas fa-hourglass-half"></i> قيد التصحيح',
        score: releaseNow ? `${fmtScoreText(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}` : 'قيد التصحيح <i class="fas fa-hourglass-half"></i>',
        scoreNum: mcqScoreObtained,
        maxScoreNum: totalExamPointsPossible || 10,
        solvedQuestions: solvedQuestionsCount,
        canReview: releaseNow,
        startTime: realStartFormatted,
        endTime: realEndFormatted,
        durationTaken: durationTaken,
        examId: currentActiveSubject,
        courseId: window.currentCourseIdForExam || null,
        timestampMs: Date.now(),
        answers: answersForAdmin
    };
    newHistoryRecord.aiSuspected = aiSuspected;
    if (cancelExam) { newHistoryRecord.percentage = 'ملغي'; newHistoryRecord.score = 'ملغي'; newHistoryRecord.canReview = false; }
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
            courseId: window.currentCourseIdForExam || null,
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
            aiSuspected: aiSuspected,
            aiReasons: aiReasons,
            aiSignals: { leaves: sig.leaves || 0, paste: sig.paste || 0, copy: sig.copy || 0, hiddenSeconds: Math.round((sig.hiddenMs || 0) / 1000) },
            examCancelled: cancelExam,
            cancelReason: cancelExam ? 'استخدام AI' : '',
            showScore: releaseNow,
            showResult: releaseNow,
            isResultVisible: releaseNow,
            submittedAt: currentFormattedTime,
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
            localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
            localStorage.removeItem('active_running_exam_session');

            archiveHistoryRecord(newHistoryRecord);

            maybeShowExamSurvey(currentActiveSubject, currentExamTitle, studentFullName, studentCode, () => {
                showSubmissionResultModal({
                    examTitle: currentExamTitle,
                    released: releaseNow,
                    scoreText: `${fmtPts(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}`,
                    percent: finalPercent,
                    cancelled: cancelExam
                });
            });

        }).catch((error) => {
            console.error("خطأ أثناء تسليم الامتحان: ", error);
            showCustomToast("<i class='fas fa-circle-xmark'></i> حدث خطأ أثناء تسليم إجاباتك، يرجى المحاولة مرة أخرى.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = "تسليم الامتحان <i class='fas fa-paper-plane'></i>";
            }
        });
    } else {
        localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
        localStorage.removeItem('saved_exam_answers_' + currentActiveSubject);
        localStorage.removeItem('active_running_exam_session');
        maybeShowExamSurvey(currentActiveSubject, currentExamTitle, studentFullName, studentCode, () => {
            showSubmissionResultModal({
                examTitle: currentExamTitle,
                released: releaseNow,
                scoreText: `${fmtPts(mcqScoreObtained)} من ${fmtPts(totalExamPointsPossible || 10)}`,
                percent: finalPercent,
                    cancelled: cancelExam
            });
        });
    }
}

// ==========================================
// استبيان بعد الامتحان مباشرة + شاشة شكر بأنيميشن
// ==========================================
function maybeShowExamSurvey(examId, examTitle, studentName, studentCode, onDone) {
    const examData = (typeof dynamicExamsDatabase !== 'undefined') ? dynamicExamsDatabase[examId] : null;
    const questions = (examData && Array.isArray(examData.surveyQuestions)) ? examData.surveyQuestions.filter(q => q && q.trim()) : [];

    if (!questions.length) { onDone(); return; }

    const old = document.getElementById('exam-survey-modal');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'exam-survey-modal';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 100001; padding: 15px; direction: rtl; font-family: 'Cairo', sans-serif;
    `;

    const questionsHtml = questions.map((q, i) => `
        <div style="margin-bottom: 16px; text-align: right;">
            <label style="color:#e2e8f0; font-weight:700; display:block; margin-bottom:8px; font-size:0.95rem;">${i + 1}. ${escapeHtml(q)}</label>
            <textarea class="survey-answer-input" data-q-index="${i}" rows="2" placeholder="اكتب إجابتك هنا..." style="width:100%; padding:10px 12px; border-radius:10px; background:#0b1121; color:#fff; border:1px solid rgba(255,255,255,0.15); font-family:'Cairo',sans-serif; resize:vertical;"></textarea>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div style="background:#1e1e38; padding:26px; border-radius:20px; max-width:460px; width:95%; text-align:center; border:1px solid rgba(255,255,255,0.15); box-shadow:0 10px 40px rgba(0,0,0,0.6); max-height:88vh; overflow-y:auto;">
            <div style="font-size:2.6rem; margin-bottom:6px;"><i class="fas fa-clipboard-question" style="color:#9d4edd;"></i></div>
            <h3 style="color:#fff; margin:0 0 4px; font-size:1.25rem;">قبل ما تخرج، جاوب على استبيان سريع</h3>
            <p style="color:#94a3b8; margin:0 0 18px; font-size:0.9rem;">${escapeHtml(examTitle)}</p>
            <div id="survey-questions-list">${questionsHtml}</div>
            <button id="submit-survey-btn" style="width:100%; margin-top:6px; padding:13px 20px; background:linear-gradient(135deg,#0088ff,#9d4edd); color:#fff; border:none; border-radius:12px; font-weight:800; cursor:pointer; font-family:inherit; font-size:1rem;">
                إرسال الإجابات <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('submit-survey-btn').addEventListener('click', function () {
        const btn = this;
        btn.disabled = true;
        btn.innerHTML = 'جاري الإرسال... <i class="fas fa-spinner fa-spin"></i>';

        const answers = Array.from(document.querySelectorAll('.survey-answer-input')).map(el => ({
            question: questions[parseInt(el.getAttribute('data-q-index'))],
            answer: el.value.trim()
        }));

        const finish = () => {
            overlay.remove();
            showSurveyThankYou(() => onDone());
        };

        if (typeof db !== 'undefined') {
            // بتتحفظ جوه نفس مستند إجابات الامتحان بتاع الطالب، عشان تتعرض مع بعض في الأدمن
            const uniqueDocId = getUniqueDocId(studentCode || studentName, examId);
            db.collection("students").doc(uniqueDocId).set({
                surveyAnswers: answers,
                surveySubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).then(finish).catch(() => finish());
        } else {
            finish();
        }
    });
}

function showSurveyThankYou(onDone) {
    const overlay = document.createElement('div');
    overlay.id = 'survey-thankyou-modal';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.92); backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 100002; direction: rtl; font-family: 'Cairo', sans-serif;
    `;
    overlay.innerHTML = `
        <style>
            @keyframes thankYouPop {
                0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
                60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
                100% { transform: scale(1) rotate(0deg); opacity: 1; }
            }
            @keyframes thankYouFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            #survey-thankyou-modal .ty-emoji { animation: thankYouPop 0.6s cubic-bezier(.34,1.56,.64,1) both, thankYouFloat 2s ease-in-out 0.6s infinite; }
            #survey-thankyou-modal .ty-text { animation: thankYouPop 0.6s 0.15s cubic-bezier(.34,1.56,.64,1) both; }
        </style>
        <div style="text-align:center;">
            <div class="ty-emoji" style="font-size:5rem; margin-bottom:10px;">🙏💜</div>
            <h2 class="ty-text" style="color:#fff; font-size:1.6rem; margin:0;">شكراً لك!</h2>
            <p class="ty-text" style="color:#94a3b8; margin-top:8px; font-size:0.95rem;">إجاباتك وصلتنا، تقييمك بيفرق معانا 🌟</p>
        </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            onDone();
        }, 400);
    }, 1800);
}

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
    const cheer = pct >= 85 ? 'ممتاز! استمر <i class="fas fa-fire"></i>' : (pct >= 50 ? 'كويس! تقدر تبقى أحسن <i class="fas fa-hand-fist"></i>' : 'متزعلش، راجع إجاباتك وهتتحسن <i class="fas fa-wand-magic-sparkles"></i>');

    const cancelledBody = `
            <div style="font-size: 3rem; margin-bottom: 6px;"><i class="fas fa-ban"></i></div>
            <h3 style="color:#ef4444; margin: 0 0 4px; font-size: 1.3rem;">امتحانك ملغي</h3>
            <p style="color:#94a3b8; margin: 0 0 18px; font-size: 0.92rem;">${escapeHtml(info.examTitle)}</p>
            <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); border-radius: 16px; padding: 16px; margin-bottom: 14px;">
                <p style="color:#fca5a5; margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.8;">امتحانك ملغي، يرجى التواصل مع الدعم.</p>
            </div>`;
    const body = info.cancelled ? cancelledBody : info.released
        ? `
            <div style="font-size: 3rem; margin-bottom: 6px;"><i class="fas fa-champagne-glasses"></i></div>
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
            <div style="font-size: 3rem; margin-bottom: 6px;"><i class="fas fa-circle-check"></i></div>
            <h3 style="color:#fff; margin: 0 0 4px; font-size: 1.3rem;">تم تسليم الامتحان بنجاح</h3>
            <p style="color:#94a3b8; margin: 0 0 18px; font-size: 0.92rem;">${escapeHtml(info.examTitle)}</p>
            <div style="background: rgba(241,196,15,0.08); border: 1px solid rgba(241,196,15,0.4); border-radius: 16px; padding: 16px; margin-bottom: 14px;">
                <div style="color:#f1c40f; font-size: 1.4rem; font-weight: 900;"><i class="fas fa-hourglass-half"></i> قيد التصحيح</div>
                <p style="color:#cbd5e1; margin: 8px 0 0; font-size: 0.88rem; line-height: 1.8;">الامتحان فيه أسئلة مقالية والمعلم هيراجعها. إجاباتك محفوظة وتقدر تشوفها من <strong>حسابي</strong>.</p>
            </div>`;

    overlay.innerHTML = `
        <div style="background: #1e1e38; padding: 26px; border-radius: 20px; max-width: 420px; width: 95%; text-align: center; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
            ${body}
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button onclick="closeSubmissionResultModal('account')" style="padding: 11px 20px; background: linear-gradient(135deg,#0088ff,#9d4edd); color:#fff; border:none; border-radius:12px; font-weight:800; cursor:pointer; font-family:inherit;"><i class="fas fa-chart-column"></i> روح لحسابي</button>
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

async function resetStudentExamByAdmin(studentFullName, subjectKey, studentCode = "") {
    if (typeof db === 'undefined' || (!studentFullName && !studentCode) || !subjectKey) {
        showCustomToast("<i class='fas fa-circle-xmark'></i> بيانات الطالب أو الامتحان غير مكتملة!", "error");
        return;
    }

    const uniqueDocId = getUniqueDocId(studentCode || studentFullName, subjectKey);

    try {
        await db.collection("students").doc(uniqueDocId).delete();

        localStorage.removeItem('finished_' + subjectKey);
        localStorage.removeItem('saved_exam_answers_' + subjectKey);
        localStorage.removeItem('active_running_exam_session');

        showCustomToast(`<i class="fas fa-circle-check"></i> تم إعادة فتح الامتحان بنجاح للطالب (${studentFullName})!`, "success");
        
        updateExamButtonsStatus();

    } catch (error) {
        console.error("خطأ في إعادة الامتحان للطالب:", error);
        showCustomToast("<i class='fas fa-circle-xmark'></i> حدث خطأ أثناء إعادة الامتحان للطالب.", "error");
    }
}

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
            showCustomToast(`<i class="fas fa-trash"></i> تم مسح ${deletedCount} امتحان قديم بنجاح!`, "success");
            loadAssignedExam();
        }
    } catch (e) {
        console.error("خطأ أثناء حذف الامتحانات القديمة:", e);
    }
}

// ==========================================
// <i class="fas fa-book"></i> الوحدات والمحتوى التعليمي
// ==========================================
let studentUnitsCache = [];
let examLockedIdsCache = new Set();
let finishedExamStatsCache = new Map();

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
let videoPurchasesCache = new Set();

async function loadVideoPurchasesCache() {
    videoPurchasesCache = new Set();
    if (typeof db === 'undefined') return;
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    if (!code) return;
    try {
        const snap = await db.collection("video_purchases").where("studentCode", "==", code).get();
        snap.forEach(d => { const it = d.data().itemId; if (it) videoPurchasesCache.add(it); });
    } catch (e) {
        console.warn("تعذر تحميل مشتريات الفيديو:", e);
    }
}

let examLockStateLoaded = false;

async function loadExamLocksCache() {
    examLockedIdsCache = new Set();
    examLockStateLoaded = false;
    if (typeof db === 'undefined') return;
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    if (!code) return;
    try {
        const [locksSnap, byStudentCode, byCode] = await Promise.all([
            db.collection("exam_locks").where("studentCode", "==", code).get(),
            db.collection("students").where("studentCode", "==", code).get(),
            db.collection("students").where("code", "==", code).get()
        ]);
        locksSnap.forEach(d => { const ex = d.data().examId; if (ex) examLockedIdsCache.add(ex); });
        [byStudentCode, byCode].forEach(snap => snap.forEach(d => {
            const data = d.data();
            const ex = data.examId || data.examCode;
            if (ex && (data.hasSubmitted === true || data.isSubmitted === true)) examLockedIdsCache.add(ex);
        }));
        examLockStateLoaded = true;

        // لو الأدمن عمل "إعادة الامتحان": نشيل علامة التسليم القديمة المحفوظة على جهاز الطالب
        const stale = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('finished_')) {
                const examId = key.replace('finished_', '');
                if (!examLockedIdsCache.has(examId) && !isExamSessionActive(examId)) stale.push(key, 'saved_exam_answers_' + examId);
            }
        }
        stale.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn("تعذر تحميل أقفال الامتحانات:", e);
    }
}

// هل الطالب سلّم الامتحان فعلاً؟ (السيرفر هو المرجع، والجهاز فقط عند تعذر الاتصال)
function isExamSubmittedForStudent(examId) {
    if (examLockStateLoaded) return examLockedIdsCache.has(examId);
    return !!localStorage.getItem('finished_' + examId) || examLockedIdsCache.has(examId);
}

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
            el.innerHTML = '<i class="fas fa-lock"></i> قفل الامتحان الآن';
            el.classList.add('closed-now');
            renderUnitsSection();
        } else {
            el.innerHTML = '<i class="fas fa-hourglass-half"></i> يُقفل الامتحان خلال: ' + text;
        }
    });
}

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

// ==========================================
// مشغّل الفيديو الخاص (أزرار الموقع + علامة مائية باسم الطالب)
// ==========================================
let _ytApiPromise = null;
let _vp = null;

function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (_ytApiPromise) return _ytApiPromise;
    _ytApiPromise = new Promise((resolve, reject) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(); };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = () => { _ytApiPromise = null; reject(new Error('yt api failed')); };
        document.head.appendChild(s);
    });
    return _ytApiPromise;
}

function vpFmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}

function vpInjectStyles() {
    if (document.getElementById('vp-styles')) return;
    const st = document.createElement('style');
    st.id = 'vp-styles';
    st.textContent = `
#vp-box{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:14px;overflow:hidden;user-select:none;-webkit-user-select:none}
#vp-box:fullscreen,#vp-box.vp-pseudo-fs{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;aspect-ratio:auto;border-radius:0;z-index:100001}
#vp-box:-webkit-full-screen{width:100%;height:100%;aspect-ratio:auto;border-radius:0}
#vp-stage{position:absolute;inset:0}
#vp-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
#vp-shield{position:absolute;inset:0 0 50px 0;z-index:2;cursor:pointer;display:flex;align-items:center;justify-content:center}
#vp-bigplay{width:70px;height:70px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:28px;display:none;align-items:center;justify-content:center;pointer-events:none}
#vp-corner{position:absolute;top:0;right:0;width:70px;height:70px;z-index:3}
#vp-wm{position:absolute;z-index:5;pointer-events:none;color:rgba(255,255,255,.35);font-weight:800;font-size:clamp(11px,2.2vw,17px);text-shadow:0 0 4px rgba(0,0,0,.9);transition:top 1.5s ease,left 1.5s ease;white-space:nowrap;unicode-bidi:plaintext}
#vp-wm2{position:absolute;z-index:5;pointer-events:none;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);color:rgba(255,255,255,.12);font-weight:900;font-size:clamp(16px,4vw,34px);white-space:nowrap;text-shadow:0 0 4px rgba(0,0,0,.6);unicode-bidi:plaintext}
#vp-controls{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(transparent,rgba(0,0,0,.9));direction:ltr;color:#fff;font-family:inherit;font-size:13px}
#vp-controls .vp-btn,#vp-fs-float{background:none;border:0;color:#fff;font-size:17px;cursor:pointer;padding:4px 8px;font-family:inherit}
#vp-controls .vp-time{min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
#vp-seek{flex:1;accent-color:#e74c3c;cursor:pointer}
#vp-fs-float{position:absolute;top:8px;left:8px;z-index:6;background:rgba(0,0,0,.55);border-radius:8px}

.vp-wrap{width:min(100%,calc((100vh - 70px) * 16 / 9));width:min(100%,calc((100dvh - 70px) * 16 / 9));max-width:900px}
.vp-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.vp-head strong{color:#fff;font-size:1.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.vp-head button{flex:none}
.vp-help{text-align:center;margin-top:6px}
.vp-help button{background:#334155;color:#fff;border:0;border-radius:8px;padding:5px 11px;font-family:inherit;font-size:.74rem;font-weight:700;cursor:pointer}
.vp-help-note{color:#94a3b8;font-size:.66rem;margin-top:4px;line-height:1.5}
@media (max-height:480px){
  .vp-help-note{display:none}
  .vp-help{margin-top:3px}
  .vp-help button{padding:3px 9px;font-size:.68rem}
  #video-modal{padding:6px !important}
  .vp-wrap{width:min(100%,calc((100vh - 46px) * 16 / 9));width:min(100%,calc((100dvh - 46px) * 16 / 9))}
  .vp-wrap.vp-has-help{width:min(100%,calc((100vh - 74px) * 16 / 9));width:min(100%,calc((100dvh - 74px) * 16 / 9))}
  .vp-head{margin-bottom:6px}
  .vp-head strong{font-size:.9rem}
  .vp-head button{padding:5px 12px !important;font-size:.85rem}
}
@media (pointer:coarse){
  #vp-controls{gap:2px;padding:10px 8px}
  #vp-controls .vp-btn{font-size:20px;padding:8px 10px;min-width:42px;min-height:42px}
  #vp-controls .vp-time{font-size:12px;min-width:38px}
  #vp-seek{height:28px}
  #vp-fs-float{font-size:20px;padding:8px 12px}
}
#vp-box:fullscreen #vp-controls,#vp-box.vp-pseudo-fs #vp-controls{padding-bottom:max(12px,env(safe-area-inset-bottom))}
`;
    document.head.appendChild(st);
}

function openVideoModal(title, url) {
    const embed = toEmbedUrl(url);
    if (!embed) {
        window.open(url, '_blank', 'noopener');
        return;
    }
    closeVideoModal();
    vpInjectStyles();

    const name = (localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "").trim();
    const code = (localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "").trim();
    const wmText = escapeHtml([name, code].filter(Boolean).join(' • ') || 'طالب');

    const isYT = /youtube\.com\/embed\//.test(embed);
    const isDrive = embed.indexOf('drive.google.com') !== -1;
    const isVimeo = embed.indexOf('player.vimeo.com') !== -1;
    const otherSrc = isVimeo ? embed + (embed.indexOf('?') === -1 ? '?' : '&') + 'title=0&byline=0&portrait=0&dnt=1' : embed;

    const modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.93);z-index:100000;display:flex;justify-content:center;align-items:center;padding:14px;direction:rtl;';
    modal.innerHTML = `
        <div class="vp-wrap${isDrive ? ' vp-has-help' : ''}">
            <div class="vp-head">
                <strong><i class="fas fa-clapperboard"></i> ${escapeHtml(title)}</strong>
                <button onclick="closeVideoModal()" style="background:#e74c3c;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-weight:800;cursor:pointer;font-family:inherit;"><i class="fas fa-xmark"></i> إغلاق</button>
            </div>
            <div id="vp-box">
                <div id="vp-stage">${isYT ? '<div id="vp-yt"></div>' : `<iframe src="${otherSrc}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`}</div>
                ${isYT ? `<div id="vp-shield"><div id="vp-bigplay"><i class="fas fa-play"></i></div></div>` : ''}
                ${isDrive ? '<div id="vp-corner"></div>' : ''}
                <div id="vp-wm">${wmText}</div>
                <div id="vp-wm2">${wmText}</div>
                ${isYT ? `
                <div id="vp-controls">
                    <button class="vp-btn" id="vp-play"><i class="fas fa-play"></i></button>
                    <span class="vp-time" id="vp-cur">0:00</span>
                    <input type="range" id="vp-seek" min="0" max="1000" value="0">
                    <span class="vp-time" id="vp-dur">0:00</span>
                    <button class="vp-btn" id="vp-mute"><i class="fas fa-volume-high"></i></button>
                    <button class="vp-btn" id="vp-speed">1x</button>
                    <button class="vp-btn" id="vp-fs"><i class="fas fa-expand"></i></button>
                </div>` : `<button id="vp-fs-float"><i class="fas fa-expand"></i></button>`}
            </div>
            ${isDrive ? `<div class="vp-help"><button type="button" id="vp-reload"><i class="fas fa-rotate"></i> الفيديو مش بيشتغل؟ اضغط هنا</button><div class="vp-help-note">لو ظهرت رسالة خطأ: اقفل باقي حسابات جوجل أو جرّب متصفح تاني</div></div>` : ''}
        </div>
    `;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeVideoModal(); });
    document.body.appendChild(modal);

    const box = modal.querySelector('#vp-box');
    box.addEventListener('contextmenu', (e) => e.preventDefault());

    _vp = { modal, box, player: null, timer: null, wmTimer: null, seeking: false };

    // العلامة المائية المتحركة
    const wm = modal.querySelector('#vp-wm');
    const moveWm = () => {
        wm.style.top = (6 + Math.random() * 78) + '%';
        wm.style.left = (4 + Math.random() * 55) + '%';
    };
    moveWm();
    _vp.wmTimer = setInterval(moveWm, 6000);

    // ملء الشاشة (على صندوق المشغّل عشان العلامة المائية تفضل ظاهرة)
    const fsBtn = modal.querySelector('#vp-fs') || modal.querySelector('#vp-fs-float');
    const isFs = () => document.fullscreenElement === box || document.webkitFullscreenElement === box || box.classList.contains('vp-pseudo-fs');
    const setFsIcon = () => { fsBtn.innerHTML = '<i class="fas fa-' + (isFs() ? 'compress' : 'expand') + '"></i>'; };
    const lockLandscape = () => { try { if (screen.orientation && screen.orientation.lock && window.matchMedia('(pointer:coarse)').matches) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
    const unlockOrientation = () => { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} };
    const toggleFs = () => {
        if (isFs()) {
            if (box.classList.contains('vp-pseudo-fs')) box.classList.remove('vp-pseudo-fs');
            else if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            unlockOrientation();
        } else if (box.requestFullscreen) {
            box.requestFullscreen().then(lockLandscape).catch(() => { box.classList.add('vp-pseudo-fs'); lockLandscape(); });
        } else if (box.webkitRequestFullscreen) {
            box.webkitRequestFullscreen();
            lockLandscape();
        } else {
            box.classList.add('vp-pseudo-fs');
        }
        setTimeout(setFsIcon, 150);
    };
    fsBtn.addEventListener('click', toggleFs);
    const reloadBtn = modal.querySelector('#vp-reload');
    if (reloadBtn) {
        let tries = 0;
        reloadBtn.addEventListener('click', () => {
            tries++;
            const f = modal.querySelector('#vp-stage iframe');
            if (f) f.src = embed + '?authuser=' + ((tries - 1) % 3) + '&r=' + Date.now();
        });
    }
    _vp.onFs = setFsIcon;
    document.addEventListener('fullscreenchange', _vp.onFs);
    document.addEventListener('webkitfullscreenchange', _vp.onFs);

    if (!isYT) return;

    // ===== مشغّل يوتيوب بأزرار الموقع =====
    const playBtn = modal.querySelector('#vp-play');
    const bigPlay = modal.querySelector('#vp-bigplay');
    const seek = modal.querySelector('#vp-seek');
    const curEl = modal.querySelector('#vp-cur');
    const durEl = modal.querySelector('#vp-dur');
    const muteBtn = modal.querySelector('#vp-mute');
    const speedBtn = modal.querySelector('#vp-speed');
    const shield = modal.querySelector('#vp-shield');
    const rates = [1, 1.25, 1.5, 2, 0.75];
    let rateIdx = 0;

    const setPlayingUi = (playing) => {
        playBtn.innerHTML = '<i class="fas fa-' + (playing ? 'pause' : 'play') + '"></i>';
        bigPlay.style.display = playing ? 'none' : 'flex';
    };
    setPlayingUi(false);

    const togglePlay = () => {
        const p = _vp && _vp.player;
        if (!p || !p.getPlayerState) return;
        if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
    };
    playBtn.addEventListener('click', togglePlay);
    shield.addEventListener('click', togglePlay);

    muteBtn.addEventListener('click', () => {
        const p = _vp && _vp.player;
        if (!p || !p.isMuted) return;
        if (p.isMuted()) p.unMute(); else p.mute();
        muteBtn.innerHTML = '<i class="fas fa-volume-' + (p.isMuted() ? 'xmark' : 'high') + '"></i>';
    });

    speedBtn.addEventListener('click', () => {
        const p = _vp && _vp.player;
        if (!p || !p.setPlaybackRate) return;
        rateIdx = (rateIdx + 1) % rates.length;
        p.setPlaybackRate(rates[rateIdx]);
        speedBtn.textContent = rates[rateIdx] + 'x';
    });

    seek.addEventListener('input', () => {
        _vp.seeking = true;
        const p = _vp.player;
        if (p && p.getDuration) curEl.textContent = vpFmt((seek.value / 1000) * p.getDuration());
    });
    seek.addEventListener('change', () => {
        const p = _vp.player;
        if (p && p.getDuration) p.seekTo((seek.value / 1000) * p.getDuration(), true);
        _vp.seeking = false;
    });

    const fallbackToPlainIframe = () => {
        if (!_vp || _vp.modal !== modal) return;
        const stage = modal.querySelector('#vp-stage');
        stage.innerHTML = `<iframe src="${embed}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
        const c = modal.querySelector('#vp-controls'); if (c) c.remove();
        if (shield) shield.remove();
        if (_vp.timer) clearInterval(_vp.timer);
    };

    loadYouTubeApi().then(() => {
        if (!_vp || _vp.modal !== modal) return;
        const vid = (embed.match(/embed\/([^?/]+)/) || [])[1];
        _vp.player = new YT.Player('vp-yt', {
            videoId: vid,
            playerVars: Object.assign({ controls: 0, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0 }, /^https?:$/.test(location.protocol) ? { origin: location.origin } : {}),
            events: {
                onStateChange: (e) => setPlayingUi(e.data === 1),
                onError: (e) => {
                    const codes = {
                        2: 'رابط الفيديو غير صحيح',
                        5: 'مشكلة في مشغّل المتصفح، جرّب متصفح تاني',
                        100: 'الفيديو محذوف أو خاص (Private). خليه "غير مدرج" (Unlisted)',
                        101: 'صاحب الفيديو مقفّل التضمين. فعّل "السماح بالتضمين" في YouTube Studio',
                        150: 'صاحب الفيديو مقفّل التضمين. فعّل "السماح بالتضمين" في YouTube Studio',
                        153: 'YouTube مش عارف الموقع اللي بيشغّل الفيديو (Referer). افتح الموقع من رابط http/https بدل ما يكون ملف مباشر'
                    };
                    const msg = codes[e.data] || 'الفيديو غير متاح للتشغيل حالياً، تواصل مع الدعم.';
                    const stage = modal.querySelector('#vp-stage');
                    if (stage) stage.innerHTML = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;padding:20px;gap:8px;"><div>' + msg + '</div><div style="font-size:12px;opacity:.6;direction:ltr;">Error ' + e.data + '</div></div>';
                }
            }
        });
        _vp.timer = setInterval(() => {
            const p = _vp && _vp.player;
            if (!p || !p.getDuration) return;
            const d = p.getDuration() || 0;
            const t = p.getCurrentTime ? p.getCurrentTime() : 0;
            durEl.textContent = vpFmt(d);
            if (!_vp.seeking) {
                curEl.textContent = vpFmt(t);
                seek.value = d ? Math.round((t / d) * 1000) : 0;
            }
        }, 300);
    }).catch(fallbackToPlainIframe);
}

function closeVideoModal() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    if (_vp) {
        if (_vp.timer) clearInterval(_vp.timer);
        if (_vp.wmTimer) clearInterval(_vp.wmTimer);
        document.removeEventListener('fullscreenchange', _vp.onFs);
        document.removeEventListener('webkitfullscreenchange', _vp.onFs);
        try { if (_vp.player && _vp.player.destroy) _vp.player.destroy(); } catch (e) {}
        try {
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (e) {}
        _vp = null;
    }
    const modal = document.getElementById('video-modal');
    if (modal) modal.remove();
}

function toggleUnitAccordion(unitId) {
    const acc = document.getElementById('unit-acc-' + unitId);
    if (acc) acc.classList.toggle('open');
}

// ==========================================
// <i class="fas fa-puzzle-piece"></i> عناصر مشتركة لعرض "الوحدة" (تستخدم في المحتوى العام وجوه الكورسات)
// ==========================================
const UNIT_ITEM_ICONS = { file: '<i class="fas fa-file-lines"></i>', video: '<i class="fas fa-play"></i>', exam: '<i class="fas fa-pen-to-square"></i>' };
const UNIT_ITEM_BTN_TEXT = { file: 'فتح الملف', video: 'مشاهدة', exam: 'ابدأ الامتحان' };

function buildUnitItemRowHtml(it, openCallExpr) {
    let label = UNIT_ITEM_BTN_TEXT[it.type] || 'فتح';
    let disabled = false;
    let reasonHtml = '';
    let detailsHtml = '';
    let rowExtraClass = '';
    const desc = it.description || it.desc || '';

    if (it.type === 'exam') {
        const examObj = (window.__allExamsRaw || []).find(e => e.id === it.examId);
        const hasSubmitted = isExamSubmittedForStudent(it.examId);
        const available = !!(dynamicExamsDatabase && dynamicExamsDatabase[it.examId]);
        const closeTs = (examObj && examObj.closesAt) ? new Date(examObj.closesAt).getTime() : NaN;
        const isHardClosed = !!(examObj && (examObj.isClosed === true || (!isNaN(closeTs) && Date.now() >= closeTs)));

        const statParts = [];
        if (desc) statParts.push(`<i class="fas fa-pen-to-square"></i> ${escapeHtml(desc)}`);
        if (examObj) {
            statParts.push(`<i class="fas fa-circle-question"></i> عدد الأسئلة: ${(examObj.questions || []).length} سؤال`);
            statParts.push(`<i class="fas fa-stopwatch"></i> مدة الامتحان: ${examObj.duration || 30} دقيقة`);
        }
        if (statParts.length) detailsHtml = `<div class="unit-row-stats">${statParts.map(x => `<span>${x}</span>`).join('')}</div>`;

        if (hasSubmitted) {
            label = 'تم التسليم <i class="fas fa-circle-check"></i>';
            disabled = true;
            rowExtraClass = ' unit-row-done';

            const stats = finishedExamStatsCache.get(it.examId);
            if (stats) {
                const released = stats.canReview === true;
                const scoreChip = released
                    ? `<div class="exam-result-chip score"><i class="fas fa-trophy"></i> <b>${escapeHtml(stats.score || '')}</b>${stats.percentage ? ' (' + escapeHtml(stats.percentage) + ')' : ''}</div>`
                    : `<div class="exam-result-chip pending"><i class="fas fa-hourglass-half"></i> <b>قيد التصحيح</b></div>`;
                const metaChips = [];
                if (stats.startTime) metaChips.push(`<span><i class="fas fa-circle"></i> بدأ: ${escapeHtml(stats.startTime)}</span>`);
                if (stats.endTime) metaChips.push(`<span><i class="fas fa-flag-checkered"></i> سلّم: ${escapeHtml(stats.endTime)}</span>`);
                if (stats.durationTaken) metaChips.push(`<span><i class="fas fa-stopwatch"></i> المدة: ${escapeHtml(stats.durationTaken)}</span>`);
                detailsHtml += `
                    <div class="exam-result-panel">
                        ${scoreChip}
                        ${metaChips.length ? `<div class="exam-result-meta">${metaChips.join('')}</div>` : ''}
                        ${released && stats.answers && stats.answers.length ? `<button class="course-btn" style="margin-top:10px;padding:10px;" onclick="openAnswersReviewModal('${stats.id || stats.serial}')"><i class="fas fa-clipboard-list"></i> عرض تفاصيل الإجابة</button>` : ''}
                    </div>`;
            }
        } else if (isHardClosed) {
            label = '<i class="fas fa-triangle-exclamation"></i> أول إنذار';
            disabled = true;
            rowExtraClass = ' unit-row-locked';
            reasonHtml = `<div class="unit-row-sub" style="color:#ff4d6d;"><i class="fas fa-lock"></i> الامتحان اتقفل ولم تقم بحله</div>`;
        } else if (!available) {
            label = 'غير متاح حالياً';
            disabled = true;
            const why = getExamUnavailableReason(it.examId);
            if (why) reasonHtml = `<div class="unit-row-sub">${escapeHtml(why)}</div>`;
        } else if (!isNaN(closeTs) && closeTs > Date.now()) {
            detailsHtml += `<div class="unit-countdown" data-closes-at="${closeTs}"><i class="fas fa-hourglass-half"></i> يُقفل الامتحان خلال: ${escapeHtml(formatCountdown(closeTs - Date.now()) || '')}</div>`;
        }
    } else if (it.type === 'video') {
        const viewKey = 'video_views_' + it.id;
        const watched = parseInt(localStorage.getItem(viewKey) || '0', 10);
        const remaining = it.maxViews ? Math.max(it.maxViews - watched, 0) : null;
        const price = parseFloat(it.price) || 0;
        const purchased = videoPurchasesCache.has(it.id);

        const statParts = [];
        if (desc) statParts.push(`<i class="fas fa-pen-to-square"></i> ${escapeHtml(desc)}`);
        if (it.durationMin) statParts.push(`<i class="fas fa-stopwatch"></i> مدة الفيديو: ${it.durationMin} دقيقة`);
        if (remaining !== null) statParts.push(`<i class="fas fa-eye"></i> المشاهدات المتبقية لك: ${remaining}`);
        if (price > 0) statParts.push(`<i class="fas fa-tag"></i> السعر: ${price} جنيه`);
        if (price > 0 && purchased) statParts.push(`<i class="fas fa-circle-check"></i> تم شراء هذا الفيديو`);
        if (statParts.length) detailsHtml = `<div class="unit-row-stats">${statParts.map(x => `<span>${x}</span>`).join('')}</div>`;

        if (price > 0 && !purchased) {
            label = '<i class="fas fa-lock"></i> اشترِ الفيديو';
            rowExtraClass = ' unit-row-locked';
            reasonHtml = `<div class="unit-row-sub" style="color:#f1c40f;"><i class="fas fa-circle-info"></i> فيديو مدفوع (${price} جنيه) — يرجى التواصل مع الدعم الفني لشراء الفيديو</div>`;
        } else if (remaining === 0) {
            label = 'انتهت مرات المشاهدة'; disabled = true;
        }
    } else if (desc) {
        detailsHtml = `<div class="unit-row-stats"><span><i class="fas fa-pen-to-square"></i> ${escapeHtml(desc)}</span></div>`;
    }

    return `
        <div class="unit-row unit-row-${it.type}${rowExtraClass}">
            <div class="unit-row-icon">${UNIT_ITEM_ICONS[it.type] || '<i class="fas fa-thumbtack"></i>'}</div>
            <div class="unit-row-main">
                <div class="unit-row-title">${escapeHtml(it.title)}${reasonHtml}</div>
                ${detailsHtml}
            </div>
            <button class="unit-row-btn" ${disabled ? 'disabled' : ''} onclick="${openCallExpr}">${label}</button>
        </div>
    `;
}

function buildUnitAccordionHtml(unit, idx, rowsHtml) {
    return `
        <div class="unit-acc ${idx === 0 ? 'open' : ''}" id="unit-acc-${unit.id}">
            <button class="unit-acc-head" onclick="toggleUnitAccordion('${unit.id}')">
                <span class="unit-acc-chevron"><i class="fas fa-chevron-down"></i></span>
                <span class="unit-acc-title">${escapeHtml(unit.title)}</span>
                <span class="unit-acc-count">${(Array.isArray(unit.items) ? unit.items.length : 0)}</span>
            </button>
            <div class="unit-acc-body">${rowsHtml}</div>
        </div>
    `;
}

async function renderUnitsSection() {
    const box = document.getElementById('units-list');
    if (!box) return;

    clearInterval(unitsCountdownTimer);

    if (typeof db === 'undefined') {
        box.innerHTML = "<p style='text-align:center;color:#e74c3c;'><i class='fas fa-circle-xmark'></i> تعذر الاتصال بقاعدة البيانات.</p>";
        return;
    }

    box.innerHTML = "<p style='text-align:center;color:var(--text-sub);'><i class='fas fa-hourglass-half'></i> جاري تحميل المحتوى...</p>";

    try { if (window.__examsReady) await window.__examsReady; } catch (e) {}
    await Promise.all([loadExamLocksCache(), loadFinishedExamStatsCache(), loadVideoPurchasesCache()]);

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
            box.innerHTML = "<p style='text-align:center;color:#cbd5e1;padding:25px;'><i class='fas fa-inbox'></i> لا يوجد محتوى منشور حالياً.</p>";
            return;
        }

        box.innerHTML = units.map((unit, idx) => {
            const items = Array.isArray(unit.items) ? unit.items : [];
            const rows = items.length === 0
                ? `<div class="unit-row-empty">لا يوجد محتوى في هذه الوحدة بعد.</div>`
                : items.map(it => buildUnitItemRowHtml(it, `openUnitItem('${unit.id}', '${it.id}')`)).join('');
            return buildUnitAccordionHtml(unit, idx, rows);
        }).join('');

        clearInterval(unitsCountdownTimer);
        unitsCountdownTimer = setInterval(tickUnitCountdowns, 30000);
    } catch (err) {
        console.error("خطأ في تحميل الوحدات:", err);
        box.innerHTML = "<p style='text-align:center;color:#e74c3c;'><i class='fas fa-circle-xmark'></i> تعذر تحميل المحتوى. حاول مرة أخرى.</p>";
    }
}

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
        if ((parseFloat(it.price) || 0) > 0 && !videoPurchasesCache.has(it.id)) {
            showCustomToast("<i class='fas fa-lock'></i> هذا الفيديو مدفوع، يرجى التواصل مع الدعم الفني لشراء الفيديو.", "warning");
            return;
        }
        const viewKey = 'video_views_' + it.id;
        const watched = parseInt(localStorage.getItem(viewKey) || '0', 10);
        if (it.maxViews && watched >= it.maxViews) {
            showCustomToast("<i class='fas fa-lock'></i> خلّصت عدد مرات المشاهدة المتاحة لهذا الفيديو.", "warning");
            return;
        }
        localStorage.setItem(viewKey, String(watched + 1));
        openVideoModal(it.title, it.url);
        renderUnitsSection();
    } else if (it.type === 'exam') {
        window.currentCourseIdForExam = null;
        resetPortalToStep1(it.examId, 'exam');
    }
}

// ==========================================
// <i class="fas fa-graduation-cap"></i> نظام الكورسات والاشتراكات
// ==========================================
let coursesCache = [];
let subscriptionsCache = new Map();
let activeCourseId = null;

function currentStudentIdentity() {
    return (localStorage.getItem('student_code') || localStorage.getItem('exam_code') || localStorage.getItem('student_fullname') || '').trim();
}
function courseSubscriptionId(courseId) { return getUniqueDocId(currentStudentIdentity(), courseId); }

async function loadCourseData() {
    if (typeof db === 'undefined' || !currentStudentIdentity()) return;
    const [coursesSnap, subsSnap] = await Promise.all([
        db.collection('courses').get(),
        db.collection('course_enrollments').where('studentKey', '==', currentStudentIdentity()).get()
    ]);
    coursesCache = coursesSnap.docs.map(d => ({id:d.id, ...d.data()}));
    subscriptionsCache = new Map(subsSnap.docs.map(d => [d.data().courseId, {id:d.id, ...d.data()}]));
}

function courseMatchesStudent(course) {
    const stage = localStorage.getItem('student_stage') || '';
    return course.isPublished !== false && (!course.grade || course.grade === 'الكل' || course.grade === 'كل الصفوف' || !stage || course.grade === stage);
}

// <i class="fas fa-circle-check"></i> عرض الكورسات مع علامة <i class="fas fa-check"></i> على الصورة بعد الاشتراك
async function renderCoursesSection() {
    const box = document.getElementById('courses-list'); if (!box) return;
    box.innerHTML = '<p style="text-align:center;color:var(--text-sub);"><i class="fas fa-hourglass-half"></i> جاري تحميل الكورسات...</p>';
    try {
        await loadCourseData();
        const courses = coursesCache.filter(courseMatchesStudent);
        if (!courses.length) {
            box.innerHTML = '<p style="text-align:center;color:var(--text-sub);padding:30px;">لا توجد كورسات متاحة لصفك حالياً.</p>';
            return;
        }
        box.innerHTML = `<div class="courses-grid">${courses.map(c => {
            const enrolled = subscriptionsCache.has(c.id);
            return `<article class="course-card" style="position:relative;">
                ${enrolled ? '<span title="مشترك" style="position:absolute;top:10px;left:10px;z-index:5;background:linear-gradient(135deg,#00f5d4,#00b4d8);color:#000;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.5rem;box-shadow:0 4px 15px rgba(0,245,212,0.6);border:2px solid #fff;"><i class="fas fa-check"></i></span>' : ''}
                ${c.image ? `<img class="course-cover" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}">` : '<div class="course-cover" style="display:grid;place-items:center;font-size:55px;"><i class="fas fa-graduation-cap"></i></div>'}
                <div class="course-body">
                  ${enrolled ? '<span class="course-status"><i class="fas fa-check"></i> مشترك في الكورس</span>' : ''}
                  <div class="course-grade">${escapeHtml(c.grade || 'كل الصفوف')}</div>
                  <h3>${escapeHtml(c.title || 'كورس بدون اسم')}</h3>
                  <p>${escapeHtml(c.description || 'محتوى تعليمي متكامل: فيديوهات وملفات وامتحانات.')}</p>
                  <button class="course-btn" onclick="${enrolled ? `enterCourse('${c.id}')` : `requestCourseSubscription('${c.id}')`}">${enrolled ? '<i class="fas fa-bullseye"></i> دخول الكورس' : '<i class="fas fa-thumbtack"></i> اشترك في الكورس'}</button>
                </div>
            </article>`;
        }).join('')}</div>`;
    } catch (e) {
        box.innerHTML = '<p style="text-align:center;color:#ff718d;">تعذر تحميل الكورسات.</p>';
    }
}

// <i class="fas fa-circle-check"></i> اشتراك مع مودال تأكيد
async function requestCourseSubscription(courseId) {
    const course = coursesCache.find(c => c.id === courseId); if (!course) return;
    showSubscriptionConfirmModal(course, async () => {
        try {
            const key = currentStudentIdentity();
            await db.collection('course_enrollments').doc(courseSubscriptionId(courseId)).set({
                courseId,
                studentKey: key,
                studentName: localStorage.getItem('student_fullname') || '',
                studentCode: localStorage.getItem('student_code') || localStorage.getItem('exam_code') || '',
                grade: localStorage.getItem('student_stage') || '',
                enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
                source: 'student'
            }, { merge: true });
            showCustomToast('<i class="fas fa-champagne-glasses"></i> تم الاشتراك بنجاح! يمكنك دخول الكورس الآن.', 'success');
            await renderCoursesSection();
        } catch (e) {
            showCustomToast('تعذر إتمام الاشتراك. تأكد من إعداد صلاحيات قاعدة البيانات.', 'error');
        }
    });
}

// <i class="fas fa-circle-check"></i> مودال تأكيد الاشتراك
function showSubscriptionConfirmModal(course, onConfirm) {
    const old = document.getElementById('sub-confirm-modal'); if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'sub-confirm-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:center;z-index:100000;padding:16px;direction:rtl;font-family:'Cairo',sans-serif;`;
    modal.innerHTML = `
      <div style="background:linear-gradient(145deg,#1a2340,#0e1424);border:1px solid rgba(0,242,254,0.35);border-radius:22px;padding:28px 24px;max-width:460px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
        <div style="font-size:3rem;margin-bottom:10px;"><i class="fas fa-graduation-cap"></i></div>
        <h3 style="color:#00f2fe;margin-bottom:8px;font-size:1.35rem;">تأكيد الاشتراك في الكورس</h3>
        <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin:16px 0;text-align:right;">
          <p style="color:#fff;font-weight:800;margin-bottom:6px;"><i class="fas fa-book"></i> ${escapeHtml(course.title)}</p>
          <p style="color:#94a3b8;font-size:0.85rem;line-height:1.8;margin:0;">${escapeHtml(course.description || 'كورس تعليمي متكامل')}</p>
        </div>
        <div style="background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.3);border-radius:12px;padding:12px;margin-bottom:18px;text-align:right;">
          <p style="color:#f1c40f;font-weight:800;font-size:0.9rem;margin:0 0 6px;"><i class="fas fa-triangle-exclamation"></i> يرجى قراءة التعليمات جيداً:</p>
          <ul style="color:#cbd5e1;font-size:0.83rem;line-height:1.9;margin:0;padding-inline-start:20px;">
            <li>الاشتراك يمنحك وصولاً كاملاً لمحتوى الكورس.</li>
            <li>عدد مشاهدات الفيديو محدود حسب إعدادات المعلم.</li>
            <li>الامتحانات لا يمكن إعادتها بعد التسليم.</li>
          </ul>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="sub-confirm-yes" style="flex:1;padding:14px;background:linear-gradient(135deg,#00c896,#00b4d8);color:#000;border:none;border-radius:14px;font-weight:900;cursor:pointer;font-family:inherit;font-size:1rem;"><i class="fas fa-circle-check"></i> تأكيد</button>
          <button id="sub-confirm-no" style="flex:1;padding:14px;background:#334155;color:#fff;border:none;border-radius:14px;font-weight:800;cursor:pointer;font-family:inherit;font-size:1rem;"><i class="fas fa-xmark"></i> لا / إلغاء</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('sub-confirm-yes').onclick = () => { modal.remove(); onConfirm(); };
    document.getElementById('sub-confirm-no').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function renderSubscriptionsSection() {
    const box = document.getElementById('subscriptions-list'); if (!box) return;
    box.innerHTML = '<p style="text-align:center;color:var(--text-sub);"><i class="fas fa-hourglass-half"></i> جاري تحميل اشتراكاتك...</p>';
    try { await loadCourseData(); const mine = coursesCache.filter(c => subscriptionsCache.has(c.id));
        if (!mine.length) { box.innerHTML = '<div class="subscription-summary">لم تشترك في أي كورس بعد. اختَر كورساً من صفحة «الكورسات».</div>'; return; }
        box.innerHTML = `<div class="subscription-summary">أنت مشترك في <b>${mine.length}</b> كورس. علامة <i class="fas fa-check"></i> بجوار الكورس تؤكد اشتراكك.</div><div class="courses-grid">${mine.map(c => `<article class="course-card" style="position:relative;">${c.image ? `<span title="مشترك" style="position:absolute;top:10px;left:10px;z-index:5;background:linear-gradient(135deg,#00f5d4,#00b4d8);color:#000;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.3rem;border:2px solid #fff;"><i class="fas fa-check"></i></span>` : ''}<div class="course-body"><span class="course-status"><i class="fas fa-check"></i> اشتراك نشط</span><div class="course-grade">${escapeHtml(c.grade || '')}</div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description || '')}</p><button class="course-btn" onclick="enterCourse('${c.id}')">دخول الكورس <i class="fas fa-arrow-right"></i></button></div></article>`).join('')}</div>`;
    } catch(e) { box.innerHTML = '<p style="color:#ff718d;text-align:center;">تعذر تحميل الاشتراكات.</p>'; }
}

async function enterCourse(courseId) {
    if (!subscriptionsCache.has(courseId)) { await loadCourseData(); if (!subscriptionsCache.has(courseId)) return requestCourseSubscription(courseId); }
    activeCourseId = courseId;
    switchTab('units');
}

// ================= لوحة الرئيسية (الداشبورد) =================
async function renderHomeSection() {
    const savedEl = document.getElementById('home-stat-saved');
    const currentEl = document.getElementById('home-stat-current');
    const completedEl = document.getElementById('home-stat-completed');
    const progressValEl = document.getElementById('home-progress-value');
    const progressFillEl = document.getElementById('home-progress-fill');
    const subsBox = document.getElementById('home-subscriptions-list');

    if (savedEl) savedEl.textContent = '0';

    try {
        await loadCourseData();
        const myCourses = coursesCache.filter(c => subscriptionsCache.has(c.id));
        if (currentEl) currentEl.textContent = myCourses.length;

        try { await Promise.all([loadExamLocksCache(), loadFinishedExamStatsCache()]); } catch (e) {}

        let totalItems = 0, doneItems = 0, completedCourses = 0;
        myCourses.forEach(course => {
            let courseTotal = 0, courseDone = 0;
            (course.units || []).forEach(unit => {
                (unit.items || []).forEach(it => {
                    courseTotal++;
                    let isDone = false;
                    if (it.type === 'exam') {
                        isDone = isExamSubmittedForStudent(it.examId);
                    } else if (it.type === 'video') {
                        isDone = parseInt(localStorage.getItem('video_views_' + it.id) || '0', 10) > 0;
                    } else if (it.type === 'file') {
                        isDone = !!localStorage.getItem('file_opened_' + it.id);
                    }
                    if (isDone) courseDone++;
                });
            });
            totalItems += courseTotal;
            doneItems += courseDone;
            if (courseTotal > 0 && courseDone === courseTotal) completedCourses++;
        });

        if (completedEl) completedEl.textContent = completedCourses;
        const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
        if (progressValEl) progressValEl.textContent = '% ' + pct;
        if (progressFillEl) progressFillEl.style.width = pct + '%';

        if (subsBox) {
            if (!myCourses.length) {
                subsBox.innerHTML = '<div class="subscription-summary">لم تشترك في أي كورس بعد. اختَر كورساً من صفحة «الكورسات».</div>';
            } else {
                subsBox.innerHTML = `<div class="courses-grid">${myCourses.map(c => `
                    <article class="course-card">
                        ${c.image ? `<img src="${escapeHtml(c.image)}" class="course-cover">` : ''}
                        <div class="course-body">
                            <span class="course-status"><i class="fas fa-check"></i> اشتراك نشط</span>
                            <div class="course-grade">${escapeHtml(c.grade || '')}</div>
                            <h3>${escapeHtml(c.title)}</h3>
                            <p>${escapeHtml(c.description || '')}</p>
                            <button class="course-btn" onclick="enterCourse('${c.id}')">دخول الكورس <i class="fas fa-arrow-right"></i></button>
                        </div>
                    </article>
                `).join('')}</div>`;
            }
        }
    } catch (e) {
        console.error('تعذر تحميل بيانات الرئيسية:', e);
    }

    renderHomeActivityChart();
}

let homeChartInstance = null;
async function renderHomeActivityChart() {
    const canvas = document.getElementById('home-activity-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const dayLabels = ['السبت', 'الجمعة', 'الخميس', 'الأربعاء', 'الثلاثاء', 'الإثنين', 'الأحد'];
    const now = new Date();
    const jsDay = now.getDay(); // 0=Sunday ... 6=Saturday
    const daysSinceSaturday = (jsDay + 1) % 7;
    const startOfThisWeek = new Date(now); startOfThisWeek.setHours(0, 0, 0, 0); startOfThisWeek.setDate(now.getDate() - daysSinceSaturday);
    const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    const thisWeekCounts = new Array(7).fill(0);
    const lastWeekCounts = new Array(7).fill(0);

    try {
        const key = currentStudentIdentity();
        if (key && typeof db !== 'undefined') {
            const snap = await db.collection('course_activity').where('studentKey', '==', key).get();
            snap.forEach(doc => {
                const d = doc.data();
                const ts = d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate() : null;
                if (!ts) return;
                const diffDaysThis = Math.floor((ts - startOfThisWeek) / 86400000);
                const diffDaysLast = Math.floor((ts - startOfLastWeek) / 86400000);
                if (diffDaysThis >= 0 && diffDaysThis < 7) thisWeekCounts[diffDaysThis]++;
                else if (diffDaysLast >= 0 && diffDaysLast < 7) lastWeekCounts[diffDaysLast]++;
            });
        }
    } catch (e) { console.warn('تعذر تحميل بيانات النشاط:', e); }

    const orderedThis = [thisWeekCounts[0], thisWeekCounts[6], thisWeekCounts[5], thisWeekCounts[4], thisWeekCounts[3], thisWeekCounts[2], thisWeekCounts[1]];
    const orderedLast = [lastWeekCounts[0], lastWeekCounts[6], lastWeekCounts[5], lastWeekCounts[4], lastWeekCounts[3], lastWeekCounts[2], lastWeekCounts[1]];

    if (homeChartInstance) { homeChartInstance.destroy(); }
    homeChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dayLabels,
            datasets: [
                { label: 'الأسبوع الماضي', data: orderedLast, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,.15)', borderDash: [6, 4], tension: 0.4, pointBackgroundColor: '#2ecc71' },
                { label: 'الأسبوع الحالي', data: orderedThis, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,.15)', tension: 0.4, pointBackgroundColor: '#e74c3c' }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, suggestedMax: 10, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// <i class="fas fa-circle-check"></i> داخل الكورس: عرض الوحدات (وحدة أولى/ثانية/...) وكل وحدة فيها فيديوهات وملفات وامتحانات + الدرجة وتفاصيل الإجابة مباشرة
const originalRenderUnitsSection = renderUnitsSection;
renderUnitsSection = async function() {
    if (!activeCourseId) {
        const banner = document.getElementById('active-course-banner');
        if (banner) {
            try {
                await loadCourseData();
                const myCourses = coursesCache.filter(c => subscriptionsCache.has(c.id));
                // لو الطالب مشترك في كورس واحد بس، ادخله عليه طوالي بدل ما يدوس "دخول الكورس" تاني
                if (myCourses.length === 1) {
                    activeCourseId = myCourses[0].id;
                    return renderUnitsSection();
                }
                banner.innerHTML = myCourses.length
                    ? `<div class="course-hero"><div><small>الكورسات المشترك فيها</small><h3>${myCourses.map(c => `<span style="cursor:pointer;text-decoration:underline;" onclick="enterCourse('${c.id}')">${escapeHtml(c.title)}</span>`).join(' • ')}</h3></div><button class="course-btn" style="width:auto;padding:9px 15px;" onclick="switchTab('courses')">عرض الكورسات</button></div>`
                    : '';
            } catch (e) { banner.innerHTML = ''; }
        }
        return originalRenderUnitsSection();
    }

    const box = document.getElementById('units-list');
    if (!box) return;
    clearInterval(unitsCountdownTimer);

    try { if (window.__examsReady) await window.__examsReady; } catch (e) {}
    await Promise.all([loadExamLocksCache(), loadFinishedExamStatsCache(), loadVideoPurchasesCache()]);
    await loadCourseData();

    const course = coursesCache.find(c => c.id === activeCourseId);
    if (!course || !subscriptionsCache.has(course.id)) { activeCourseId = null; return renderUnitsSection(); }

    const banner = document.getElementById('active-course-banner');
    if (banner) banner.innerHTML = `<div class="course-hero"><div><small>أنت الآن داخل الكورس</small><h3><i class="fas fa-graduation-cap"></i> ${escapeHtml(course.title)}</h3></div><button class="course-btn" style="width:auto;padding:9px 15px;" onclick="exitCourse()">كل المحتوى</button></div>`;

    renderMistakePracticeCard(course);

    const units = (course.units || []).filter(u => u.isPublished !== false).sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!units.length) {
        box.innerHTML = '<div class="unit-row-empty">سيتم إضافة محتوى الكورس قريباً.</div>';
        return;
    }

    box.innerHTML = units.map((unit, idx) => {
        const items = Array.isArray(unit.items) ? unit.items : [];
        const rows = items.length === 0
            ? `<div class="unit-row-empty">لا يوجد محتوى في هذه الوحدة بعد.</div>`
            : items.map(it => buildUnitItemRowHtml(it, `openCourseUnitItem('${course.id}', '${unit.id}', '${it.id}')`)).join('');
        return buildUnitAccordionHtml(unit, idx, rows);
    }).join('');

    clearInterval(unitsCountdownTimer);
    unitsCountdownTimer = setInterval(tickUnitCountdowns, 30000);
};

function getMistakeQuestionsStorageKey(courseId) {
    return `mistake_questions_${currentStudentIdentity()}_${courseId}`;
}

function getCourseMistakeQuestions(courseId) {
    try {
        const value = JSON.parse(localStorage.getItem(getMistakeQuestionsStorageKey(courseId)) || '{}');
        return Object.entries(value || {}).map(([key, question]) => ({ key, ...question }));
    } catch (e) { return []; }
}

function renderMistakePracticeCard(course) {
    const old = document.getElementById('mistake-practice-card');
    if (old) old.remove();
    const box = document.createElement('section');
    box.id = 'mistake-practice-card';
    box.className = 'mistake-practice-card';
    // الميزة مقفولة مؤقتاً (قريباً)
    box.innerHTML = `
      <div class="mistake-practice-copy">
        <span class="mistake-practice-icon"><i class="fas fa-lightbulb"></i></span>
        <div><h3>أسئلة من أخطائك <span style="display:inline-block;margin-right:6px;padding:2px 10px;border-radius:999px;background:rgba(255,190,11,.2);color:#ffda63;font-size:.75rem;font-weight:800;">قريباً</span></h3><p>هذه الميزة ستتوفر قريباً.</p></div>
      </div>
      <button class="mistake-practice-btn" disabled><i class="fas fa-lock"></i> قريباً</button>`;
    const banner = document.getElementById('active-course-banner');
    if (banner) banner.insertAdjacentElement('afterend', box);
}

function startMistakePractice(courseId) {
    return showCustomToast('ميزة "أسئلة من أخطائك" ستتوفر قريباً.', 'warning');
    const mistakes = getCourseMistakeQuestions(courseId);
    if (!mistakes.length) return showCustomToast('لسه مفيش أسئلة غلط في الكورس ده. بعد أول امتحان هتلاقيها هنا.', 'warning');
    const modal = document.createElement('div');
    modal.className = 'mistake-practice-modal';
    modal.innerHTML = `<div class="mistake-practice-dialog"><button class="mistake-practice-close" aria-label="إغلاق" onclick="this.closest('.mistake-practice-modal').remove()"><i class="fas fa-xmark"></i></button><span class="mistake-practice-icon"><i class="fas fa-list-check"></i></span><h3>اختار عدد الأسئلة</h3><p>عندك ${mistakes.length} ${mistakes.length === 1 ? 'سؤال متاح' : 'أسئلة متاحة'} من أخطائك.</p><div class="mistake-count-options">${[1,2].filter(n => n <= mistakes.length).map(n => `<button onclick="launchMistakePractice('${courseId}', ${n}); this.closest('.mistake-practice-modal').remove()">${n} ${n === 1 ? 'سؤال واحد' : 'سؤالين'}</button>`).join('')}</div></div>`;
    document.body.appendChild(modal);
}

function launchMistakePractice(courseId, amount) {
    const mistakes = getCourseMistakeQuestions(courseId);
    if (!mistakes.length) return;
    const chosen = mistakes.sort(() => Math.random() - 0.5).slice(0, Math.min(amount, mistakes.length));
    const practiceId = `mistake_practice_${Date.now()}`;
    dynamicExamsDatabase[practiceId] = {
        version: 1, examTitle: 'أسئلة من أخطائك', duration: Math.max(2, chosen.length * 2),
        questions: chosen.map(q => ({ section: 'general', type: 'choice', question: q.question,
            imageUrl: q.imageUrl || '', options: q.options, correctAnswer: q.correctAnswer, points: q.points || 1 }))
    };
    window.currentCourseIdForExam = courseId;
    resetPortalToStep1(practiceId, 'exam');
}

function exitCourse() { activeCourseId = null; renderUnitsSection(); }

function openCourseUnitItem(courseId, unitId, itemId) {
    const course = coursesCache.find(c => c.id === courseId);
    if (!course) return;
    const unit = (course.units || []).find(u => u.id === unitId);
    if (!unit) return;
    const it = (unit.items || []).find(x => x.id === itemId);
    if (!it) return;

    if (it.type === 'file') {
        window.open(it.url, '_blank', 'noopener');
        recordCourseActivity(courseId, it, 'opened');
    } else if (it.type === 'video') {
        if ((parseFloat(it.price) || 0) > 0 && !videoPurchasesCache.has(it.id)) {
            showCustomToast("<i class='fas fa-lock'></i> هذا الفيديو مدفوع، يرجى التواصل مع الدعم الفني لشراء الفيديو.", "warning");
            return;
        }
        const viewKey = 'video_views_' + it.id;
        const watched = parseInt(localStorage.getItem(viewKey) || '0', 10);
        if (it.maxViews && watched >= it.maxViews) {
            showCustomToast("<i class='fas fa-lock'></i> خلّصت عدد مرات المشاهدة المتاحة لهذا الفيديو.", "warning");
            return;
        }
        localStorage.setItem(viewKey, String(watched + 1));
        openVideoModal(it.title, it.url);
        recordCourseActivity(courseId, it, 'watched');
        renderUnitsSection();
    } else if (it.type === 'exam') {
        window.currentCourseIdForExam = courseId;
        resetPortalToStep1(it.examId, 'exam');
    }
}

function recordCourseActivity(courseId,item,action) {
    if (typeof db === 'undefined') return;
    const key = currentStudentIdentity(); if (!key) return;
    db.collection('course_activity').doc(getUniqueDocId(key, courseId + '_' + item.id)).set({courseId,itemId:item.id,itemTitle:item.title,itemType:item.type,action,studentKey:key,studentName:localStorage.getItem('student_fullname')||'',studentCode:localStorage.getItem('student_code')||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}

// ===== مؤشرات الاشتباه في استخدام AI أثناء الامتحان =====
window.__aiSig = { leaves: 0, paste: 0, copy: 0, hiddenMs: 0 };
(function () {
    let hiddenStart = 0;
    document.addEventListener('visibilitychange', function () {
        if (!window.isExamRunning) return;
        if (document.hidden) { window.__aiSig.leaves++; hiddenStart = Date.now(); }
        else if (hiddenStart) { window.__aiSig.hiddenMs += Date.now() - hiddenStart; hiddenStart = 0; }
    });
    document.addEventListener('paste', function () { if (window.isExamRunning) window.__aiSig.paste++; }, true);
    document.addEventListener('copy', function () { if (window.isExamRunning) window.__aiSig.copy++; }, true);
})();