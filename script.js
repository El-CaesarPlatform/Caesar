// ==========================================
// 💥 1. إعدادات وتصريح Firebase
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
const DEFAULT_EXAM_DURATION = 15; // مدة الامتحان الافتراضية بالدقائق
let timeLeft = DEFAULT_EXAM_DURATION * 60;
let timerInterval = null;
let currentActiveSubject = "";
let currentActiveType = "exam";
let activeQuestionsList = [];
let currentSubjectVersion = 1;

// حالة تشغيل الامتحان لمنع التنقل والخروج
window.isExamRunning = false;

// قاعدة بيانات ديناميكية للامتحانات
let dynamicExamsDatabase = {};

// 🔔 دالة إظهار التنبيهات المخصصة التفاعلية 🔔
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
            z-index: 9999;
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
    } else { // error
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

// قواعد البيانات المحلّية الاحتياطية
const studentsResultsDatabase = {
    "محمد علي": { date: "12/07/2026", examName: "اختبار الدراسات - الدرس الأول", stage: "الصف الأول الإعدادي" },
    "محمود صابر": { date: "11/07/2026", examName: "امتحان الدراسات الاجتماعية", stage: "الصف الثاني الإعدادي" }
};

const homeworksDatabase = {};

function isExamFinished(subjectKey, type) {
    const dbSource = (type === "exam") ? dynamicExamsDatabase : homeworksDatabase;
    if (!dbSource || !dbSource[subjectKey]) return false;
    const currentVer = dbSource[subjectKey].version.toString().trim();
    const savedVer = localStorage.getItem('finished_' + subjectKey);
    return savedVer && savedVer === currentVer;
}

// ==========================================
// 🚀 عند تحميل الصفحة والتجهيز 🚀
// ==========================================
window.onload = function() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    let studentPhone = localStorage.getItem("student_phone") || "";
    let parentPhone = localStorage.getItem("parent_phone") || "";
    let studentStage = localStorage.getItem("student_stage") || "غير محدد";

    // إذا لم تكن البيانات مسبقة الحفظ في localStorage
    if (!studentName) {
        studentName = prompt("🔑 يرجى إدخال اسمك الثلاثي لدخول المنصة:") || "";
        if (studentName.trim() !== "") {
            studentName = studentName.trim();
            localStorage.setItem("student_fullname", studentName);
        } else {
            showCustomToast("⚠️ أمن المنصة: يرجى تسجيل الدخول أولاً!", "error");
            setTimeout(() => { window.location.href = "login.html"; }, 2000);
            return;
        }
    }

    // عرض بيانات الطالب في الواجهة
    const displayElement = document.getElementById('user-display-name');
    if (displayElement) displayElement.textContent = "أهلاً: " + studentName;

    if (document.getElementById("profile-name")) document.getElementById("profile-name").textContent = studentName;
    if (document.getElementById("profile-stage")) document.getElementById("profile-stage").textContent = studentStage;
    if (document.getElementById("profile-phone")) document.getElementById("profile-phone").textContent = studentPhone;
    if (document.getElementById("profile-parent-phone")) document.getElementById("profile-parent-phone").textContent = parentPhone;

    const searchInput = document.getElementById("search-student-name");
    if (searchInput) {
        searchInput.value = studentName;
    }

    createTimerBannerElement();
    setupAntiCheatListeners();
    loadAssignedExam();
};

function createTimerBannerElement() {
    if (document.getElementById('timer-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'timer-banner';
    banner.style.cssText = "position: fixed; top: 15px; left: 50%; transform: translateX(-50%); background: #e74c3c; color: white; padding: 10px 24px; border-radius: 30px; font-weight: bold; z-index: 2000; box-shadow: 0 6px 20px rgba(0,0,0,0.25); display: none; text-align: center; direction: ltr; font-family: monospace; font-size: 1.1rem; border: 2px solid rgba(255,255,255,0.3);";
    banner.innerHTML = "⏱️ Time Left: <span id='timer-display'>15:00</span>";
    document.body.appendChild(banner);
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
// 📚 جلب وعرض الاختبار المخصص للصح الدراسي
// ==========================================
async function loadAssignedExam() {
    const examsGrid = document.getElementById('assigned-exam-grid');
    const studentStage = localStorage.getItem("student_stage") || "";

    if (!examsGrid) return;

    if (typeof db === 'undefined') {
        examsGrid.innerHTML = "<p style='text-align:center;color:#e74c3c;grid-column:1/-1;'>❌ تعذر الاتصال بقاعدة البيانات. تحقق من الاتصال بالإنترنت.</p>";
        return;
    }

    try {
        let snapshot;
        if (studentStage && studentStage !== "غير محدد") {
            snapshot = await db.collection("exams").where("grade", "==", studentStage).get();
        } else {
            snapshot = await db.collection("exams").get();
        }

        if (snapshot.empty) {
            examsGrid.innerHTML = "<p style='text-align:center;color:#cbd5e1;grid-column:1/-1;padding:20px;'>📭 لا يوجد امتحان منشور لصفك حالياً.</p>";
            return;
        }

        let examsForGrade = [];
        snapshot.forEach(doc => examsForGrade.push({ id: doc.id, ...doc.data() }));

        examsForGrade.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });

        const activeExam = examsForGrade[0];

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

        examsGrid.innerHTML = `
            <div class="exam-card" id="card-${activeExam.id}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);">
                <h3 style="color: #00d2ff; font-weight: bold; margin-bottom: 8px;">🏫 ${activeExam.grade || studentStage || 'عام'}</h3>
                <h4 style="color: #f8fafc; font-size: 1.2rem; margin-bottom: 12px;">${activeExam.examCode || activeExam.title || 'اختبار أونلاين'}</h4>
                <p style="color: #cbd5e1; margin-bottom: 8px; font-size: 0.9rem;">📝 عدد الأسئلة: <strong>${convertedQuestions.length}</strong> أسئلة</p>
                <p style="color: #cbd5e1; margin-bottom: 18px; font-size: 0.9rem;">⏱️ مدة الامتحان: <strong>${examDuration}</strong> دقيقة</p>
                <button class="btn btn-exam" onclick="resetPortalToStep1('${activeExam.id}', 'exam')" style="background: #0066ff; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.3s; width: 100%;">ابدأ الآن 🚀</button>
            </div>
        `;

        updateExamButtonsStatus();

    } catch (err) {
        console.error("خطأ أثناء تحميل الامتحان:", err);
        examsGrid.innerHTML = "<p style='text-align:center;color:#e74c3c;grid-column:1/-1;'>❌ حدث خطأ أثناء تحميل الامتحان. حاول تحديث الصفحة.</p>";
    }
}

function updateExamButtonsStatus() {
    const buttons = document.querySelectorAll('.main-content .btn');

    buttons.forEach(btn => {
        if (btn.classList.contains('btn-result-card')) return;

        const onClickAttr = btn.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes('resetPortalToStep1')) {
            const matches = onClickAttr.match(/'([^']+)'/g);
            if (matches && matches.length >= 2) {
                const subjectKey = matches[0].replace(/'/g, '').trim();
                const type = matches[1].replace(/'/g, '').trim();

                if (isExamFinished(subjectKey, type)) {
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
    });
}

// ==========================================
// 🔍 الاستعلام عن النتائج وحالة التصحيح
// ==========================================
async function checkStudentResult() {
    const studentNameInput = document.getElementById("search-student-name");
    if (!studentNameInput) return;

    const querySearch = studentNameInput.value.trim().toLowerCase();
    const displayBox = document.getElementById("result-display-box");

    if (querySearch === "") {
        showCustomToast("⚠️ يرجى كتابة اسم الطالب للاستعلام!", "warning");
        return;
    }

    displayBox.style.display = "block";
    displayBox.innerHTML = "<p style='text-align:center; color:#00d2ff; font-weight:bold;'>⏳ جاري البحث عن حالة النتيجة...</p>";

    let foundResults = [];

    if (typeof db !== 'undefined') {
        try {
            const snapshot = await db.collection("students").get();

            snapshot.forEach((doc) => {
                const data = doc.data();
                const storedName = (data.studentName || data.name || doc.id || "").trim().toLowerCase();
                const storedExam = (data.examName || data.examCode || data.title || "").trim().toLowerCase();

                if (storedName.includes(querySearch) || storedExam.includes(querySearch)) {
                    foundResults.push({ id: doc.id, ...data });
                }
            });

            if (foundResults.length > 0) {
                let html = `<h4 style="color: #00d2ff; text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 1.1rem;">📊 حالة أداء الامتحان</h4>`;

                foundResults.forEach(docData => {
                    const studentStage = docData.stage || docData.studentGrade || localStorage.getItem('student_stage') || "غير محدد";
                    const examTitle = docData.examName || docData.examTitle || docData.title || "امتحان عام";
                    const submittedDate = docData.submittedAt || "تم التسليم بنجاح";

                    // التحقق مما إذا كان المعلم قد أتاح ظهور النتيجة
                    const isResultVisible = (docData.showScore === true || docData.showResult === true || docData.isResultVisible === true);

                    if (isResultVisible) {
                        const score = (docData.finalScore !== undefined) ? docData.finalScore : ((docData.score !== undefined) ? docData.score : (docData.mcqScore || 0));
                        const maxScore = (docData.maxScore !== undefined) ? docData.maxScore : ((docData.maxExamScore !== undefined) ? docData.maxExamScore : 10);
                        const percentage = Math.round((score / maxScore) * 100);

                        html += `
                            <div style="background: rgba(255, 255, 255, 0.05); border-right: 5px solid #2ecc71; padding: 18px; margin-bottom: 15px; border-radius: 12px; text-align: right;">
                                <h4 style="color: #2ecc71; margin-bottom: 10px; font-weight: bold;">🎉 النتيجة معتمدة ورسمية</h4>
                                <p style="margin-bottom: 8px;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name || docData.id}</p>
                                <p style="margin-bottom: 8px;"><strong>🏫 الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="margin-bottom: 12px; font-size: 1.1rem;"><strong>💯 الدرجة:</strong> 
                                    <span style="color:#2ecc71; font-weight:bold; font-size:1.3rem;">${score}</span> / <span>${maxScore}</span> (${percentage}%)
                                </p>
                            </div>
                        `;
                    } else {
                        html += `
                            <div style="background: rgba(255, 255, 255, 0.05); border-right: 5px solid #f1c40f; padding: 18px; margin-bottom: 15px; border-radius: 12px; text-align: right;">
                                <h4 style="color: #f1c40f; margin-bottom: 10px; font-weight: bold;">⏳ تم التسليم وقيد المراجعة</h4>
                                <p style="margin-bottom: 8px;"><strong>👤 الطالب:</strong> ${docData.studentName || docData.name || docData.id}</p>
                                <p style="margin-bottom: 8px;"><strong>🏫 الصف:</strong> <span style="color:#00d2ff;">${studentStage}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📖 الامتحان:</strong> <span style="color:#f1c40f;">${examTitle}</span></p>
                                <p style="margin-bottom: 8px;"><strong>📅 وقت التسليم:</strong> ${submittedDate}</p>
                                <p style="color: #2ecc71; font-weight: bold; margin-top: 10px;">
                                    📩 الإجابات محفوظة لدى المعلم، وستظهر الدرجة هنا فور اعتمادها وإظهارها من اللوحة.
                                </p>
                            </div>
                        `;
                    }
                });

                displayBox.innerHTML = html;
                generateHonorRoll();
                return;
            }
        } catch (err) {
            console.warn("خطأ في جلب بيانات النتيجة:", err);
        }
    }

    displayBox.innerHTML = `<p style="color:#e74c3c; text-align:center; font-weight:bold; margin:0; padding:15px;">❌ عذراً، لم نتمكن من العثور على أي سجل أداء امتحان بهذا الاسم (${querySearch}).</p>`;
}

function generateHonorRoll() {
    let resultsSection = document.getElementById("results-section");
    if (!resultsSection) return;

    const oldHonorRoll = document.getElementById("honor-roll-container");
    if (oldHonorRoll) oldHonorRoll.remove();

    let honorRollHTML = `
        <div id="honor-roll-container" style="margin-top: 30px; padding: 24px; background: rgba(255, 255, 255, 0.03); border: 2px solid #f1c40f; border-radius: 16px;">
            <h3 style="color: #f1c40f; text-align: center; font-weight: bold; margin-bottom: 15px;">🏆 لوحة شرف الطلاب المتفوقين 🏆</h3>
            <p style="text-align:center; color:#cbd5e1; font-size:0.9rem;">يتم رصد القائمة وتحديثها دورياً عقب إعلان الدرجات من المعلم.</p>
        </div>
    `;
    resultsSection.insertAdjacentHTML('beforeend', honorRollHTML);
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

function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();

    if (isExamFinished(cleanSubjectKey, cleanType)) {
        showCustomToast("⚠️ عذراً، أنت قمت بأداء هذا الاختبار مسبقاً!", "warning");
        return;
    }

    const dbSource = (cleanType === "exam") ? dynamicExamsDatabase : homeworksDatabase;
    if (!dbSource || !dbSource[cleanSubjectKey]) {
        showCustomToast(`⚠️ تنبيه: الامتحان غير متاح حالياً، حاول تحديث الصفحة.`, "warning");
        return;
    }

    currentActiveSubject = cleanSubjectKey;
    currentActiveType = cleanType;
    currentSubjectVersion = dbSource[cleanSubjectKey].version;

    let questionsCopy = JSON.parse(JSON.stringify(dbSource[cleanSubjectKey].questions));
    questionsCopy = shuffleArray(questionsCopy);

    questionsCopy.forEach(q => {
        if ((q.type === "choice" || q.type === "mcq") && q.options) {
            q.options = shuffleArray(q.options);
        }
    });

    activeQuestionsList = questionsCopy;

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
        document.getElementById('timer-banner').style.display = 'block';
        timeLeft = durationInMinutes * 60;
        startTimer();
    }
}

// ==========================================
// 🎨 عرض الأسئلة
// ==========================================
function renderQuestions() {
    const container = document.getElementById('questions-container');
    if (!container) return;

    const examTitle = dynamicExamsDatabase[currentActiveSubject]?.examTitle || "الامتحان الحالي";
    container.innerHTML = `<h3 style='text-align:right; margin-bottom:12px; font-weight:bold; font-size:1.3rem; color:#00d2ff;'>${examTitle}</h3><hr style='margin-bottom:20px; opacity:0.15;'>`;

    if (!activeQuestionsList || activeQuestionsList.length === 0) {
        container.innerHTML += "<p style='color:#e74c3c; text-align:center;'>لا توجد أسئلة متوفرة حالياً.</p>";
        return;
    }

    activeQuestionsList.forEach((q, qIndex) => {
        let html = `<div id="block-q${qIndex}" class="question-block" style="background: rgba(255,255,255,0.04); padding:20px; border-radius:14px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.1); text-align:right;">`;

        if (q.imageUrl && q.imageUrl.trim() !== "") {
            html += `
            <div style="margin-bottom: 15px; text-align:center;">
                <img src="${q.imageUrl}" alt="صورة السؤال" style="max-width:100%; max-height:300px; border-radius:12px; border:1px solid rgba(255,255,255,0.2);">
            </div>`;
        }

        html += `<p style="font-weight:bold; font-size:1.1rem; margin-bottom:14px; color:#fff; line-height:1.6;">س${qIndex + 1}: ${q.question} <span style="color:#e74c3c;">*</span></p>`;

        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);

        if (isChoice) {
            html += `<div class="options-group" style="display:flex; flex-direction:column; gap:10px;">`;
            q.options.forEach((opt) => {
                html += `
                    <label style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; cursor:pointer; transition:all 0.2s;">
                        <input type="radio" name="q${qIndex}" value="${opt}" style="width:18px; height:18px; accent-color:#0066ff;">
                        <span style="font-size:0.95rem; color:#fff;">${opt}</span>
                    </label>
                `;
            });
            html += `</div>`;
        } else {
            html += `<textarea name="q${qIndex}" style="width:100%; height:110px; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.4); color:#fff; resize:vertical; outline:none;" placeholder="اكتب إجابتك التفصيلية هنا..."></textarea>`;
        }
        container.innerHTML += html + `</div>`;
    });

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.style.display = 'block';
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        let m = Math.floor(timeLeft / 60);
        let s = timeLeft % 60;
        const display = document.getElementById('timer-display');
        if (display) display.textContent = `${m}:${s < 10 ? '0'+s : s}`;
        
        if (--timeLeft < 0) {
            clearInterval(timerInterval);
            showCustomToast("⏰ انتهى الوقت المحدد! سيتم تسليم الإجابات تلقائياً الآن.", "warning");
            calculateAndSend(true);
        }
    }, 1000);
}

// ==========================================
// 📤 تصحيح وتسليم الإجابات لقاعدة البيانات
// ==========================================
function calculateAndSend(bypassValidation = false) {
    let studentAnswersText = {};
    let answersForAdmin = [];
    let hasUnanswered = false;
    let firstUnansweredIndex = -1;
    let mcqScoreObtained = 0;
    let maxMcqScorePossible = 0;
    let totalExamPointsPossible = 0;

    activeQuestionsList.forEach((q, qIndex) => {
        let questionKey = "س" + (qIndex + 1) + ": " + q.question;
        let answered = true;
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
                if (studentValue.trim() === (q.correctAnswer || "").trim()) {
                    mcqScoreObtained += points;
                    isCorrect = true;
                    correctionStatus = ` [✅ صحيح]`;
                } else {
                    isCorrect = false;
                    correctionStatus = ` [❌ خطأ]`;
                }
            } else {
                answered = false;
                studentValue = "لم يحل";
                isCorrect = false;
                correctionStatus = ` [❌ لم يحل]`;
            }
        } else {
            let textarea = document.querySelector(`textarea[name="q${qIndex}"]`);
            if (textarea && textarea.value.trim() !== "") {
                studentValue = textarea.value.trim();
            } else {
                answered = false;
                studentValue = "لم يكتب إجابة";
            }
            correctionStatus = ` [📝 مقالي]`;
        }

        if (!answered && !bypassValidation) {
            hasUnanswered = true;
            if (firstUnansweredIndex === -1) firstUnansweredIndex = qIndex;
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

    if (hasUnanswered && !bypassValidation) {
        showCustomToast(`⚠️ يرجى الإجابة على جميع الأسئلة أولاً! راجع سؤال رقم (${firstUnansweredIndex + 1}).`, "warning");
        const unansweredElem = document.getElementById(`block-q${firstUnansweredIndex}`);
        if (unansweredElem) {
            unansweredElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            unansweredElem.style.border = '2px solid #e74c3c';
            setTimeout(() => { unansweredElem.style.border = '1px solid rgba(255,255,255,0.1)'; }, 3000);
        }
        return;
    }

    clearInterval(timerInterval);
    window.isExamRunning = false;
    if (document.getElementById('timer-banner')) document.getElementById('timer-banner').style.display = 'none';

    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "طالب مجهول";
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

    if (typeof db !== 'undefined') {
        // تنظيف اسم المستند لمنع الأخطاء البرمجية
        const safeSubjectKey = currentActiveSubject.replace(/[/\\.#$\[\]\s]/g, '_');
        const safeStudentName = studentFullName.replace(/[/\\.#$\[\]\s]/g, '_');
        const uniqueDocId = `${safeStudentName}_${safeSubjectKey}`;

        db.collection("students").doc(uniqueDocId).set({
            studentName: studentFullName,
            name: studentFullName,
            studentPhone: studentPhone,
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
            submittedAt: new Date().toLocaleString('ar-EG')
        }, { merge: true }).then(() => {
            localStorage.setItem('finished_' + currentActiveSubject, currentSubjectVersion.toString());
            showCustomToast("🎉 تم تسليم الامتحان بنجاح!", "success");
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }).catch(err => {
            console.error("خطأ في حفظ النتيجة:", err);
            showCustomToast("❌ حدث خطأ أثناء التسليم، حاول مرة أخرى.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "تسليم الإجابات 📤";
            }
        });
    }
}