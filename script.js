// 存储所有待辦事項
let tasks = [];

// 分類定義
let categories = {
    work: { name: '工作', color: 'blue', borderColor: 'border-blue-500', bgColor: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
    personal: { name: '個人', color: 'green', borderColor: 'border-green-500', bgColor: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
    study: { name: '學習', color: 'purple', borderColor: 'border-purple-500', bgColor: 'bg-purple-500', textColor: 'text-purple-600 dark:text-purple-400' },
    health: { name: '健康', color: 'pink', borderColor: 'border-pink-500', bgColor: 'bg-pink-500', textColor: 'text-pink-600 dark:text-pink-400' },
    other: { name: '其他', color: 'gray', borderColor: 'border-gray-500', bgColor: 'bg-gray-500', textColor: 'text-gray-600 dark:text-gray-400' }
};

// 從 Cognito 載入自訂分類
function loadCustomCategories() {
    // 先嘗試從 localStorage 載入（離線備份）
    const localSaved = localStorage.getItem('customCategories');
    if (localSaved) {
        try {
            const customCategories = JSON.parse(localSaved);
            Object.assign(categories, customCategories);
        } catch (e) {
            console.error('從 localStorage 載入自訂分類失敗:', e);
        }
    }
    
    // 從 Cognito 載入
    CognitoAuth.getUserAttributes(function(err, attributes) {
        if (err) {
            console.log('無法從 Cognito 載入分類：', err.message);
            return;
        }
        
        const customCategoriesAttr = attributes.find(attr => attr.getName() === 'custom:categories');
        if (customCategoriesAttr) {
            try {
                const customCategories = JSON.parse(customCategoriesAttr.getValue());
                Object.assign(categories, customCategories);
                // 同步到 localStorage
                localStorage.setItem('customCategories', customCategoriesAttr.getValue());
                // 重新渲染側邊欄
                renderSidebar();
                renderCategoryOptions();
            } catch (e) {
                console.error('解析 Cognito 分類數據失敗:', e);
            }
        }
    });
}

// 保存自訂分類到 Cognito 和 localStorage
function saveCustomCategories() {
    const customCategories = {};
    Object.keys(categories).forEach(key => {
        if (key.startsWith('custom_')) {
            customCategories[key] = categories[key];
        }
    });
    
    const categoriesJSON = JSON.stringify(customCategories);
    
    // 儲存到 localStorage（離線備份）
    localStorage.setItem('customCategories', categoriesJSON);
    
    // 儲存到 Cognito
    CognitoAuth.updateUserAttributes([
        { Name: 'custom:categories', Value: categoriesJSON }
    ], function(err, result) {
        if (err) {
            console.error('保存分類到 Cognito 失敗:', err);
        } else {
            console.log('分類已同步到 Cognito');
        }
    });
}

// 注意：不在初始化時載入分類，而是在登入時載入
// 這樣可以確保每個用戶載入自己的分類

// 当前编辑的任务 ID，如果为 null 则是新增模式
let editingTaskId = null;

// 當前篩選的分類
let currentFilter = 'work';

// 當前排序方式
let currentSort = 'default';

// 是否處於刪除分類模式
let isDeletingCategory = false;

// 當前認證模式：'login' 或 'signup'
let authMode = 'login';

// 待驗證的Email
let pendingVerificationEmail = null;

// 獲取當前用戶 ID
async function getCurrentUserId() {
    return new Promise((resolve, reject) => {
        CognitoAuth.getCurrentUser(function(err, user) {
            if (err || !user) {
                reject(new Error('Failed to get current user'));
            } else {
                resolve(user.attributes.sub);
            }
        });
    });
}

// 從 API 載入任務
async function loadTasks() {
    try {
        const data = await TaskAPI.getTasks();
        
        // 合併自己的任務和共享任務
        const ownTasks = await Promise.all((data.tasks || []).map(async task => {
            const priority = task.priority !== undefined && task.priority !== null ? parseInt(task.priority) : 2;
            
            // 获取任务的共享列表 - 優先使用任務本身的 sharedWith 欄位
            let sharedWith = task.sharedWith || [];
            console.log('[Load Tasks] SharedWith for', task.taskId, ':', sharedWith);
            
            return {
                id: task.taskId,
                title: task.title,
                description: task.description || '',
                priority: isNaN(priority) ? 2 : priority,
                deadline: task.dueDate || '',
                category: task.category || 'personal',
                completed: task.completed || false,
                sharedWith: sharedWith,
                files: [],
                isShared: false
            };
        }));
        
        const sharedTasks = (data.sharedTasks || []).map(task => {
            const priority = task.priority !== undefined && task.priority !== null ? parseInt(task.priority) : 2;
            return {
                id: task.taskId,
                title: task.title,
                description: task.description || '',
                priority: isNaN(priority) ? 2 : priority,
                deadline: task.dueDate || '',
                category: task.category || 'personal',
                completed: task.completed || false,
                sharedWith: [],
                files: [],
                isShared: true,
                permission: task.sharedPermission,
                ownerId: task.userId,
                ownerEmail: task.ownerEmail  // 添加擁有者 email
            };
        });
        
        tasks = [...ownTasks, ...sharedTasks];
        
        renderTaskList();
    } catch (error) {
        console.error('Load tasks error:', error);
        alert('載入任務失敗：' + (error.message || '未知錯誤'));
    }
}

// --- 深色模式邏輯 ---
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

// 初始化檢查
if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    themeToggleLightIcon.classList.remove('hidden');
} else {
    document.documentElement.classList.remove('dark');
    themeToggleDarkIcon.classList.remove('hidden');
}

function toggleDarkMode() {
    // 切換圖示
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');

    // 切換 HTML class 並存入 localStorage
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('color-theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('color-theme', 'dark');
    }
}

// 切換密碼顯示/隱藏
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeSlashIcon = document.getElementById('eye-slash-icon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeSlashIcon.classList.remove('hidden');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeSlashIcon.classList.add('hidden');
    }
}

// --- 原有的 App 邏輯 ---

// 顯示錯誤訊息
function showError(message, autoHide = false) {
    const loginError = document.getElementById('login-error');
    const loginErrorMessage = document.getElementById('login-error-message');
    loginErrorMessage.textContent = message;
    loginError.classList.remove('hidden');
    
    // 只有在 autoHide 為 true 時才自動隱藏
    if (autoHide) {
        setTimeout(() => {
            loginError.classList.add('hidden');
        }, 5000);
    }
}

// 顯示成功訊息
function showSuccess(message) {
    const loginSuccess = document.getElementById('login-success');
    const loginSuccessMessage = document.getElementById('login-success-message');
    loginSuccessMessage.textContent = message;
    loginSuccess.classList.remove('hidden');
    setTimeout(() => {
        loginSuccess.classList.add('hidden');
    }, 5000);
}

// 切換登入/註冊模式
function toggleAuthMode() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    const authTitle = document.getElementById('auth-title');
    const authButton = document.getElementById('auth-button');
    const toggleAuth = document.getElementById('toggle-auth');
    const passwordHint = document.getElementById('password-hint');
    const verificationSection = document.getElementById('verification-section');
    const rememberMeSection = document.getElementById('remember-me-section');
    
    if (authMode === 'signup') {
        authTitle.textContent = '註冊新帳號';
        authButton.textContent = '註冊';
        toggleAuth.textContent = '已有帳號？登入';
        passwordHint.classList.remove('hidden');
        verificationSection.classList.add('hidden');
        rememberMeSection.classList.add('hidden'); // 註冊時隱藏
    } else {
        authTitle.textContent = '登入';
        authButton.textContent = '登入';
        toggleAuth.textContent = '還沒有帳號？註冊';
        passwordHint.classList.add('hidden');
        verificationSection.classList.add('hidden');
        rememberMeSection.classList.remove('hidden'); // 登入時顯示
    }
}

// 統一的認證處理
function handleAuth() {
    if (authMode === 'login') {
        loginWithCognito();
    } else {
        signUpWithCognito();
    }
}

// 使用 Cognito 註冊
function signUpWithCognito() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    // 驗證 Email
    if(!email) {
        showError('請輸入 Email');
        return;
    }
    
    // 驗證密碼強度
    if(!password || password.length < 8) {
        showError('密碼至少需要8個字元');
        return;
    }
    
    if (!/[A-Z]/.test(password)) {
        showError('密碼需包含至少一個大寫字母');
        return;
    }
    
    if (!/[a-z]/.test(password)) {
        showError('密碼需包含至少一個小寫字母');
        return;
    }
    
    if (!/[0-9]/.test(password)) {
        showError('密碼需包含至少一個數字');
        return;
    }
    
    // 驗證特殊符號
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        showError('密碼需包含至少一個特殊符號（如 !@#$%^&* 等）');
        return;
    }
    
    // 呼叫 Cognito 註冊
    CognitoAuth.signUp(email, password, function(err, result) {
        if (err) {
            if (err.code === 'UsernameExistsException') {
                showError('此 Email 已被註冊');
            } else if (err.code === 'InvalidPasswordException') {
                showError('密碼不符合要求');
            } else if (err.code === 'InvalidParameterException') {
                showError('Email 格式不正確');
            } else {
                showError(err.message || '註冊失敗，請稍後再試');
            }
            return;
        }
        
        // 註冊成功，顯示驗證碼輸入框
        pendingVerificationEmail = email;
        showSuccess('註冊成功！請檢查您的 Email 並輸入驗證碼');
        document.getElementById('verification-section').classList.remove('hidden');
    });
}

// 驗證帳號
function verifyAccount() {
    const code = document.getElementById('verification-code').value.trim();
    
    if (!code) {
        showError('請輸入驗證碼');
        return;
    }
    
    if (!pendingVerificationEmail) {
        showError('請先註冊');
        return;
    }
    
    CognitoAuth.confirmSignUp(pendingVerificationEmail, code, function(err, result) {
        if (err) {
            if (err.code === 'CodeMismatchException') {
                showError('驗證碼錯誤');
            } else if (err.code === 'ExpiredCodeException') {
                showError('驗證碼已過期，請重新發送');
            } else {
                showError(err.message || '驗證失敗');
            }
            return;
        }
        
        showSuccess('帳號驗證成功！請登入');
        setTimeout(() => {
            // 切換回登入模式
            authMode = 'signup'; // 設為 signup 以便 toggleAuthMode 切換到 login
            toggleAuthMode();
            document.getElementById('verification-section').classList.add('hidden');
            document.getElementById('email').value = pendingVerificationEmail;
            pendingVerificationEmail = null;
        }, 2000);
    });
}

// 重新發送驗證碼
function resendCode() {
    if (!pendingVerificationEmail) {
        showError('請先註冊');
        return;
    }
    
    CognitoAuth.resendConfirmationCode(pendingVerificationEmail, function(err, result) {
        if (err) {
            showError(err.message || '發送失敗');
            return;
        }
        showSuccess('驗證碼已重新發送到您的 Email');
    });
}

// 使用 Cognito 登入
function loginWithCognito() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    // 驗證 Email
    if(!email) {
        showError('請輸入 Email');
        return;
    }
    
    // 驗證密碼
    if(!password) {
        showError('請輸入密碼');
        return;
    }
    
    // 呼叫 Cognito 登入
    CognitoAuth.signIn(email, password, function(err, result) {
        if (err) {
            if (err.code === 'UserNotConfirmedException') {
                showError('帳號尚未驗證，請檢查您的 Email');
                pendingVerificationEmail = email;
                document.getElementById('verification-section').classList.remove('hidden');
            } else if (err.code === 'NotAuthorizedException') {
                showError('Email 或密碼錯誤');
            } else if (err.code === 'UserNotFoundException') {
                showError('此 Email 尚未註冊');
            } else {
                showError(err.message || '登入失敗，請稍後再試');
            }
            return;
        }
        
        // 登入成功 - 儲存登入偏好
        if (rememberMe) {
            localStorage.setItem('rememberLogin', 'true');
        } else {
            sessionStorage.setItem('tempLogin', 'true');
        }
        
        showSuccess('登入成功！');
        setTimeout(() => {
            startApp(email);
        }, 1000);
    });
}

// 啟動應用程式
function startApp(email) {
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('login-success').classList.add('hidden');
    
    // 重置分類為預設值
    categories = {
        work: { name: '工作', color: 'blue', borderColor: 'border-blue-500', bgColor: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
        personal: { name: '個人', color: 'green', borderColor: 'border-green-500', bgColor: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
        study: { name: '學習', color: 'purple', borderColor: 'border-purple-500', bgColor: 'bg-purple-500', textColor: 'text-purple-600 dark:text-purple-400' },
        health: { name: '健康', color: 'pink', borderColor: 'border-pink-500', bgColor: 'bg-pink-500', textColor: 'text-pink-600 dark:text-pink-400' },
        other: { name: '其他', color: 'gray', borderColor: 'border-gray-500', bgColor: 'bg-gray-500', textColor: 'text-gray-600 dark:text-gray-400' }
    };
    
    // 從 Cognito 載入該用戶的自訂分類
    loadCustomCategories();
    
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('user-email').innerText = email;
    document.getElementById('fab-button').classList.remove('hidden');
    document.getElementById('calendar-button').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    
    // 設定初始標題
    const categoryTitle = document.getElementById('category-title');
    if (categoryTitle) {
        if (currentFilter === 'all') {
            categoryTitle.textContent = '所有任務';
        } else if (currentFilter === 'shared') {
            categoryTitle.textContent = '與我共用';
        } else if (categories[currentFilter]) {
            categoryTitle.textContent = categories[currentFilter].name;
        }
    }
    
    // 從 API 載入任務
    loadTasks();
}

function logout() {
    // 清除登入偏好
    localStorage.removeItem('rememberLogin');
    sessionStorage.removeItem('tempLogin');
    
    // 清除自訂分類
    localStorage.removeItem('customCategories');
    
    // 重置分類為預設值
    categories = {
        work: { name: '工作', color: 'blue', borderColor: 'border-blue-500', bgColor: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
        personal: { name: '個人', color: 'green', borderColor: 'border-green-500', bgColor: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
        study: { name: '學習', color: 'purple', borderColor: 'border-purple-500', bgColor: 'bg-purple-500', textColor: 'text-purple-600 dark:text-purple-400' },
        health: { name: '健康', color: 'pink', borderColor: 'border-pink-500', bgColor: 'bg-pink-500', textColor: 'text-pink-600 dark:text-pink-400' },
        other: { name: '其他', color: 'gray', borderColor: 'border-gray-500', bgColor: 'bg-gray-500', textColor: 'text-gray-600 dark:text-gray-400' }
    };
    
    // Cognito 登出
    CognitoAuth.signOut();
    
    // 清空任務資料
    tasks = [];
    
    const authSection = document.getElementById('auth-section');
    authSection.classList.remove('hidden');
    authSection.style.opacity = '1';
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('fab-button').classList.add('hidden');
    document.getElementById('calendar-button').classList.add('hidden');
    document.getElementById('sidebar').classList.add('hidden');
    closeTaskModal();
    closeCalendarModal();
}

async function saveTask() {
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-description').value;
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const category = document.querySelector('input[name="category"]:checked').value;
    const deadline = document.getElementById('task-deadline').value;
    const sharedEmails = Array.from(document.querySelectorAll('#email-tags .email-tag')).map(tag => tag.dataset.email);
    
    if(!title) return alert('請輸入標題');
    
    try {
        if (editingTaskId !== null) {
            // 编辑模式 - 先更新本地任務
            const task = tasks.find(t => t.id === editingTaskId);
            if (task) {
                task.title = title;
                task.description = description;
                task.priority = parseInt(priority);
                task.category = category;
                task.deadline = deadline || '';
                task.sharedWith = sharedEmails; // 更新共享信息
                
                // 立即關閉對話框並渲染
                closeTaskModal();
                renderTaskList();
                
                // 背景更新 API
                const updateData = {
                    title: title,
                    description: description,
                    priority: priority,
                    category: category,
                    dueDate: deadline || null,
                    sharedWith: sharedEmails  // 將共享列表傳給後端
                };
                
                TaskAPI.updateTask(editingTaskId, updateData).then(() => {
                    // 处理共享对象
                    if (sharedEmails.length > 0) {
                        for (const email of sharedEmails) {
                            TaskAPI.shareTask(editingTaskId, email, 'edit').catch(err => {
                                console.warn('Share task failed for', email, err);
                            });
                        }
                    }
                }).catch(error => {
                    console.error('Update task error:', error);
                    alert('更新失敗：' + (error.message || '未知錯誤'));
                    loadTasks(); // 失敗時重新載入
                });
            }
        } else {
            // 新增模式 - 先創建本地臨時任務
            const tempId = 'temp_' + Date.now();
            const tempTask = {
                id: tempId,
                title: title,
                description: description,
                priority: parseInt(priority),
                deadline: deadline || '',
                category: category,
                completed: false,
                sharedWith: sharedEmails,
                files: [],
                isShared: false
            };
            
            // 立即添加到任務列表並顯示
            tasks.unshift(tempTask);
            closeTaskModal();
            renderTaskList();
            
            // 背景創建實際任務
            const taskData = {
                title: title,
                description: description,
                priority: priority,
                category: category,
                dueDate: deadline || null,
                sharedWith: sharedEmails  // 將共享列表傳給後端
            };
            
            console.log('[Save Task] Creating task:', taskData);
            TaskAPI.createTask(taskData).then(async result => {
                console.log('[Save Task] Create result:', result);
                const newTaskId = result.taskId;
                
                // 替換臨時 ID 為真實 ID
                const taskIndex = tasks.findIndex(t => t.id === tempId);
                if (taskIndex !== -1) {
                    tasks[taskIndex].id = newTaskId;
                }
                
                // 处理共享 - 等待所有共享操作完成
                if (sharedEmails.length > 0 && newTaskId) {
                    console.log('[Save Task] Sharing with:', sharedEmails);
                    try {
                        const shareResults = await Promise.allSettled(sharedEmails.map(email => 
                            TaskAPI.shareTask(newTaskId, email, 'edit')
                                .then(result => {
                                    console.log('[Save Task] ✓ Shared with', email, '- Result:', result);
                                    return { email, success: true, result };
                                })
                                .catch(err => {
                                    console.error('[Save Task] ✗ Share failed for', email, '- Error:', err);
                                    return { email, success: false, error: err };
                                })
                        ));
                        
                        console.log('[Save Task] Share results:', shareResults);
                        
                        // 只保留成功共享的 email
                        const successfulEmails = shareResults
                            .filter(r => r.status === 'fulfilled' && r.value.success)
                            .map(r => r.value.email);
                        
                        const failedEmails = shareResults
                            .filter(r => r.status === 'fulfilled' && !r.value.success)
                            .map(r => r.value.email);
                        
                        if (failedEmails.length > 0) {
                            alert(`以下 Email 分享失敗（用戶可能不存在）：\n${failedEmails.join('\n')}`);
                        }
                        
                        // 更新 sharedWith 為成功的 email
                        if (taskIndex !== -1) {
                            tasks[taskIndex].sharedWith = successfulEmails;
                            renderTaskList();
                        }
                    } catch (err) {
                        console.error('[Save Task] Unexpected error:', err);
                        if (taskIndex !== -1) {
                            tasks[taskIndex].sharedWith = [];
                            renderTaskList();
                        }
                    }
                } else {
                    // 沒有共享，直接渲染
                    renderTaskList();
                }
            }).catch(error => {
                console.error('Save task error:', error);
                // 移除臨時任務
                tasks = tasks.filter(t => t.id !== tempId);
                renderTaskList();
                alert('儲存失敗：' + (error.message || '未知錯誤'));
            });
        }
    } catch (error) {
        console.error('Save task error:', error);
        alert('儲存失敗：' + (error.message || '未知錯誤'));
    }
}

// 開啟模態視窗 - 新增模式
function openTaskModal() {
    editingTaskId = null;
    document.getElementById('modal-title').textContent = '新增待辦事項';
    document.getElementById('save-task-btn').textContent = '新增事項';
    document.getElementById('delete-task-btn').classList.add('hidden');
    clearTaskForm();
    renderCategoryOptions('work'); // 渲染分類選項
    document.getElementById('task-modal').classList.remove('hidden');
}

// 開啟模態視窗 - 编辑模式
async function openEditTaskModal(taskId) {
    editingTaskId = taskId;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('modal-title').textContent = '編輯待辦事項';
    document.getElementById('save-task-btn').textContent = '儲存修改';
    document.getElementById('delete-task-btn').classList.remove('hidden');
    
    // 预填表单
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-deadline').value = task.deadline || '';
    document.querySelector(`input[name="priority"][value="${task.priority}"]`).checked = true;
    
    // 渲染分類選項並選擇當前分類
    renderCategoryOptions(task.category || 'work');
    
    // 填充共享对象 - 从任务本身获取
    const emailTags = document.getElementById('email-tags');
    emailTags.innerHTML = '';
    
    if (task.sharedWith && task.sharedWith.length > 0) {
        task.sharedWith.forEach(email => {
            const tag = document.createElement('span');
            tag.className = 'email-tag inline-flex items-center gap-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm';
            tag.dataset.email = email;
            tag.innerHTML = `
                ${email}
                <button type="button" onclick="this.parentElement.remove()" class="hover:text-red-500 font-bold">×</button>
            `;
            emailTags.appendChild(tag);
        });
    }
    
    document.getElementById('task-modal').classList.remove('hidden');
}

// 關閉模態視窗
function closeTaskModal() {
    document.getElementById('task-modal').classList.add('hidden');
    clearTaskForm();
}

// 清空表单
function clearTaskForm() {
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-deadline').value = '';
    document.getElementById('share-with').value = '';
    document.getElementById('email-tags').innerHTML = '';
    document.querySelector('input[name="priority"][value="0"]').checked = true;
}

// 渲染分類選項（用於任務模態視窗）
function renderCategoryOptions(selectedCategory = 'work') {
    const container = document.getElementById('category-options');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(categories).forEach(categoryId => {
        const category = categories[categoryId];
        const isChecked = categoryId === selectedCategory ? 'checked' : '';
        
        const label = document.createElement('label');
        label.className = 'cursor-pointer';
        label.innerHTML = `
            <input type="radio" name="category" value="${categoryId}" class="peer hidden" ${isChecked}>
            <div class="border-2 dark:border-gray-600 rounded-lg p-2 text-center transition peer-checked:border-${category.color}-500 peer-checked:bg-${category.color}-50 dark:peer-checked:bg-${category.color}-900/20 hover:bg-gray-50 dark:hover:bg-gray-700">
                <div class="w-4 h-4 rounded-full bg-${category.color}-500 mx-auto mb-1"></div>
                <div class="text-xs">${category.name}</div>
            </div>
        `;
        container.appendChild(label);
    });
}

// 切換側邊欄展開/收起
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// 按分類篩選
function filterByCategory(category) {
    // 如果處於刪除模式
    if (isDeletingCategory) {
        // 不能刪除預設分類
        const defaultCategories = ['all', 'shared', 'work', 'personal', 'study', 'health', 'other'];
        if (defaultCategories.includes(category)) {
            alert('無法刪除預設分類');
            return;
        }
        
        const categoryName = categories[category].name;
        const taskCount = tasks.filter(t => t.category === category).length;
        
        if (taskCount > 0) {
            if (!confirm(`分類「${categoryName}」有 ${taskCount} 個任務。\n\n刪除後，這些任務將移到「工作」分類。\n\n確定要刪除嗎？`)) {
                return;
            }
            // 將任務移到工作分類
            tasks.forEach(task => {
                if (task.category === category) {
                    task.category = 'work';
                }
            });
        } else {
            if (!confirm(`確定要刪除分類「${categoryName}」嗎？`)) {
                return;
            }
        }
        
        // 刪除分類
        delete categories[category];
        
        // 保存到 localStorage
        saveCustomCategories();
        
        // 如果當前篩選的分類被刪除，切換到所有分類
        if (currentFilter === category) {
            currentFilter = 'all';
        }
        
        // 離開刪除模式
        isDeletingCategory = false;
        
        // 恢復刪除按鈕文字
        const deleteBtn = document.querySelector('.add-category-border button:last-child');
        if (deleteBtn) {
            deleteBtn.innerHTML = `
                <svg class="add-icon w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                <span class="sidebar-text font-medium text-red-700 dark:text-red-300 transition-opacity ml-2">刪除分類</span>
            `;
            deleteBtn.className = 'add-category-btn w-full flex items-center justify-center px-4 py-3 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition group mt-2';
        }
        
        // 重新渲染側邊欄和任務列表
        renderSidebar();
        renderTaskList();
        
        return;
    }
    
    // 正常篩選模式
    currentFilter = category;
    
    // 更新標題
    const categoryTitle = document.getElementById('category-title');
    if (categoryTitle) {
        if (category === 'all') {
            categoryTitle.textContent = '所有任務';
        } else if (category === 'shared') {
            categoryTitle.textContent = '與我共用';
        } else if (categories[category]) {
            categoryTitle.textContent = categories[category].name;
        }
    }
    
    // 更新按鈕狀態
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('filter-' + category).classList.add('active');
    
    // 重新渲染列表
    renderTaskList();
}

// 更新分類計數
function updateCategoryCounts() {
    // 初始化計數物件
    const counts = { all: 0, shared: 0 };
    Object.keys(categories).forEach(key => {
        counts[key] = 0;
    });
    
    // 計算每個分類的任務數
    tasks.forEach(task => {
        if (!task.completed) {
            counts.all++;
            // 計算共享任務（包含我分享给别人的 + 别人分享给我的）
            if ((task.sharedWith && task.sharedWith.length > 0) || task.isShared) {
                counts.shared++;
            }
            const category = task.category || 'other';
            if (counts[category] !== undefined) {
                counts[category]++;
            }
        }
    });
    
    // 更新 UI
    Object.keys(counts).forEach(key => {
        const countEl = document.getElementById('count-' + key);
        if (countEl) {
            countEl.textContent = counts[key];
        }
    });
}

// 改變排序選項
function changeSortOption() {
    currentSort = document.getElementById('sort-option').value;
    renderTaskList();
}

function renderTaskList() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';
    
    // 篩選任務
    let filteredTasks;
    if (currentFilter === 'all') {
        filteredTasks = tasks;
    } else if (currentFilter === 'shared') {
        // 包含：1) 我分享给别人的任务 2) 别人分享给我的任务
        filteredTasks = tasks.filter(task => 
            (task.sharedWith && task.sharedWith.length > 0) || task.isShared
        );
    } else {
        filteredTasks = tasks.filter(task => (task.category || 'other') === currentFilter);
    }

    // 排序任務
    switch(currentSort) {
        case 'priority-high':
            // 重要性從高到低
            filteredTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            break;
        case 'priority-low':
            // 重要性從低到高
            filteredTasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            break;
        case 'date-newest':
            // 日期從新到舊（最近創建的在前）
            filteredTasks.sort((a, b) => (b.id || 0) - (a.id || 0));
            break;
        case 'date-oldest':
            // 日期從舊到新（最早創建的在前）
            filteredTasks.sort((a, b) => (a.id || 0) - (b.id || 0));
            break;
        default:
            // 預設排序（保持原順序）
            break;
    }
    
    // 二次排序：將已完成的任務放在未完成任務的下面
    filteredTasks.sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    });
    
    if (filteredTasks.length === 0) {
        taskList.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">目前沒有任何待辦事項</p>';
        updateCategoryCounts();
        return;
    }

    filteredTasks.forEach(task => {
        const priorityMarks = task.priority > 0 ? '❗'.repeat(task.priority) + ' ' : '';
        // 確保分類存在，如果不存在則使用 'other'
        const categoryKey = (task.category && categories[task.category]) ? task.category : 'other';
        const category = categories[categoryKey];
        const borderColor = category.borderColor;
        const priorityColor = task.priority > 0 ? (task.priority === 3 ? 'text-red-500' : task.priority === 2 ? 'text-orange-500' : 'text-yellow-500') : 'text-gray-500';

        const taskElement = document.createElement('div');
        const completedStyle = task.completed ? 'opacity-50' : '';
        const strikethroughStyle = task.completed ? 'line-through' : '';
        taskElement.className = 'flex gap-3 items-start';
        
        let deadlineHTML = '';
        if (task.deadline) {
            const deadlineDate = new Date(task.deadline);
            const now = new Date();
            const isOverdue = deadlineDate < now;
            const deadlineColor = isOverdue ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400';
            const formattedDeadline = deadlineDate.toLocaleString('zh-TW', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            deadlineHTML = `<span class="text-sm ${deadlineColor}">截止時間：${formattedDeadline}</span>`;
        }

        let sharedHTML = '';
        if (task.isShared && task.ownerEmail) {
            sharedHTML = `<span class="text-xs bg-blue-100 dark:bg-blue-700 text-blue-600 dark:text-blue-300 px-2 py-1 rounded">來自：${task.ownerEmail}</span>`;
        } else if (task.sharedWith && task.sharedWith.length > 0) {
            sharedHTML = `<span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">共享給：${task.sharedWith.join(', ')}</span>`;
        }

        taskElement.innerHTML = `
            <div class="flex-shrink-0 pt-5">
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                       class="task-checkbox w-5 h-5 rounded border-2 border-gray-400 dark:border-gray-500 cursor-pointer appearance-none checked:bg-transparent checked:border-gray-600 dark:checked:border-gray-400 relative checked:after:content-['✓'] checked:after:absolute checked:after:text-gray-600 dark:checked:after:text-gray-400 checked:after:text-sm checked:after:left-[2px] checked:after:top-[-2px]"
                       data-task-id="${task.id}">
            </div>
            <div class="flex-1 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border-l-4 ${borderColor} cursor-pointer hover:shadow-md transition ${completedStyle}"
                 onclick="openEditTaskModal('${task.id}')">
                <h4 class="font-bold ${strikethroughStyle}"><span class="${priorityColor}">${priorityMarks}</span>${task.title}</h4>
                <div class="mt-2 flex flex-wrap gap-2 items-center">
                    ${deadlineHTML ? `<div>${deadlineHTML}</div>` : ''}
                    ${sharedHTML ? `<div>${sharedHTML}</div>` : ''}
                </div>
            </div>
        `;
        
        // 綁定 checkbox 事件
        const checkbox = taskElement.querySelector('.task-checkbox');
        checkbox.addEventListener('click', function(e) {
            toggleTaskCompletion(e, task.id);
        });
        
        taskList.appendChild(taskElement);
    });
    
    // 更新分類計數
    updateCategoryCounts();
}

// 删除当前编辑的任务
async function deleteCurrentTask() {
    if (editingTaskId !== null) {
        const task = tasks.find(t => t.id === editingTaskId);
        
        // 判断是共享任务还是自己的任务
        if (task && task.isShared) {
            // 共享任务：取消共享
            if (confirm('確定要取消接收此共享任務嗎？任務將從您的列表中移除，但原任務會保留。')) {
                try {
                    const currentUserId = await getCurrentUserId();
                    console.log('[Cancel Share] Current user ID:', currentUserId);
                    console.log('[Cancel Share] Task ID:', editingTaskId);
                    console.log('[Cancel Share] Calling removeShare...');
                    await TaskAPI.removeShare(editingTaskId, currentUserId);
                    console.log('[Cancel Share] Success!');
                    closeTaskModal();
                    await loadTasks();
                } catch (error) {
                    console.error('Cancel share error:', error);
                    alert('取消共享失敗：' + (error.message || '未知錯誤'));
                }
            }
        } else {
            // 自己的任务：真正删除
            if (confirm('確定要刪除這個任務嗎？此操作無法恢復。')) {
                try {
                    await TaskAPI.deleteTask(editingTaskId);
                    closeTaskModal();
                    await loadTasks();
                } catch (error) {
                    console.error('Delete task error:', error);
                    alert('刪除失敗：' + (error.message || '未知錯誤'));
                }
            }
        }
    }
}

// 切换任务完成状态
async function toggleTaskCompletion(event, taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        // 找到對應的 DOM 元素
        const checkbox = event.target;
        const taskCard = checkbox.closest('.flex.gap-3');
        
        try {
            const newCompleted = !task.completed;
            
            // 1. 立即更新本地狀態
            task.completed = newCompleted;
            
            // 2. 立即更新 UI（不重新渲染整個列表）
            if (taskCard) {
                const cardContent = taskCard.querySelector('.flex-1');
                const title = cardContent ? cardContent.querySelector('h4') : null;
                
                if (newCompleted) {
                    taskCard.style.opacity = '0.5';
                    if (title) title.style.textDecoration = 'line-through';
                } else {
                    taskCard.style.opacity = '1';
                    if (title) title.style.textDecoration = 'none';
                }
            }
            
            // 3. 更新分類計數
            updateCategoryCounts();
            
            // 4. 在背景更新 API
            TaskAPI.updateTask(taskId, { completed: newCompleted }).catch(error => {
                console.error('Toggle task error:', error);
                // 如果更新失敗，回滾並重新渲染
                task.completed = !newCompleted;
                renderTaskList();
                alert('更新失敗：' + (error.message || '未知錯誤'));
            });
        } catch (error) {
            console.error('Toggle task UI error:', error);
            // UI 更新失敗，使用完整渲染
            task.completed = !task.completed;
            renderTaskList();
        }
    }
}

// 刪除任务 (保留用于其他地方调用)
async function deleteTask(taskId) {
    if (confirm('確定要刪除這個任务嗎？')) {
        try {
            await TaskAPI.deleteTask(taskId);
            await loadTasks();
        } catch (error) {
            console.error('Delete task error:', error);
            alert('刪除失敗：' + (error.message || '未知錯誤'));
        }
    }
}

// 點擊背景關閉模態視窗
function closeModalOnBackdrop(event, modalId) {
    if(event.target === event.currentTarget) {
        if(modalId === 'calendar-modal') {
            closeCalendarModal();
        } else if(modalId === 'category-modal') {
            closeCategoryModal();
        } else {
            closeTaskModal();
        }
    }
}

// 處理 Email 輸入
function handleEmailInput(event) {
    const input = event.target;
    const value = input.value.trim();
    
    // 按 Enter 或逗號添加 Email
    if ((event.key === 'Enter' || event.key === ',') && value) {
        event.preventDefault();
        addEmailTag(value.replace(',', ''));
        input.value = '';
    }
    // 按 Backspace 且輸入框為空時刪除最後一個標籤
    else if (event.key === 'Backspace' && !value) {
        const tags = document.querySelectorAll('#email-tags .email-tag');
        if (tags.length > 0) {
            tags[tags.length - 1].remove();
        }
    }
}

// 添加 Email 標籤
function addEmailTag(email) {
    email = email.trim();
    if (!email) return;
    
    // 簡單的 Email 驗證
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        alert('請輸入有效的 Email 地址');
        return;
    }
    
    // 檢查是否已存在
    const existingTags = Array.from(document.querySelectorAll('#email-tags .email-tag')).map(tag => tag.dataset.email);
    if (existingTags.includes(email)) {
        alert('此 Email 已經添加');
        return;
    }
    
    const tagsContainer = document.getElementById('email-tags');
    const tag = document.createElement('span');
    tag.className = 'email-tag inline-flex items-center gap-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded text-sm';
    tag.dataset.email = email;
    tag.innerHTML = `
        ${email}
        <button type="button" onclick="this.parentElement.remove()" class="hover:text-red-500 font-bold">×</button>
    `;
    tagsContainer.appendChild(tag);
}

// --- 行事曆功能 ---
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

function openCalendarModal() {
    // 重置到當前年月
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    
    document.getElementById('calendar-modal').classList.remove('hidden');
    renderCalendar();
}

function closeCalendarModal() {
    document.getElementById('calendar-modal').classList.add('hidden');
}

function previousMonth() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
}

function renderCalendar() {
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    document.getElementById('calendar-month-year').textContent = `${currentYear} 年 ${monthNames[currentMonth]}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
    const todayDate = today.getDate();

    const calendarDays = document.getElementById('calendar-days');
    calendarDays.innerHTML = '';

    // 空白日期
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'text-center py-3';
        calendarDays.appendChild(emptyDay);
    }

    // 渲染日期
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTasks = tasks.filter(task => task.deadline && task.deadline.startsWith(dateStr) && !task.completed);
        
        const dayElement = document.createElement('div');
        const isToday = isCurrentMonth && day === todayDate;
        
        dayElement.className = `text-center py-2 rounded cursor-pointer transition relative ${
            isToday 
                ? 'bg-gray-600 text-white font-bold' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }`;
        
        // 日期数字
        const dayNumber = document.createElement('div');
        dayNumber.className = 'text-sm mb-1';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);
        
        // 待办事项指示器 - iPhone 风格小圆点
        if (dayTasks.length > 0) {
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'flex justify-center gap-0.5';
            
            // 最多显示 3 个圆点
            const displayCount = Math.min(dayTasks.length, 3);
            for (let i = 0; i < displayCount; i++) {
                const dot = document.createElement('div');
                const task = dayTasks[i];
                // 確保分類存在，如果不存在則使用 'other'
                const categoryKey = (task.category && categories[task.category]) ? task.category : 'other';
                const category = categories[categoryKey];
                let dotColor = isToday ? category.bgColor.replace('500', '300') : category.bgColor;
                
                dot.className = `w-1 h-1 rounded-full ${dotColor}`;
                dotsContainer.appendChild(dot);
            }
            dayElement.appendChild(dotsContainer);
            
            // 添加懸浮事件
            dayElement.addEventListener('mouseenter', (e) => showCalendarTooltip(e, dayTasks));
            dayElement.addEventListener('mouseleave', hideCalendarTooltip);
        }
        
        dayElement.onclick = () => selectDate(day);
        calendarDays.appendChild(dayElement);
    }
}

function selectDate(day) {
    const selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTasks = tasks.filter(task => task.deadline && task.deadline.startsWith(selectedDate) && !task.completed);
    
    if (dayTasks.length === 0) {
        alert(`${selectedDate}\n無待辦事項`);
    } else {
        const now = new Date();
        let taskList = `${selectedDate}\n\n共 ${dayTasks.length} 項待辦事項：\n\n`;
        dayTasks.forEach((task, index) => {
            const priorityMarks = task.priority > 0 ? '❗'.repeat(task.priority) + ' ' : '';
            const time = task.deadline.includes('T') ? task.deadline.split('T')[1] : '';
            const deadlineDate = new Date(task.deadline);
            const overdueMarker = deadlineDate < now ? ' (已逾期)' : '';
            taskList += `${index + 1}. ${priorityMarks}${task.title}${time ? ' (' + time + ')' : ''}${overdueMarker}\n`;
            if (task.description) {
                taskList += `   ${task.description}\n`;
            }
            taskList += '\n';
        });
        alert(taskList);
    }
}

// 显示日曆懸浮提示
function showCalendarTooltip(event, dayTasks) {
    const tooltip = document.getElementById('calendar-tooltip');
    if (!tooltip) return;
    
    let content = '<div class="space-y-2">';
    dayTasks.forEach(task => {
        const priorityMarks = task.priority > 0 ? '❗'.repeat(task.priority) + ' ' : '';
        // 確保分類存在，如果不存在則使用 'other'
        const categoryKey = (task.category && categories[task.category]) ? task.category : 'other';
        const category = categories[categoryKey];
        const priorityColor = category.textColor;
        
        const strikethrough = task.completed ? 'line-through opacity-60' : '';
        
        content += `
            <div class="text-sm ${strikethrough}">
                <div class="font-semibold ${priorityColor}">${priorityMarks}${task.title}</div>
            </div>
        `;
    });
    content += '</div>';
    
    tooltip.innerHTML = content;
    
    // 定位提示框
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // 預設在上方顯示
    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    
    // 如果上方空間不足，則在下方顯示
    if (top < 0) {
        top = rect.bottom + 10;
    }
    
    // 確保不超出左右邊界
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.classList.add('show');
}

// 隐藏日曆懸浮提示
function hideCalendarTooltip() {
    const tooltip = document.getElementById('calendar-tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
}

// 開啟新增分類模態視窗
function openAddCategoryModal() {
    document.getElementById('category-name').value = '';
    document.querySelector('input[name="category-color"][value="blue"]').checked = true;
    document.getElementById('category-modal').classList.remove('hidden');
}

// 關閉新增分類模態視窗
function closeCategoryModal() {
    document.getElementById('category-modal').classList.add('hidden');
}

// 開啟刪除分類模態視窗
function openDeleteCategoryModal() {
    // 獲取所有自訂分類
    const customCategories = Object.keys(categories).filter(key => key.startsWith('custom_'));
    
    if (customCategories.length === 0) {
        alert('沒有可刪除的自訂分類');
        return;
    }
    
    // 切換刪除模式
    isDeletingCategory = !isDeletingCategory;
    
    if (isDeletingCategory) {
        // 進入刪除模式，重新渲染側邊欄以顯示刪除按鈕
        renderSidebar();
        // 更改刪除按鈕文字
        const deleteBtn = document.querySelector('.add-category-border button:last-child');
        if (deleteBtn) {
            deleteBtn.innerHTML = `
                <svg class="add-icon w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                <span class="sidebar-text font-medium text-gray-700 dark:text-gray-300 transition-opacity ml-2">取消</span>
            `;
            deleteBtn.className = 'add-category-btn w-full flex items-center justify-center px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition group mt-2';
        }
    } else {
        // 離開刪除模式，恢復正常顯示
        renderSidebar();
        // 恢復刪除按鈕文字
        const deleteBtn = document.querySelector('.add-category-border button:last-child');
        if (deleteBtn) {
            deleteBtn.innerHTML = `
                <svg class="add-icon w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                <span class="sidebar-text font-medium text-red-700 dark:text-red-300 transition-opacity ml-2">刪除分類</span>
            `;
            deleteBtn.className = 'add-category-btn w-full flex items-center justify-center px-4 py-3 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition group mt-2';
        }
    }
}

// 儲存新分類
function saveCategory() {
    const name = document.getElementById('category-name').value.trim();
    const color = document.querySelector('input[name="category-color"]:checked').value;
    
    if (!name) {
        alert('請輸入分類名稱');
        return;
    }
    
    // 生成分類 ID（使用時間戳 + 隨機數）
    const categoryId = 'custom_' + Date.now();
    
    // 添加到 categories 物件
    categories[categoryId] = {
        name: name,
        color: color,
        borderColor: `border-${color}-500`,
        bgColor: `bg-${color}-500`,
        textColor: `text-${color}-600 dark:text-${color}-400`
    };
    
    // 保存到 localStorage
    saveCustomCategories();
    
    // 重新渲染側邊欄
    renderSidebar();
    
    // 更新任務模態視窗中的分類選項
    renderCategoryOptions();
    
    // 關閉模態視窗
    closeCategoryModal();
    
    alert('分類新增成功！');
}

// 渲染側邊欄分類列表
function renderSidebar() {
    const nav = document.querySelector('#sidebar nav');
    nav.innerHTML = '';
    
    // 首先添加「所有任務」按鈕
    const allCount = tasks.filter(t => !t.completed).length;
    const allActive = currentFilter === 'all' ? 'active' : '';
    
    const allButton = document.createElement('button');
    allButton.onclick = () => filterByCategory('all');
    allButton.id = 'filter-all';
    allButton.className = `w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition group category-filter ${allActive}`;
    
    // 在刪除模式下，預設分類不顯示刪除按鈕
    allButton.innerHTML = `
        <div class="flex items-center space-x-3">
            <svg class="category-icon w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
            </svg>
            <span class="sidebar-text font-medium text-gray-700 dark:text-gray-300 transition-opacity">所有任務</span>
        </div>
        <span id="count-all" class="category-count text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full transition-opacity">${allCount}</span>
    `;
    nav.appendChild(allButton);
    
    // 添加「與我共用」按鈕
    const sharedCount = tasks.filter(t => !t.completed && ((t.sharedWith && t.sharedWith.length > 0) || t.isShared)).length;
    const sharedActive = currentFilter === 'shared' ? 'active' : '';
    
    const sharedButton = document.createElement('button');
    sharedButton.onclick = () => filterByCategory('shared');
    sharedButton.id = 'filter-shared';
    sharedButton.className = `w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition group category-filter ${sharedActive}`;
    sharedButton.innerHTML = `
        <div class="flex items-center space-x-3">
            <svg class="category-icon w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path>
            </svg>
            <span class="sidebar-text font-medium text-gray-700 dark:text-gray-300 transition-opacity">與我共用</span>
        </div>
        <span id="count-shared" class="category-count text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full transition-opacity">${sharedCount}</span>
    `;
    nav.appendChild(sharedButton);
    
    // 遍歷所有分類
    Object.keys(categories).forEach(categoryId => {
        const category = categories[categoryId];
        const count = tasks.filter(t => !t.completed && (t.category || 'other') === categoryId).length;
        const isActive = currentFilter === categoryId ? 'active' : '';
        const isCustom = categoryId.startsWith('custom_');
        const isDefaultCategory = ['work', 'personal', 'study', 'health', 'other'].includes(categoryId);
        
        const button = document.createElement('button');
        button.onclick = () => filterByCategory(categoryId);
        button.id = `filter-${categoryId}`;
        
        // 在刪除模式下，自訂分類顯示紅色樣式
        if (isDeletingCategory && isCustom) {
            button.className = `w-full flex items-center justify-between px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition group category-filter border-2 border-red-300 dark:border-red-700`;
        } else {
            button.className = `w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition group category-filter ${isActive}`;
        }
        
        button.innerHTML = `
            <div class="flex items-center space-x-3">
                ${isDeletingCategory && isCustom ? `
                    <svg class="category-icon w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                ` : `
                    <div class="category-icon w-3 h-3 rounded-full bg-${category.color}-500 flex-shrink-0"></div>
                `}
                <span class="sidebar-text font-medium ${isDeletingCategory && isCustom ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'} transition-opacity">${category.name}</span>
            </div>
            <span id="count-${categoryId}" class="category-count text-sm ${isDeletingCategory && isCustom ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full transition-opacity">${count}</span>
        `;
        nav.appendChild(button);
    });
}

// DOMContentLoaded 事件处理
document.addEventListener('DOMContentLoaded', function() {
    // 注意：自動登入邏輯已移至文件末尾的 checkAutoLogin() 函數
});

// 自动登录检查
(function checkAutoLogin() {
    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAutoLogin);
        return;
    }
    
    const rememberLogin = localStorage.getItem('rememberLogin');
    const tempLogin = sessionStorage.getItem('tempLogin');
    
    const authSection = document.getElementById('auth-section');
    
    // 如果沒有記住登入，直接顯示登入頁面
    if (!rememberLogin && !tempLogin) {
        if (authSection) authSection.style.opacity = '1';
        return;
    }
    
    // 有自動登入，保持登入頁面隱藏狀態
    if (authSection) authSection.style.opacity = '0';
    
    // 立即嘗試自動登入（不延遲）
    if (typeof CognitoAuth !== 'undefined') {
        CognitoAuth.getCurrentUser(function(err, user) {
            if (!err && user) {
                // 自動登入成功
                startApp(user.attributes.email);
            } else {
                // 自動登入失敗，顯示登入頁面
                if (authSection) authSection.style.opacity = '1';
            }
        });
    } else {
        // SDK 未載入，顯示登入頁面
        if (authSection) authSection.style.opacity = '1';
    }
})();

// ========== 忘記密碼功能 ==========

let forgotPasswordEmail = '';

// 開啟忘記密碼模態視窗
function openForgotPasswordModal() {
    document.getElementById('forgot-password-modal').classList.remove('hidden');
    document.getElementById('forgot-step-1').classList.remove('hidden');
    document.getElementById('forgot-step-2').classList.add('hidden');
    document.getElementById('forgot-email').value = '';
    document.getElementById('reset-code').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
    hideForgotMessages();
}

// 關閉忘記密碼模態視窗
function closeForgotPasswordModal() {
    document.getElementById('forgot-password-modal').classList.add('hidden');
    hideForgotMessages();
}

// 發送重設密碼驗證碼
function sendResetCode() {
    const email = document.getElementById('forgot-email').value.trim();
    
    if (!email) {
        showForgotError('請輸入 Email');
        return;
    }
    
    hideForgotMessages();
    
    CognitoAuth.forgotPassword(email, function(err, result) {
        if (err) {
            if (err.code === 'UserNotFoundException') {
                showForgotError('此 Email 尚未註冊');
            } else if (err.code === 'LimitExceededException') {
                showForgotError('請求過於頻繁，請稍後再試');
            } else {
                showForgotError(err.message || '發送失敗');
            }
            return;
        }
        
        forgotPasswordEmail = email;
        showForgotSuccess('驗證碼已發送到您的 Email，請查收');
        
        // 2秒後切換到步驟2
        setTimeout(() => {
            document.getElementById('forgot-step-1').classList.add('hidden');
            document.getElementById('forgot-step-2').classList.remove('hidden');
        }, 2000);
    });
}

// 確認重設密碼
function confirmResetPassword() {
    const code = document.getElementById('reset-code').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    
    hideResetMessages();
    
    // 驗證輸入
    if (!code) {
        showResetError('請輸入驗證碼');
        return;
    }
    
    if (!newPassword || newPassword.length < 8) {
        showResetError('密碼至少需要8個字元');
        return;
    }
    
    if (!/[A-Z]/.test(newPassword)) {
        showResetError('密碼需包含至少一個大寫字母');
        return;
    }
    
    if (!/[a-z]/.test(newPassword)) {
        showResetError('密碼需包含至少一個小寫字母');
        return;
    }
    
    if (!/[0-9]/.test(newPassword)) {
        showResetError('密碼需包含至少一個數字');
        return;
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        showResetError('密碼需包含至少一個特殊符號（如 !@#$%^&* 等）');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showResetError('兩次輸入的密碼不一致');
        return;
    }
    
    // 確認重設密碼
    CognitoAuth.confirmPassword(forgotPasswordEmail, code, newPassword, function(err, result) {
        if (err) {
            if (err.code === 'CodeMismatchException') {
                showResetError('驗證碼錯誤');
            } else if (err.code === 'ExpiredCodeException') {
                showResetError('驗證碼已過期，請重新發送');
            } else if (err.code === 'InvalidPasswordException') {
                showResetError('密碼不符合要求');
            } else {
                showResetError(err.message || '重設失敗');
            }
            return;
        }
        
        // 成功
        showSuccess('密碼重設成功，請使用新密碼登入');
        closeForgotPasswordModal();
    });
}

// 返回步驟1
function backToStep1() {
    document.getElementById('forgot-step-2').classList.add('hidden');
    document.getElementById('forgot-step-1').classList.remove('hidden');
    hideResetMessages();
}

// 顯示/隱藏忘記密碼錯誤訊息
function showForgotError(message) {
    const errorDiv = document.getElementById('forgot-error');
    const errorMessage = document.getElementById('forgot-error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showForgotSuccess(message) {
    const successDiv = document.getElementById('forgot-success');
    const successMessage = document.getElementById('forgot-success-message');
    successMessage.textContent = message;
    successDiv.classList.remove('hidden');
}

function hideForgotMessages() {
    document.getElementById('forgot-error').classList.add('hidden');
    document.getElementById('forgot-success').classList.add('hidden');
}

function showResetError(message) {
    const errorDiv = document.getElementById('reset-error');
    const errorMessage = document.getElementById('reset-error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideResetMessages() {
    document.getElementById('reset-error').classList.add('hidden');
}

// ========== 設定功能 ==========

// 開啟設定模態視窗
function openSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
}

// 關閉設定模態視窗
function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

// 從設定開啟修改密碼
function openChangePasswordFromSettings() {
    closeSettingsModal();
    openChangePasswordModal();
}

// ========== 修改密碼功能 ==========

// 開啟修改密碼模態視窗
function openChangePasswordModal() {
    document.getElementById('change-password-modal').classList.remove('hidden');
    document.getElementById('current-password').value = '';
    document.getElementById('change-new-password').value = '';
    document.getElementById('change-confirm-password').value = '';
    hideChangeMessages();
}

// 關閉修改密碼模態視窗
function closeChangePasswordModal() {
    document.getElementById('change-password-modal').classList.add('hidden');
    hideChangeMessages();
}

// 修改密碼
function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('change-new-password').value;
    const confirmPassword = document.getElementById('change-confirm-password').value;
    
    hideChangeMessages();
    
    // 驗證輸入
    if (!currentPassword) {
        showChangeError('請輸入目前密碼');
        return;
    }
    
    if (!newPassword || newPassword.length < 8) {
        showChangeError('新密碼至少需要8個字元');
        return;
    }
    
    if (!/[A-Z]/.test(newPassword)) {
        showChangeError('新密碼需包含至少一個大寫字母');
        return;
    }
    
    if (!/[a-z]/.test(newPassword)) {
        showChangeError('新密碼需包含至少一個小寫字母');
        return;
    }
    
    if (!/[0-9]/.test(newPassword)) {
        showChangeError('新密碼需包含至少一個數字');
        return;
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        showChangeError('新密碼需包含至少一個特殊符號（如 !@#$%^&* 等）');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showChangeError('兩次輸入的新密碼不一致');
        return;
    }
    
    if (currentPassword === newPassword) {
        showChangeError('新密碼不能與目前密碼相同');
        return;
    }
    
    // 呼叫 Cognito 修改密碼
    CognitoAuth.changePassword(currentPassword, newPassword, function(err, result) {
        if (err) {
            if (err.code === 'NotAuthorizedException') {
                showChangeError('目前密碼錯誤');
            } else if (err.code === 'InvalidPasswordException') {
                showChangeError('新密碼不符合要求');
            } else if (err.code === 'LimitExceededException') {
                showChangeError('請求過於頻繁，請稍後再試');
            } else {
                showChangeError(err.message || '修改失敗');
            }
            return;
        }
        
        // 成功
        showChangeSuccess('密碼修改成功！');
        
        // 3秒後關閉視窗
        setTimeout(() => {
            closeChangePasswordModal();
        }, 2000);
    });
}

// 顯示/隱藏修改密碼訊息
function showChangeError(message) {
    const errorDiv = document.getElementById('change-error');
    const errorMessage = document.getElementById('change-error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showChangeSuccess(message) {
    const successDiv = document.getElementById('change-success');
    const successMessage = document.getElementById('change-success-message');
    successMessage.textContent = message;
    successDiv.classList.remove('hidden');
}

function hideChangeMessages() {
    document.getElementById('change-error').classList.add('hidden');
    document.getElementById('change-success').classList.add('hidden');
}

// ========== 刪除帳號功能 ==========

// 開啟刪除帳號模態視窗
function openDeleteAccountModal() {
    closeSettingsModal();
    document.getElementById('delete-account-modal').classList.remove('hidden');
    document.getElementById('delete-account-password').value = '';
    document.getElementById('delete-account-confirm').checked = false;
    hideDeleteAccountMessage();
}

// 關閉刪除帳號模態視窗
function closeDeleteAccountModal() {
    document.getElementById('delete-account-modal').classList.add('hidden');
    hideDeleteAccountMessage();
}

// 確認刪除帳號
function confirmDeleteAccount() {
    const password = document.getElementById('delete-account-password').value;
    const confirmed = document.getElementById('delete-account-confirm').checked;
    
    hideDeleteAccountMessage();
    
    // 驗證輸入
    if (!password) {
        showDeleteAccountError('請輸入密碼以確認刪除');
        return;
    }
    
    if (!confirmed) {
        showDeleteAccountError('請勾選確認框以繼續');
        return;
    }
    
    // 先驗證密碼是否正確
    const email = document.getElementById('user-email').textContent;
    CognitoAuth.signIn(email, password, function(err, result) {
        if (err) {
            showDeleteAccountError('密碼錯誤，無法刪除帳號');
            return;
        }
        
        // 密碼正確，執行刪除
        CognitoAuth.deleteAccount(function(err, result) {
            if (err) {
                if (err.code === 'NotAuthorizedException') {
                    showDeleteAccountError('無權限執行此操作');
                } else {
                    showDeleteAccountError(err.message || '刪除失敗，請稍後再試');
                }
                return;
            }
            
            // 刪除成功
            alert('帳號已成功刪除');
            
            // 清除所有本地資料
            localStorage.clear();
            sessionStorage.clear();
            
            // 登出並重新整理頁面
            CognitoAuth.signOut();
            window.location.reload();
        });
    });
}

// 顯示/隱藏刪除帳號錯誤訊息
function showDeleteAccountError(message) {
    const errorDiv = document.getElementById('delete-account-error');
    const errorMessage = document.getElementById('delete-account-error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideDeleteAccountMessage() {
    document.getElementById('delete-account-error').classList.add('hidden');
}

// 刪除所有已完成的任務
async function deleteAllCompletedTasks() {
    // 找出所有已完成的任務
    const completedTasks = tasks.filter(t => t.completed && !t.isShared);
    
    if (completedTasks.length === 0) {
        alert('沒有已完成的任務');
        return;
    }
    
    const confirmMessage = `確定要刪除 ${completedTasks.length} 個已完成的任務嗎？此操作無法恢復。`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // 先關閉設定視窗
        closeSettingsModal();
        
        // 立即從本地移除已完成的任務
        const completedIds = completedTasks.map(t => t.id);
        tasks = tasks.filter(t => !completedIds.includes(t.id));
        renderTaskList();
        
        // 背景刪除 API
        let successCount = 0;
        let failCount = 0;
        
        for (const task of completedTasks) {
            try {
                await TaskAPI.deleteTask(task.id);
                successCount++;
            } catch (error) {
                console.error('Failed to delete task', task.id, error);
                failCount++;
            }
        }
        
        if (failCount === 0) {
            alert(`成功刪除 ${successCount} 個已完成的任務`);
        } else {
            alert(`成功刪除 ${successCount} 個任務，${failCount} 個刪除失敗`);
            // 重新載入以同步狀態
            await loadTasks();
        }
    } catch (error) {
        console.error('Delete completed tasks error:', error);
        alert('刪除失敗：' + (error.message || '未知錯誤'));
        await loadTasks();
    }
}

// 開啟/關閉設定模態視窗
function openSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

