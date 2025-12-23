// AWS Cognito 配置
// ⚠️ 請替換以下配置為你的 AWS Cognito User Pool 資訊
const cognitoConfig = {
    region: 'us-east-1', // 請改為你的區域，例如：us-east-1, ap-northeast-1
    userPoolId: 'us-east-1_Lp83FcMv8', // 格式：ap-northeast-1_xxxxxxxxx
    clientId: '63bpfmsm2p30ls43qulsodcsdp', // 你的 App Client ID
};

// 初始化 AWS SDK
AWS.config.region = cognitoConfig.region;

// 創建 Cognito User Pool
const poolData = {
    UserPoolId: cognitoConfig.userPoolId,
    ClientId: cognitoConfig.clientId,
    Storage: window.localStorage // 明確指定使用 localStorage
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// Cognito 認證管理器
const CognitoAuth = {
    // 註冊新用戶
    signUp: function(email, password, callback) {
        const attributeList = [
            new AmazonCognitoIdentity.CognitoUserAttribute({
                Name: 'email',
                Value: email
            })
        ];

        userPool.signUp(email, password, attributeList, null, function(err, result) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, result.user);
        });
    },

    // 確認註冊（驗證碼）
    confirmSignUp: function(email, code, callback) {
        const userData = {
            Username: email,
            Pool: userPool
        };

        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        cognitoUser.confirmRegistration(code, true, function(err, result) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, result);
        });
    },

    // 登入
    signIn: function(email, password, callback) {
        const authenticationData = {
            Username: email,
            Password: password,
        };

        const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

        const userData = {
            Username: email,
            Pool: userPool
        };

        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: function(result) {
                callback(null, {
                    accessToken: result.getAccessToken().getJwtToken(),
                    idToken: result.getIdToken().getJwtToken(),
                    refreshToken: result.getRefreshToken().getToken(),
                    user: cognitoUser
                });
            },
            onFailure: function(err) {
                callback(err, null);
            },
            newPasswordRequired: function(userAttributes, requiredAttributes) {
                // 如果需要修改密碼
                callback({ message: '需要設定新密碼' }, null);
            }
        });
    },

    // 登出
    signOut: function() {
        const cognitoUser = userPool.getCurrentUser();
        if (cognitoUser) {
            cognitoUser.signOut();
        }
    },

    // 獲取當前用戶
    getCurrentUser: function(callback) {
        const cognitoUser = userPool.getCurrentUser();

        if (!cognitoUser) {
            callback(null, null);
            return;
        }

        cognitoUser.getSession(function(err, session) {
            if (err) {
                callback(err, null);
                return;
            }

            if (!session.isValid()) {
                callback(null, null);
                return;
            }

            cognitoUser.getUserAttributes(function(err, attributes) {
                if (err) {
                    callback(err, null);
                    return;
                }

                const userData = {};
                attributes.forEach(function(attribute) {
                    userData[attribute.getName()] = attribute.getValue();
                });

                callback(null, {
                    username: cognitoUser.getUsername(),
                    attributes: userData,
                    session: session
                });
            });
        });
    },

    // 重新發送驗證碼
    resendConfirmationCode: function(email, callback) {
        const userData = {
            Username: email,
            Pool: userPool
        };

        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        cognitoUser.resendConfirmationCode(function(err, result) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, result);
        });
    },

    // 忘記密碼
    forgotPassword: function(email, callback) {
        const userData = {
            Username: email,
            Pool: userPool
        };

        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        cognitoUser.forgotPassword({
            onSuccess: function(result) {
                callback(null, result);
            },
            onFailure: function(err) {
                callback(err, null);
            }
        });
    },

    // 確認重設密碼
    confirmPassword: function(email, code, newPassword, callback) {
        const userData = {
            Username: email,
            Pool: userPool
        };

        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        cognitoUser.confirmPassword(code, newPassword, {
            onSuccess: function() {
                callback(null, 'Password reset successful');
            },
            onFailure: function(err) {
                callback(err, null);
            }
        });
    },

    // 更新用戶自訂屬性（保存自訂分類）
    updateUserAttributes: function(attributes, callback) {
        const cognitoUser = userPool.getCurrentUser();
        
        if (!cognitoUser) {
            callback({ message: '未登入' }, null);
            return;
        }

        cognitoUser.getSession(function(err, session) {
            if (err || !session.isValid()) {
                callback(err || { message: 'Session 無效' }, null);
                return;
            }

            const attributeList = attributes.map(attr => 
                new AmazonCognitoIdentity.CognitoUserAttribute(attr)
            );

            cognitoUser.updateAttributes(attributeList, function(err, result) {
                if (err) {
                    callback(err, null);
                    return;
                }
                callback(null, result);
            });
        });
    },

    // 獲取用戶屬性
    getUserAttributes: function(callback) {
        const cognitoUser = userPool.getCurrentUser();
        
        if (!cognitoUser) {
            callback({ message: '未登入' }, null);
            return;
        }

        cognitoUser.getSession(function(err, session) {
            if (err || !session.isValid()) {
                callback(err || { message: 'Session 無效' }, null);
                return;
            }

            cognitoUser.getUserAttributes(function(err, attributes) {
                if (err) {
                    callback(err, null);
                    return;
                }
                callback(null, attributes);
            });
        });
    },

    // 修改密碼（已登入用戶）
    changePassword: function(oldPassword, newPassword, callback) {
        const cognitoUser = userPool.getCurrentUser();
        
        if (!cognitoUser) {
            callback({ message: '未登入' }, null);
            return;
        }

        cognitoUser.getSession(function(err, session) {
            if (err || !session.isValid()) {
                callback(err || { message: 'Session 無效' }, null);
                return;
            }

            cognitoUser.changePassword(oldPassword, newPassword, function(err, result) {
                if (err) {
                    callback(err, null);
                    return;
                }
                callback(null, result);
            });
        });
    },

    // 刪除帳號
    deleteAccount: function(callback) {
        const cognitoUser = userPool.getCurrentUser();
        
        if (!cognitoUser) {
            callback({ message: '未登入' }, null);
            return;
        }

        cognitoUser.getSession(function(err, session) {
            if (err || !session.isValid()) {
                callback(err || { message: 'Session 無效' }, null);
                return;
            }

            cognitoUser.deleteUser(function(err, result) {
                if (err) {
                    callback(err, null);
                    return;
                }
                callback(null, result);
            });
        });
    }
};
