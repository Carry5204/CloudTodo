// 共享功能 UI 和邏輯

// 全域變數
let currentSharingTaskId = null;
let currentTaskShares = [];

// 顯示分享對話框
async function showShareDialog(taskId, taskTitle) {
    currentSharingTaskId = taskId;
    
    // 建立對話框
    const dialog = document.createElement('div');
    dialog.id = 'share-dialog';
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold">分享任務</h3>
                <button onclick="closeShareDialog()" class="text-gray-500 hover:text-gray-700">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="mb-4">
                <p class="text-sm text-gray-600 mb-2">任務：<span class="font-medium">${taskTitle}</span></p>
            </div>
            
            <!-- 分享表單 -->
            <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                <label class="block text-sm font-medium mb-2">分享給</label>
                <div class="flex gap-2 mb-3">
                    <input 
                        type="email" 
                        id="share-email" 
                        placeholder="輸入對方的 Email"
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                
                <label class="block text-sm font-medium mb-2">權限</label>
                <div class="flex gap-4 mb-3">
                    <label class="flex items-center cursor-pointer">
                        <input type="radio" name="permission" value="read" class="mr-2" />
                        <span class="text-sm">唯讀</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                        <input type="radio" name="permission" value="edit" checked class="mr-2" />
                        <span class="text-sm">可編輯</span>
                    </label>
                </div>
                
                <button 
                    onclick="handleShareTask()" 
                    class="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                    分享
                </button>
                
                <div id="share-message" class="mt-2 text-sm hidden"></div>
            </div>
            
            <!-- 已分享列表 -->
            <div>
                <h4 class="text-sm font-medium mb-2">已分享給</h4>
                <div id="shares-list" class="space-y-2 max-h-60 overflow-y-auto">
                    <div class="text-center py-4 text-gray-400 text-sm">
                        載入中...
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 載入現有的分享列表
    await loadTaskShares(taskId);
}

// 關閉分享對話框
function closeShareDialog() {
    const dialog = document.getElementById('share-dialog');
    if (dialog) {
        dialog.remove();
    }
    currentSharingTaskId = null;
    currentTaskShares = [];
}

// 處理分享任務
async function handleShareTask() {
    const emailInput = document.getElementById('share-email');
    const permissionRadios = document.getElementsByName('permission');
    const messageDiv = document.getElementById('share-message');
    
    const email = emailInput.value.trim();
    let permission = 'edit';
    
    for (const radio of permissionRadios) {
        if (radio.checked) {
            permission = radio.value;
            break;
        }
    }
    
    // 驗證
    if (!email) {
        showShareMessage('請輸入 Email', 'error');
        return;
    }
    
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showShareMessage('Email 格式不正確', 'error');
        return;
    }
    
    try {
        const result = await TaskAPI.shareTask(currentSharingTaskId, email, permission);
        showShareMessage('分享成功！', 'success');
        
        // 清空輸入
        emailInput.value = '';
        
        // 重新載入分享列表
        await loadTaskShares(currentSharingTaskId);
        
    } catch (error) {
        console.error('Share error:', error);
        showShareMessage(error.message || '分享失敗，請稍後再試', 'error');
    }
}

// 顯示分享訊息
function showShareMessage(message, type) {
    const messageDiv = document.getElementById('share-message');
    messageDiv.textContent = message;
    messageDiv.className = `mt-2 text-sm ${type === 'error' ? 'text-red-600' : 'text-green-600'}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}

// 載入任務的分享列表
async function loadTaskShares(taskId) {
    const listDiv = document.getElementById('shares-list');
    
    try {
        const shares = await TaskAPI.getTaskShares(taskId);
        currentTaskShares = shares;
        
        if (shares.length === 0) {
            listDiv.innerHTML = `
                <div class="text-center py-4 text-gray-400 text-sm">
                    尚未分享給任何人
                </div>
            `;
            return;
        }
        
        listDiv.innerHTML = shares.map(share => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                        <span class="text-sm font-medium">${share.sharedWithEmail}</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        權限: ${share.permission === 'edit' ? '可編輯' : '唯讀'} · 
                        ${new Date(share.sharedAt).toLocaleDateString('zh-TW')}
                    </div>
                </div>
                
                <div class="flex gap-1">
                    <button 
                        onclick="toggleSharePermission('${share.sharedWithUserId}', '${share.permission}')"
                        class="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="切換權限"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </button>
                    <button 
                        onclick="confirmRemoveShare('${share.sharedWithUserId}', '${share.sharedWithEmail}')"
                        class="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="移除分享"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Load shares error:', error);
        listDiv.innerHTML = `
            <div class="text-center py-4 text-red-500 text-sm">
                載入失敗
            </div>
        `;
    }
}

// 切換權限
async function toggleSharePermission(sharedUserId, currentPermission) {
    const newPermission = currentPermission === 'edit' ? 'read' : 'edit';
    
    try {
        await TaskAPI.updateSharePermission(currentSharingTaskId, sharedUserId, newPermission);
        showShareMessage('權限已更新', 'success');
        await loadTaskShares(currentSharingTaskId);
    } catch (error) {
        console.error('Update permission error:', error);
        showShareMessage('更新權限失敗', 'error');
    }
}

// 確認移除分享
function confirmRemoveShare(sharedUserId, email) {
    if (confirm(`確定要取消與 ${email} 的分享嗎？`)) {
        removeShareFromTask(sharedUserId);
    }
}

// 移除分享
async function removeShareFromTask(sharedUserId) {
    try {
        await TaskAPI.removeShare(currentSharingTaskId, sharedUserId);
        showShareMessage('已移除分享', 'success');
        await loadTaskShares(currentSharingTaskId);
    } catch (error) {
        console.error('Remove share error:', error);
        showShareMessage('移除失敗', 'error');
    }
}

// 在任務卡片上新增分享按鈕
function addShareButtonToTaskCard(taskElement, taskId, taskTitle, isOwner) {
    if (!isOwner) return; // 只有擁有者可以分享
    
    const actionsDiv = taskElement.querySelector('.task-actions') || createTaskActionsDiv(taskElement);
    
    const shareButton = document.createElement('button');
    shareButton.className = 'share-button p-1 text-blue-600 hover:bg-blue-50 rounded';
    shareButton.title = '分享';
    shareButton.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
    `;
    shareButton.onclick = (e) => {
        e.stopPropagation();
        showShareDialog(taskId, taskTitle);
    };
    
    actionsDiv.insertBefore(shareButton, actionsDiv.firstChild);
}

// 建立操作按鈕容器（如果不存在）
function createTaskActionsDiv(taskElement) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions flex gap-1';
    taskElement.appendChild(actionsDiv);
    return actionsDiv;
}

// 新增共享狀態標記到任務卡片
function addSharedBadge(taskElement, isShared, permission) {
    if (!isShared) return;
    
    const badge = document.createElement('span');
    badge.className = 'shared-badge inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded';
    badge.innerHTML = `
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        ${permission === 'edit' ? '可編輯' : '唯讀'}
    `;
    
    const titleElement = taskElement.querySelector('.task-title');
    if (titleElement) {
        titleElement.appendChild(badge);
    }
}

// 載入並顯示共享任務
async function loadAndDisplaySharedTasks() {
    try {
        const sharedTasks = await TaskAPI.getSharedTasks();
        
        // 更新側邊欄計數
        updateSharedTasksCount(sharedTasks.length);
        
        // 可以在這裡渲染共享任務到特定區域
        return sharedTasks;
        
    } catch (error) {
        console.error('Load shared tasks error:', error);
        return [];
    }
}

// 更新側邊欄共享任務計數
function updateSharedTasksCount(count) {
    const sharedBadge = document.getElementById('shared-tasks-count');
    if (sharedBadge) {
        sharedBadge.textContent = count;
        sharedBadge.style.display = count > 0 ? 'inline' : 'none';
    }
}

// 初始化共享功能
async function initSharingFeature() {
    // 載入共享任務
    await loadAndDisplaySharedTasks();
}
