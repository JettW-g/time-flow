App({
  globalData: {
    userInfo: null,
    openid: null,
    events: [],       // user personal events
    holidays: {},     // holidays keyed by date string 'YYYY-MM-DD'
    pinnedEventId: null,
    settings: {
      offWorkTime: '18:00',
      showLunar: true
    },
    isLoggedIn: false
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-7gqgfcq3682191c1',
      traceUser: true
    });
    this.login();
  },

  login() {
    const self = this;
    wx.cloud.callFunction({
      name: 'login',
      success(res) {
        const { openid, userRecord } = res.result;
        self.globalData.openid = openid;
        if (userRecord) {
          self.globalData.userInfo = {
            nickName: userRecord.nickName || '用户',
            avatarUrl: userRecord.avatarUrl || ''
          };
          self.globalData.pinnedEventId = userRecord.pinnedEventId || null;
          if (userRecord.settings) {
            Object.assign(self.globalData.settings, userRecord.settings);
          }
        }
        self.globalData.isLoggedIn = true;
        // Notify pages that login is complete
        if (self.loginCallback) {
          self.loginCallback();
        }
      },
      fail(err) {
        console.error('Login failed:', err);
        // 登录失败时仍标记为已初始化，让页面能正常展示（离线模式）
        self.globalData.isLoggedIn = false;
        if (self.loginCallback) {
          self.loginCallback();
        }
      }
    });
  },

  // Save user info (called after WeChat avatar/nickname authorization)
  saveUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: this.globalData.openid
    }).update({
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        updatedAt: db.serverDate()
      }
    });
  },

  // Update pinned event across tabs
  setPinnedEvent(eventId) {
    this.globalData.pinnedEventId = eventId;
    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: this.globalData.openid
    }).update({
      data: {
        pinnedEventId: eventId,
        updatedAt: db.serverDate()
      }
    });
  }
});
