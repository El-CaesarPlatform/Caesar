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
// ⚙️ 2. المتغيرات العامة ورسائل التنبيه داخل الصفحة
// ==========================================
const DEFAULT_EXAM_DURATION = 15;
let timeLeft = DEFAULT_EXAM_DURATION * 60;
let timerInterval = null;
let currentActiveSubject = "";
let currentActiveType = "exam";
let activeQuestionsList = [];
let currentSubjectVersion = 1;

window.isExamRunning = false;
let dynamicExamsDatabase = {};
const homeworksDatabase = {};

// 📩 دالة عرض الرسائل المدمجة داخل الصفحة (Inline Alerts)
function showCustomToast(message, type = 'error') {
    let messageBox = document.getElementById('inline-page-message');

    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'inline-page-message';
        
        const mainContainer = document.querySelector('.main-content') || document.querySelector('.container') || document.body;
        mainContainer.insertBefore(messageBox, mainContainer.firstChild);
    }

    let bgColor, borderColor, textColor, icon;
    if (type === 'success') {
        bgColor = 'rgba(46, 204, 113, 0.12)';
        borderColor = '#2ecc71';
        textColor = '#2ecc71';
        icon = '✅';
    } else if (type === 'warning') {
        bgColor = 'rgba(241, 196, 15, 0.12)';
        borderColor = '#f1c40f';
        textColor = '#f1c40f';
        icon = '⚠️';
    } else {
        bgColor = 'rgba(231, 76, 60, 0.12)';
        borderColor = '#e74c3c';
        textColor = '#e74c3c';
        icon = '❌';
    }

    messageBox.style.cssText = `
        background: ${bgColor};
        border-right: 5px solid ${borderColor};
        border-radius: 12px;
        padding: 16px 20px;
        margin: 15px 0 25px 0;
        color: ${textColor};
        font-weight: bold;
        font-size: 1rem;
        direction: rtl;
        text-align: right;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
    `;

    messageBox.innerHTML = `<span style="font-size: 1.3rem;">${icon}</span> <span style="line-height: 1.5;">${message}</span>`;
    messageBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function isExamFinished(subjectKey, type) {
    const dbSource = (type === "exam") ? dynamicExamsDatabase : homeworksDatabase;
    if (!dbSource || !dbSource[subjectKey]) return false;
    const currentVer = dbSource[subjectKey].version.toString().trim();
    const savedVer = localStorage.getItem('finished_' + subjectKey);
    return savedVer && savedVer === currentVer;
}

// ==========================================
// 🔍 دالة فحص استحقاق الطالب للامتحان
// ==========================================
function canStudentAccessExam(exam, studentCode, studentStage) {
    if (exam.grade && studentStage && studentStage !== "غير محدد" && exam.grade !== studentStage) {
        return false;
    }

    const cleanStudentCode = (studentCode || "").toString().trim().toLowerCase();
    const targetType = exam.targetType || 'all';

    if (targetType === 'all') {
        return true;
    }

    if (targetType === 'specific') {
        const targetCode = (exam.targetCode || (exam.targetStudent && exam.targetStudent.code) || "").toString().trim().toLowerCase();
        return targetCode === cleanStudentCode && cleanStudentCode !== "";
    }

    if (targetType === 'multiple') {
        if (Array.isArray(exam.targetCodes)) {
            return exam.targetCodes.some(code => code.toString().trim().toLowerCase() === cleanStudentCode) && cleanStudentCode !== "";
        }
    }

    return false;
}

// ==========================================
// 🚀 عند تحميل الصفحة والتجهيز
// ==========================================
window.onload = function() {
    let studentName = localStorage.getItem("student_fullname") || localStorage.getItem("student_name") || "";
    let studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "";
    let studentPhone = localStorage.getItem("student_phone") || "";
    let parentPhone = localStorage.getItem("parent_phone") || "";
    let studentStage = localStorage.getItem("student_stage") || "غير محدد";

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

    createTimerBannerElement();
    createQuestionsMapDrawerElement();
    setupAntiCheatListeners();
    loadAssignedExam();
    checkAndResumeRunningExam();
};

// ⏱️ إنشاء بنر التوقيت مثبت في المنتصف ولا يعيق رؤية الطالب
function createTimerBannerElement() {
    if (document.getElementById('timer-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'timer-banner';
    
    banner.style.cssText = `
        position: fixed; 
        top: 15px; 
        left: 50%; 
        transform: translateX(-50%); 
        background: rgba(231, 76, 60, 0.85);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        color: white; 
        padding: 8px 20px; 
        border-radius: 20px; 
        font-weight: bold; 
        z-index: 10000; 
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
        display: none; 
        text-align: center; 
        direction: ltr; 
        font-family: monospace; 
        font-size: 1.05rem; 
        border: 1px solid rgba(255, 255, 255, 0.2);
        pointer-events: none;
    `;
    
    banner.innerHTML = "⏱️ Time Left: <span id='timer-display-banner'>15:00</span>";
    document.body.appendChild(banner);
}

// 🗺️ إنشاء عنصر خريطة الأسئلة والزر العائم (محدث ليتوافق بذكاء مع الموبايل)
function createQuestionsMapDrawerElement() {
    if (document.getElementById('questions-map-drawer')) return;

    const drawer = document.createElement('div');
    drawer.id = 'questions-map-drawer';
    drawer.className = 'questions-map-drawer';
    drawer.style.cssText = "display: none; position: fixed; top: 0; right: 0; width: 85%; max-width: 300px; height: 100%; background: #1e1e38; color: #ffffff; z-index: 99999; padding: 20px; box-shadow: -4px 0 25px rgba(0,0,0,0.6); border-left: 1px solid rgba(255,255,255,0.1); overflow-y: auto; transition: all 0.3s ease; direction: rtl;";

    drawer.innerHTML = `
        <div class="map-drawer-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="font-weight:bold; color:#00d2ff; font-size: 1.1rem;">🗺️ خريطة الأسئلة</span>
            <button class="map-close-btn" onclick="toggleQuestionsMap()" style="background:none; border:none; color:#e74c3c; font-weight:bold; font-size:1.4rem; cursor:pointer; padding: 0 5px;">✕</button>
        </div>
        <div id="questions-map" class="questions-map-grid" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;"></div>
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'map-toggle-btn';
    toggleBtn.className = 'map-toggle-btn';
    toggleBtn.innerHTML = '🗺️ خريطة الأسئلة';
    toggleBtn.style.cssText = "display: none; position: fixed; bottom: 20px; right: 20px; background: #0066ff; color: white; border: none; padding: 12px 20px; border-radius: 25px; font-weight: bold; cursor: pointer; z-index: 9999; box-shadow: 0 4px 15px rgba(0,102,255,0.5); font-size: 0.95rem;";
    toggleBtn.onclick = toggleQuestionsMap;

    document.body.appendChild(drawer);
    document.body.appendChild(toggleBtn);
}

function toggleQuestionsMap() {
    const drawer = document.getElementById('questions-map-drawer');
    if (drawer) {
        if (drawer.style.display === 'none' || drawer.style.display === '') {
            drawer.style.display = 'block';
            drawer.classList.add('open');
        } else {
            drawer.style.display = 'none';
            drawer.classList.remove('open');
        }
    }
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
// 📚 جلب وعرض الاختبارات المخصصة للطالب
// ==========================================
async function loadAssignedExam() {
    const examsGrid = document.getElementById('assigned-exam-grid');
    const studentStage = localStorage.getItem("student_stage") || "";
    const studentCode = localStorage.getItem("student_code") || localStorage.getItem("exam_code") || "";

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

        let allGradeExams = [];
        snapshot.forEach(doc => allGradeExams.push({ id: doc.id, ...doc.data() }));

        const accessibleExams = allGradeExams.filter(exam => canStudentAccessExam(exam, studentCode, studentStage));

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
                <div class="exam-card" id="card-${activeExam.id}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2); margin-bottom: 15px;">
                    <h3 style="color: #00d2ff; font-weight: bold; margin-bottom: 8px;">🏫 ${activeExam.grade || studentStage || 'عام'}</h3>
                    <h4 style="color: #f8fafc; font-size: 1.2rem; margin-bottom: 12px;">${activeExam.examCode || activeExam.title || 'اختبار أونلاين'}</h4>
                    <p style="color: #cbd5e1; margin-bottom: 8px; font-size: 0.9rem;">📝 عدد الأسئلة: <strong>${convertedQuestions.length}</strong> أسئلة</p>
                    <p style="color: #cbd5e1; margin-bottom: 18px; font-size: 0.9rem;">⏱️ مدة الامتحان: <strong>${examDuration}</strong> دقيقة</p>
                    <button class="btn btn-exam" onclick="resetPortalToStep1('${activeExam.id}', 'exam')" style="background: #0066ff; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.3s; width: 100%;">ابدأ الآن 🚀</button>
                </div>
            `;
        });

        updateExamButtonsStatus();

    } catch (err) {
        console.error("خطأ أثناء تحميل الامتحان:", err);
        examsGrid.innerHTML = "<p style='text-align:center;color:#e74c3c;grid-column:1/-1;'>❌ حدث خطأ أثناء تحميل الامتحان. حاول تحديث الصفحة.</p>";
    }
}

async function updateExamButtonsStatus() {
    const buttons = document.querySelectorAll('.main-content .btn');
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";

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

                if (typeof db !== 'undefined' && studentFullName) {
                    const safeSubjectKey = subjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
                    const safeStudentName = studentFullName.replace(/[/\\.#$\[\]\s]/g, '_');
                    const uniqueDocId = `${safeStudentName}_${safeSubjectKey}`;
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
// 🔍 الاستعلام عن النتائج
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
    displayBox.innerHTML = "<p style='text-align:center; color:#00d2ff; font-weight:bold;'>⏳ جاري البحث عن حالة النتيجة...</p>";

    let foundResults = [];

    if (typeof db !== 'undefined') {
        try {
            const snapshot = await db.collection("students").get();

            snapshot.forEach((doc) => {
                const data = doc.data();
                const storedName = (data.studentName || data.name || "").trim().toLowerCase();
                const storedStudentCode = (data.studentCode || data.code || "").toString().trim().toLowerCase();
                const storedPhone = (data.studentPhone || data.phone || "").toString().trim().toLowerCase();

                const hasSubmittedFlag = (data.hasSubmitted === true || data.isSubmitted === true || data.status === "submitted");
                const hasAnswers = (data.answers && Array.isArray(data.answers) && data.answers.length > 0) || 
                                   (data.answers && typeof data.answers === 'object' && Object.keys(data.answers).length > 0);
                const hasScore = (data.finalScore !== undefined || data.score !== undefined || data.mcqScore !== undefined);
                
                const isRealExamSubmitted = hasSubmittedFlag && (hasAnswers || hasScore);

                const matchByName = storedName.includes(querySearch);
                const matchByCode = (storedStudentCode === codeSearch || storedPhone === codeSearch);

                if (matchByName && matchByCode && isRealExamSubmitted) {
                    foundResults.push({ id: doc.id, ...data });
                }
            });

            if (foundResults.length > 0) {
                let html = `<h4 style="color: #00d2ff; text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 1.1rem;">📊 حالة أداء الامتحان</h4>`;

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

function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function resetPortalToStep1(subjectKey, type) {
    const cleanSubjectKey = subjectKey.trim();
    const cleanType = type.trim();
    let studentFullName = localStorage.getItem('student_fullname') || localStorage.getItem('student_name') || "";

    if (typeof db !== 'undefined' && studentFullName) {
        const safeSubjectKey = cleanSubjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
        const safeStudentName = studentFullName.replace(/[/\\.#$\[\]\s]/g, '_');
        const uniqueDocId = `${safeStudentName}_${safeSubjectKey}`;

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

    const mapBtn = document.getElementById('map-toggle-btn');
    if (mapBtn) mapBtn.style.display = 'flex';

    renderQuestions();

    const examData = dynamicExamsDatabase[currentActiveSubject];
    const durationInMinutes = (examData && examData.duration) ? examData.duration : DEFAULT_EXAM_DURATION;

    if (currentActiveType === "exam") {
        const topTimer = document.getElementById('timer-banner');
        if (topTimer) topTimer.style.display = 'block';

        timeLeft = durationInMinutes * 60;

        const examSessionState = {
            subjectKey: currentActiveSubject,
            type: currentActiveType,
            questions: activeQuestionsList,
            endTime: Date.now() + (durationInMinutes * 60 * 1000)
        };
        localStorage.setItem('active_running_exam_session', JSON.stringify(examSessionState));

        startTimer();
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
        timeLeft = Math.floor(remainingMs / 1000);

        document.getElementById('quiz-wrapper-box').style.display = 'block';
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'none';

        if(document.getElementById('exams-section')) document.getElementById('exams-section').style.display = 'none';
        if(document.getElementById('results-section')) document.getElementById('results-section').style.display = 'none';

        window.isExamRunning = true;

        const mapBtn = document.getElementById('map-toggle-btn');
        if (mapBtn) mapBtn.style.display = 'flex';

        renderQuestions();

        if (currentActiveType === "exam") {
            const topTimer = document.getElementById('timer-banner');
            if (topTimer) topTimer.style.display = 'block';
            startTimer();
        }

        showCustomToast("🔄 تم استعادة جلسة الامتحان وإجاباتك بنجاح!", "success");

    } catch(e) {
        console.warn("خطأ في استعادة الجلسة الحالية:", e);
    }
}

// ==========================================
// 🎨 عرض الأسئلة وبناء خريطة الأسئلة
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

    let savedAnswers = {};
    try {
        savedAnswers = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch(e) {
        savedAnswers = {};
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
                let isChecked = (savedAnswers[`q${qIndex}`] === opt) ? 'checked' : '';
                html += `
                    <label style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; cursor:pointer; transition:all 0.2s;">
                        <input type="radio" name="q${qIndex}" value="${opt}" ${isChecked} onchange="autoSaveAnswer('q${qIndex}', '${opt.replace(/'/g, "\\'")} ')" style="width:18px; height:18px; accent-color:#0066ff;">
                        <span style="font-size:0.95rem; color:#fff;">${opt}</span>
                    </label>
                `;
            });
            html += `</div>`;
        } else {
            let savedText = savedAnswers[`q${qIndex}`] || '';
            html += `<textarea name="q${qIndex}" oninput="autoSaveAnswer('q${qIndex}', this.value)" style="width:100%; height:110px; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.4); color:#fff; resize:vertical; outline:none;" placeholder="اكتب إجابتك التفصيلية هنا...">${savedText}</textarea>`;
        }
        container.innerHTML += html + `</div>`;
    });

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.style.display = 'block';

    renderQuestionMap();
}

function renderQuestionMap() {
    const mapContainer = document.getElementById('questions-map');
    if (!mapContainer) return;

    mapContainer.innerHTML = "";

    let savedAnswers = {};
    try {
        savedAnswers = JSON.parse(localStorage.getItem('saved_exam_answers_' + currentActiveSubject) || '{}');
    } catch(e) {
        savedAnswers = {};
    }

    activeQuestionsList.forEach((q, qIndex) => {
        const btn = document.createElement('button');
        btn.id = `q-map-btn-${qIndex}`;
        btn.innerText = qIndex + 1;
        
        const hasSaved = savedAnswers[`q${qIndex}`] && savedAnswers[`q${qIndex}`].toString().trim() !== "";
        btn.className = hasSaved ? "q-map-btn answered" : "q-map-btn unanswered";

        btn.onclick = () => {
            const targetBlock = document.getElementById(`block-q${qIndex}`);
            if (targetBlock) {
                targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            toggleQuestionsMap();
        };

        mapContainer.appendChild(btn);
    });
}

function autoSaveAnswer(questionKey, answerValue) {
    if (!currentActiveSubject) return;
    try {
        let storageKey = 'saved_exam_answers_' + currentActiveSubject;
        let savedAnswers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        savedAnswers[questionKey] = answerValue;
        localStorage.setItem(storageKey, JSON.stringify(savedAnswers));

        const qIndexStr = questionKey.replace('q', '');
        const qIndex = parseInt(qIndexStr, 10);
        
        if (!isNaN(qIndex)) {
            const mapBtn = document.getElementById(`q-map-btn-${qIndex}`);
            if (mapBtn) {
                if (answerValue && answerValue.toString().trim() !== "") {
                    mapBtn.className = "q-map-btn answered";
                } else {
                    mapBtn.className = "q-map-btn unanswered";
                }
            }
        }

    } catch(e) {
        console.warn("خطأ في الحفظ التلقائي:", e);
    }
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        let m = Math.floor(timeLeft / 60);
        let s = timeLeft % 60;
        const timeStr = `${m}:${s < 10 ? '0'+s : s}`;
        
        const bannerDisplay = document.getElementById('timer-display-banner');
        if (bannerDisplay) bannerDisplay.textContent = timeStr;
        
        if (--timeLeft < 0) {
            clearInterval(timerInterval);
            showCustomToast("⏰ انتهى الوقت المحدد! سيتم تسليم الإجابات تلقائياً الآن.", "warning");
            calculateAndSend(true);
        }
    }, 1000);
}

// ==========================================
// 🔍 دالة فحص الأسئلة والتأكيد قبل التسليم
// ==========================================
function submitExamWithCheck() {
    let unAnsweredIndices = [];

    activeQuestionsList.forEach((q, qIndex) => {
        const isChoice = (q.type === "choice" || q.type === "mcq") || (q.options && q.options.length > 0);
        let isAnswered = false;

        if (isChoice) {
            let selected = document.querySelector(`input[name="q${qIndex}"]:checked`);
            if (selected && selected.value.trim() !== "") {
                isAnswered = true;
            }
        } else {
            let textarea = document.querySelector(`textarea[name="q${qIndex}"]`);
            if (textarea && textarea.value.trim() !== "") {
                isAnswered = true;
            }
        }

        if (!isAnswered) {
            unAnsweredIndices.push(qIndex + 1);
        }
    });

    if (unAnsweredIndices.length > 0) {
        showCustomToast(`⚠️ تنبيه: لديك أسئلة غير مجاب عنها رقم: (${unAnsweredIndices.join("، ")}).`, "warning");
        const firstMissingIndex = unAnsweredIndices[0] - 1;
        const missingBlock = document.getElementById(`block-q${firstMissingIndex}`);
        if (missingBlock) {
            missingBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            missingBlock.style.border = '2px solid #e74c3c';
            setTimeout(() => { missingBlock.style.border = '1px solid rgba(255,255,255,0.1)'; }, 3500);
        }
        return;
    }

    const confirmSubmit = confirm("هل أنت متأكد من التسليم النهائي؟ لن تتمكن من تعديل الإجابات بعد ذلك.");
    if (confirmSubmit) {
        calculateAndSend(true);
    }
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

    const mapBtn = document.getElementById('map-toggle-btn');
    if (mapBtn) mapBtn.style.display = 'none';
    const drawer = document.getElementById('questions-map-drawer');
    if (drawer) {
        drawer.style.display = 'none';
        drawer.classList.remove('open');
    }

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
        const safeStudentName = studentFullName.replace(/[/\\.#$\[\]\s]/g, '_');
        const uniqueDocId = `${safeStudentName}_${safeSubjectKey}`;

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
// 👑 دالة إعادة الامتحان للطالب من لوحة الأدمن
// ==========================================
async function resetStudentExamByAdmin(studentFullName, subjectKey) {
    if (typeof db === 'undefined' || !studentFullName || !subjectKey) {
        showCustomToast("❌ بيانات الطالب أو الامتحان غير مكتملة!", "error");
        return;
    }

    const safeSubjectKey = subjectKey.replace(/[/\\.#$\[\]\s]/g, '_');
    const safeStudentName = studentFullName.replace(/[/\\.#$\[\]\s]/g, '_');
    const uniqueDocId = `${safeStudentName}_${safeSubjectKey}`;

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