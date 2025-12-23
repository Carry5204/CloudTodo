// API 配置
// ⚠️ 部署 Lambda 後，請更新 API_ENDPOINT
const apiConfig = {
    endpoint: 'https://ko0uo8tpfa.execute-api.us-east-1.amazonaws.com/Prod',
    // 例如：https://abc123.execute-api.ap-northeast-1.amazonaws.com/Prod
};

// API 調用工具
const API = {
    // 獲取授權標頭
    getAuthHeader: async function() {
        return new Promise((resolve, reject) => {
            CognitoAuth.getCurrentUser((err, user) => {
                if (err || !user) {
                    reject(new Error('User not authenticated'));
                    return;
                }
                resolve({
                    'Authorization': `Bearer ${user.session.getIdToken().getJwtToken()}`
                });
            });
        });
    },

    // GET 請求
    get: async function(path) {
        const headers = await this.getAuthHeader();
        const response = await fetch(`${apiConfig.endpoint}${path}`, {
            method: 'GET',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    },

    // POST 請求
    post: async function(path, data) {
        const headers = await this.getAuthHeader();
        const response = await fetch(`${apiConfig.endpoint}${path}`, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    },

    // PUT 請求
    put: async function(path, data) {
        const headers = await this.getAuthHeader();
        const response = await fetch(`${apiConfig.endpoint}${path}`, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    },

    // DELETE 請求
    delete: async function(path) {
        const headers = await this.getAuthHeader();
        const response = await fetch(`${apiConfig.endpoint}${path}`, {
            method: 'DELETE',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
};

// 任務 API 封裝
const TaskAPI = {
    // 獲取所有任務
    getTasks: async function() {
        try {
            const result = await API.get('/tasks');
            return result; // 返回完整的 { tasks: [], sharedTasks: [] }
        } catch (error) {
            console.error('Get tasks error:', error);
            throw error;
        }
    },

    // 創建任務
    createTask: async function(taskData) {
        try {
            const result = await API.post('/tasks', taskData);
            return result; // 返回整个结果（后端直接返回 task 对象）
        } catch (error) {
            console.error('Create task error:', error);
            throw error;
        }
    },

    // 更新任務
    updateTask: async function(taskId, updateData) {
        try {
            const result = await API.put(`/tasks/${taskId}`, updateData);
            return result.task;
        } catch (error) {
            console.error('Update task error:', error);
            throw error;
        }
    },

    // 刪除任務
    deleteTask: async function(taskId) {
        try {
            await API.delete(`/tasks/${taskId}`);
            return true;
        } catch (error) {
            console.error('Delete task error:', error);
            throw error;
        }
    },

    // === 共享功能 API ===
    
    // 獲取共享給我的任務
    getSharedTasks: async function() {
        try {
            const result = await API.get('/shared-tasks');
            return result.tasks || [];
        } catch (error) {
            console.error('Get shared tasks error:', error);
            throw error;
        }
    },

    // 分享任務
    shareTask: async function(taskId, shareWithEmail, permission) {
        try {
            const result = await API.post(`/tasks/${taskId}/share`, {
                email: shareWithEmail,  // 后端期望 email 字段
                permission
            });
            return result;
        } catch (error) {
            console.error('Share task error:', error);
            throw error;
        }
    },

    // 獲取任務的分享列表
    getTaskShares: async function(taskId) {
        try {
            const result = await API.get(`/tasks/${taskId}/shares`);
            return result.shares || [];
        } catch (error) {
            console.error('Get task shares error:', error);
            throw error;
        }
    },

    // 更新分享權限
    updateSharePermission: async function(taskId, sharedUserId, permission) {
        try {
            const result = await API.put(`/tasks/${taskId}/share/${sharedUserId}`, {
                permission
            });
            return result;
        } catch (error) {
            console.error('Update share permission error:', error);
            throw error;
        }
    },

    // 移除分享
    removeShare: async function(taskId, sharedUserId) {
        try {
            await API.delete(`/tasks/${taskId}/share/${sharedUserId}`);
            return true;
        } catch (error) {
            console.error('Remove share error:', error);
            throw error;
        }
    }
};
