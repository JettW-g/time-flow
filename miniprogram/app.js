// 所有 Lottie 云端文件列表（app 启动时预缓存）
const LOTTIE_CLOUD_PREFIX = 'cloud://cloud1-7gqgfcq3682191c1.636c-cloud1-7gqgfcq3682191c1-1409058392/';
const ALL_LOTTIE_FILES = [
  'walk_cycling_shoes.json', 'car.json',
  'singing_and_playing.json', 'hacker_it.json', 'data_visualization.json'
];

App({
  globalData: {
    userInfo: null,
    openid: null,
    events: [],
    holidays: {},
    pinnedEventId: null,
    settings: {
      offWorkTime: '18:00',
      showLunar: true
    },
    isLoggedIn: false,
    lottieJsonCache: {}   // filename → parsed animationData
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-7gqgfcq3682191c1',
      traceUser: true
    });
    this.login();
    this._prefetchLottieFiles();
  },

  // 启动时批量预下载所有 Lottie JSON，缓存到 globalData
  _prefetchLottieFiles() {
    const cache = this.globalData.lottieJsonCache;
    const fileList = ALL_LOTTIE_FILES.map(f => LOTTIE_CLOUD_PREFIX + f);

    wx.cloud.getTempFileURL({
      fileList,
      success: res => {
        (res.fileList || []).forEach(file => {
          if (!file.tempFileURL) return;
          const filename = file.fileID.split('/').pop();
          if (cache[filename]) return; // 已缓存，跳过
          wx.downloadFile({
            url: file.tempFileURL,
            success: dlRes => {
              wx.getFileSystemManager().readFile({
                filePath: dlRes.tempFilePath,
                encoding: 'utf8',
                success: fileRes => {
                  try { cache[filename] = JSON.parse(fileRes.data); } catch (e) {}
                }
              });
            }
          });
        });
      },
      fail: err => console.error('Lottie prefetch getTempFileURL fail:', err)
    });
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
