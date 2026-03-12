const app = getApp();
const lottie = require('lottie-miniprogram');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MOTTOS_FUTURE = ['再坚持一下就到了！', '时间正在接近！', '期待让等待有了意义。', '好事多磨，值得等待。', '每一天都是倒计时的一格。'];
const MOTTOS_PAST = ['时光荏苒，一去不返。', '时间在指尖流淌…', '回忆是时间留下的礼物。', '那一刻，已是永恒。', '岁月不居，往事如烟。'];

// Lottie 云端文件 ID
const CLOUD_PREFIX = 'cloud://cloud1-7gqgfcq3682191c1.636c-cloud1-7gqgfcq3682191c1-1409058392/';
const FUTURE_LOTTIE_POOL = ['walk_cycling_shoes.json', 'car.json'];
const PAST_LOTTIE_POOL   = ['singing_and_playing.json', 'data_visualization.json'];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 微信小程序不支持 eval()，Lottie JSON 中 x 为字符串时是 AE 表达式，递归删除
function stripLottieExpressions(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(stripLottieExpressions);
  } else if (obj && typeof obj === 'object') {
    if (typeof obj.x === 'string') delete obj.x;
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') stripLottieExpressions(v);
    }
  }
}

const {
  calculateCountdown,
  calculateElapsed,
  padZero,
  getSystemEvents,
  selectNearestEvent,
  selectMostRecentPastEvent,
  calcYearsMonthsDays
} = require('../../utils/countdown');
const { buildHolidayMap, getBuiltinLegalHolidays } = require('../../utils/holidays');

function emptyDigit() {
  return { curr: '0', next: '0', flipping: false };
}

Page({
  data: {
    // ── Tab state ──────────────────────────────────────
    activeTab: 'future',   // 'past' | 'future'

    // ── Events ─────────────────────────────────────────
    pastEvents: [],        // targetDate < now（用户事件）
    futureEvents: [],      // targetDate >= now（系统 + 用户事件）
    currentTabEvents: [],  // 当前 tab 的事件列表（弹层用）
    currentEvent: null,

    // ── Display ────────────────────────────────────────
    countdown: { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 },
    showEventList: false,
    showArrivedOverlay: false,
    pinnedEventId: null,
    isLoading: true,
    statusBarHeight: 0,
    targetTimeStr: '',
    eventDateInfo: '',
    showProgressBar: false,
    progressPercent: 0,
    mottoText: '',
    mottoVisible: false,
    // ── Digit flip cards ───────────────────────────────
    dayDigits: [emptyDigit(), emptyDigit(), emptyDigit(), emptyDigit()],
    hDigits:   [emptyDigit(), emptyDigit()],
    mDigits:   [emptyDigit(), emptyDigit()],
    sDigits:   [emptyDigit(), emptyDigit()],
    dayYMD: '',
    // ── Sheet tabs & quick edit ─────────────────────────
    sheetTab: 'active',
    showQuickEdit: false,
    quickEditEventId: null,
    quickEditDate: '',
    quickEditTime: '00:00',
    // Retirement sheet
    showRetireSheet: false,
    retireBirthYear: '',
    retireBirthMonth: '',
    retireGender: 'male',
    // Special event time sheet
    showSpecialTimeSheet: false,
    specialEventType: '',
    specialEventName: '',
    specialEventIcon: '',
    specialDate: '',
    specialTime: '00:00',
    // Min/max dates for pickers
    pickerMinDate: '',
    pickerMaxDate: '',
  },

  _timer: null,
  _holidayMap: {},
  _flipTimers: [],
  _arrivedShown: false,
  _overdueNotified: false,
  _mottoTimer: null,
  _mottoFadeTimer: null,
  _mottoIndexFuture: 0,
  _mottoIndexPast: 0,
  // Lottie
  _lottieAnim: null,

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ statusBarHeight });
    this._initHolidays();
  },

  onShow() {
    this._loadEvents();
    this._startTimer();
    this._startMotto();
    // 延迟确保页面节点渲染完成后再初始化 canvas
    setTimeout(() => { this._pickAndPlayLottie(); }, 300);
  },

  onHide() {
    this._stopTimer();
    this._stopMotto();
    if (this._lottieAnim) { this._lottieAnim.stop(); }
  },

  onUnload() {
    this._stopTimer();
    this._stopMotto();
    if (this._lottieAnim) { this._lottieAnim.destroy(); this._lottieAnim = null; }
  },

  onShareAppMessage() {
    const event = this.data.currentEvent;
    const title = event ? `${event.icon || ''}${event.name} 倒计时` : '时光流转，分秒必争';
    return {
      title,
      path: '/pages/countdown/countdown'
    };
  },

  onShareTimeline() {
    const event = this.data.currentEvent;
    const title = event ? `${event.icon || ''}${event.name} 倒计时` : '时光流转，分秒必争';
    return { title };
  },

  // ========================
  // Lottie
  // ========================

  _pickAndPlayLottie() {
    const { activeTab } = this.data;
    const pool = activeTab === 'future' ? FUTURE_LOTTIE_POOL : PAST_LOTTIE_POOL;
    const filename = pickRandom(pool);
    const globalCache = app.globalData.lottieJsonCache;

    // 销毁旧动画
    if (this._lottieAnim) {
      this._lottieAnim.destroy();
      this._lottieAnim = null;
    }

    if (globalCache[filename]) {
      // 全局缓存命中：等待 canvas 渲染完成后直接渲染（极短延迟）
      setTimeout(() => {
        if (this.data.activeTab === activeTab) {
          this._renderLottie(globalCache[filename]);
        }
      }, 50);
    } else {
      // 缓存未命中（一般仅首次冷启动网络极慢时）：fallback 走云端下载
      setTimeout(() => {
        this._fetchAndRenderLottie(CLOUD_PREFIX + filename, filename, activeTab);
      }, 50);
    }
  },

  // Fallback：缓存未命中时从云端下载并渲染
  _fetchAndRenderLottie(cloudFileID, filename, requestedTab) {
    wx.cloud.getTempFileURL({
      fileList: [cloudFileID],
      success: res => {
        const tempUrl = res.fileList[0] && res.fileList[0].tempFileURL;
        if (!tempUrl) return;
        wx.downloadFile({
          url: tempUrl,
          success: dlRes => {
            wx.getFileSystemManager().readFile({
              filePath: dlRes.tempFilePath,
              encoding: 'utf8',
              success: fileRes => {
                try {
                  const animData = JSON.parse(fileRes.data);
                  app.globalData.lottieJsonCache[filename] = animData; // 写入全局缓存
                  if (this.data.activeTab === requestedTab) {
                    this._renderLottie(animData);
                  }
                } catch (e) { console.error('Lottie JSON parse error:', e); }
              },
              fail: err => console.error('Read lottie file error:', err)
            });
          },
          fail: err => console.error('Download lottie error:', err)
        });
      },
      fail: err => console.error('getTempFileURL lottie error:', err)
    });
  },

  _renderLottie(animationData) {
    const query = this.createSelectorQuery();
    query.select('#lottie-canvas').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const context = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width  = res[0].width  * dpr;
      canvas.height = res[0].height * dpr;
      stripLottieExpressions(animationData);
      lottie.setup(canvas);
      this._lottieAnim = lottie.loadAnimation({
        loop: true,
        autoplay: true,
        animationData,
        rendererSettings: { context }
      });
    });
  },

  // ========================
  // Holidays & Events
  // ========================

  _initHolidays() {
    const year = new Date().getFullYear();
    const legal = getBuiltinLegalHolidays(year);
    this._holidayMap = buildHolidayMap(legal);
    wx.cloud.database().collection('holidays').where({ year }).get()
      .then(res => { if (res.data && res.data.length) this._holidayMap = buildHolidayMap(res.data); })
      .catch(() => {});
  },

  _loadEvents() {
    const self = this;
    const settings = app.globalData.settings || {};
    const pinnedEventId = app.globalData.pinnedEventId;
    const systemEvents = getSystemEvents(settings.offWorkTime || '18:00', this._holidayMap);

    this._fetchUserEvents().then(userEvents => {
      const now = new Date();

      const allEvents = [...systemEvents, ...userEvents].map(e => ({
        ...e,
        _key: e._id || e.id || ''
      }));

      // 系统事件永远在未来 tab；用户事件按 targetDate 分流
      // 原本为"未来事件"的用户事件，到期后保留1天，仍显示在主界面
      const oneDayMs = 24 * 60 * 60 * 1000;
      const futureEvents = allEvents.filter(e => {
        if (e.isSystem) return true;
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        if (t >= now) return true;
        // 宽限期：原本是未来事件（targetDate >= createdAt），到期不超过1天
        const createdAt = e.createdAt ? new Date(e.createdAt) : null;
        if (!createdAt) return false;
        const wasOriginallyFuture = t >= createdAt;
        return wasOriginallyFuture && (now - t) < oneDayMs;
      });

      const pastEvents = allEvents.filter(e => {
        if (e.isSystem) return false;
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        if (t >= now) return false;
        // 未来事件到期后直接归档，不分流到"过去" tab
        const createdAt = e.createdAt ? new Date(e.createdAt) : now;
        if (t >= createdAt) return false;
        return true;
      });

      self.setData({ futureEvents, pastEvents, pinnedEventId, isLoading: false });
      self._selectForActiveTab();
    });
  },

  _fetchUserEvents() {
    return new Promise(resolve => {
      const doFetch = () => {
        if (!app.globalData.isLoggedIn) { resolve([]); return; }
        wx.cloud.database().collection('events').orderBy('targetDate', 'asc').get()
          .then(res => resolve(res.data || []))
          .catch(() => resolve([]));
      };

      if (app.globalData.isLoggedIn) {
        doFetch();
      } else {
        // 登录尚未完成，挂载回调，登录成功后自动触发
        app.loginCallback = doFetch;
      }
    });
  },

  // ========================
  // Tab switching
  // ========================

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    this._selectForActiveTab();
    this._pickAndPlayLottie();
  },

  _selectForActiveTab() {
    const { activeTab, pastEvents, futureEvents, pinnedEventId } = this.data;

    if (activeTab === 'future') {
      let event = pinnedEventId
        ? futureEvents.find(e => e._id === pinnedEventId || e.id === pinnedEventId)
        : null;
      if (!event) event = selectNearestEvent(futureEvents);
      if (!event && futureEvents.length > 0) event = futureEvents[0];
      this.setData({ currentEvent: event || null, currentTabEvents: futureEvents });
    } else {
      let event = pinnedEventId
        ? pastEvents.find(e => e._id === pinnedEventId || e.id === pinnedEventId)
        : null;
      if (!event) event = selectMostRecentPastEvent(pastEvents);
      if (!event && pastEvents.length > 0) event = pastEvents[0];
      this.setData({ currentEvent: event || null, currentTabEvents: pastEvents });
    }

    this._resetDigits();
    this._computeEventMeta();
    this._updateMotto();
    this._updateCountdown();
  },

  _computeEventMeta() {
    const { currentEvent, activeTab } = this.data;
    if (!currentEvent) {
      this.setData({ eventDateInfo: '', progressPercent: 0 });
      return;
    }
    const dateStr = currentEvent.targetDate;
    const d = new Date(dateStr + 'T00:00:00');
    const weekDay = WEEKDAYS[d.getDay()];

    if (activeTab === 'future') {
      const dateInfo = `目标日期 ${dateStr} · 星期${weekDay}`;
      const now = new Date();
      const target = new Date(`${dateStr}T${currentEvent.targetTime || '00:00'}:00`);
      let start;
      if (currentEvent.progressStart) {
        // 系统事件：使用预设起点（今天00:00 / 本周一00:00）
        start = new Date(currentEvent.progressStart);
      } else {
        // 用户事件：使用 createdAt，缺失则退后1年
        start = currentEvent.createdAt ? new Date(currentEvent.createdAt) : null;
        if (!start || start >= target) {
          start = new Date(target.getTime() - 365 * 24 * 60 * 60 * 1000);
        }
      }
      const total = target - start;
      const elapsed = now - start;
      const progressPercent = total > 0 ? Math.min(100, Math.max(0, Math.round(elapsed / total * 100))) : 0;
      this.setData({ eventDateInfo: dateInfo, showProgressBar: true, progressPercent });
    } else {
      const dateInfo = `起始日期 ${dateStr} · 星期${weekDay}`;
      this.setData({ eventDateInfo: dateInfo, showProgressBar: false, progressPercent: 0 });
    }
  },

  _resetDigits() {
    const zero = () => emptyDigit();
    this._arrivedShown = false;
    this.setData({
      dayDigits: [zero(), zero(), zero(), zero()],
      hDigits:   [zero(), zero()],
      mDigits:   [zero(), zero()],
      sDigits:   [zero(), zero()],
      showArrivedOverlay: false,
      showProgressBar: false,
      progressPercent: 0,
    });
  },

  // ========================
  // Timer
  // ========================

  _startTimer() {
    this._stopTimer();
    this._updateCountdown();
    this._timer = setInterval(() => this._updateCountdown(), 1000);
  },

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._flipTimers.forEach(t => clearTimeout(t));
    this._flipTimers = [];
  },

  // ========================
  // Countdown / Elapsed update + flip
  // ========================

  _updateCountdown() {
    const { currentEvent, activeTab } = this.data;
    if (!currentEvent) return;

    let result;
    if (activeTab === 'past') {
      result = calculateElapsed(currentEvent.targetDate, currentEvent.targetTime || '00:00');
      if (!result) return;
      result.totalSeconds = result.days * 86400 + result.hours * 3600 + result.minutes * 60 + result.seconds;
    } else {
      result = calculateCountdown(currentEvent.targetDate, currentEvent.targetTime || '00:00');
      if (!result) return;
      if (result.expired) {
        if (currentEvent.isSystem) {
          // 系统事件到期（如下班/周末已到）：展示全零，不触发 reload
          result.totalSeconds = 0;
          const t0 = currentEvent.targetTime || '00:00';
          this.setData({
            countdown: result,
            targetTimeStr: `${currentEvent.targetDate} ${t0.length === 5 ? t0 + ':00' : t0}`
          });
          '0000'.split('').forEach((v, i) => {
            if (v !== this.data.dayDigits[i].curr) this._triggerFlip('dayDigits', i, v);
          });
          '00'.split('').forEach((v, i) => {
            if (v !== this.data.hDigits[i].curr) this._triggerFlip('hDigits', i, v);
            if (v !== this.data.mDigits[i].curr) this._triggerFlip('mDigits', i, v);
            if (v !== this.data.sDigits[i].curr) this._triggerFlip('sDigits', i, v);
          });
          if (!this._arrivedShown) {
            this._arrivedShown = true;
            this.setData({ showProgressBar: true, progressPercent: 100, mottoText: '时间已经到啦！', mottoVisible: true });
          }
        } else {
          // 用户事件到期
          if (!this._arrivedShown) {
            this._arrivedShown = true;
            // 先把数字归零
            '0000'.split('').forEach((v, i) => {
              if (v !== this.data.dayDigits[i].curr) this._triggerFlip('dayDigits', i, v);
            });
            '00'.split('').forEach((v, i) => {
              if (v !== this.data.hDigits[i].curr) this._triggerFlip('hDigits', i, v);
              if (v !== this.data.mDigits[i].curr) this._triggerFlip('mDigits', i, v);
              if (v !== this.data.sDigits[i].curr) this._triggerFlip('sDigits', i, v);
            });
            const eventDateTime = new Date(`${currentEvent.targetDate}T${currentEvent.targetTime || '00:00'}:00`);
            const expiredAgoMs = Date.now() - eventDateTime.getTime();
            if (expiredAgoMs < 10000) {
              // 刚刚到期（10秒内）：播放"未来已来"动画，2.5s 后重新加载
              this.setData({ showArrivedOverlay: true, mottoText: '时间已经到啦！', mottoVisible: true });
              const t = setTimeout(() => {
                this.setData({ showArrivedOverlay: false });
                this._arrivedShown = false;
                this._loadEvents();
              }, 5000);
              this._flipTimers.push(t);
            } else {
              // 宽限期内（已过期但不超过1天）：直接展示已到达状态，不重播动画
              this.setData({ showProgressBar: true, progressPercent: 100, mottoText: '时间已经到啦！', mottoVisible: true });
            }
          }
        }
        return;
      }
      result.totalSeconds = result.days * 86400 + result.hours * 3600 + result.minutes * 60 + result.seconds;
    }

    const t = currentEvent.targetTime || '00:00';
    const targetTimeStr = `${currentEvent.targetDate} ${t.length === 5 ? t + ':00' : t}`;
    this.setData({ countdown: result, targetTimeStr });

    const d = String(result.days).padStart(4, '0');
    const h = padZero(result.hours);
    const m = padZero(result.minutes);
    const s = padZero(result.seconds);

    const ymd = calcYearsMonthsDays(result.days);
    const ymdParts = [];
    if (ymd.years > 0) ymdParts.push(ymd.years + '年');
    if (ymd.months > 0) ymdParts.push(ymd.months + '月');
    ymdParts.push(ymd.days + '天');
    this.setData({ dayYMD: ymdParts.join('') });

    d.split('').forEach((v, i) => {
      if (v !== this.data.dayDigits[i].curr) this._triggerFlip('dayDigits', i, v);
    });
    h.split('').forEach((v, i) => {
      if (v !== this.data.hDigits[i].curr) this._triggerFlip('hDigits', i, v);
    });
    m.split('').forEach((v, i) => {
      if (v !== this.data.mDigits[i].curr) this._triggerFlip('mDigits', i, v);
    });
    s.split('').forEach((v, i) => {
      if (v !== this.data.sDigits[i].curr) this._triggerFlip('sDigits', i, v);
    });

    // 进度条实时更新
    if (activeTab === 'future' && this.data.showProgressBar) {
      const now = new Date();
      const target = new Date(`${currentEvent.targetDate}T${currentEvent.targetTime || '00:00'}:00`);
      let start;
      if (currentEvent.progressStart) {
        start = new Date(currentEvent.progressStart);
      } else {
        start = currentEvent.createdAt ? new Date(currentEvent.createdAt) : null;
        if (!start || start >= target) {
          start = new Date(target.getTime() - 365 * 24 * 60 * 60 * 1000);
        }
      }
      const total = target - start;
      const elapsed = now - start;
      const progressPercent = total > 0 ? Math.min(100, Math.max(0, Math.round(elapsed / total * 100))) : 0;
      if (progressPercent !== this.data.progressPercent) {
        this.setData({ progressPercent });
      }
    }
  },

  // 触发单个数字位的滑动切换动画
  _triggerFlip(arrName, idx, newVal) {
    const prefix = `${arrName}[${idx}]`;

    this.setData({
      [`${prefix}.next`]: newVal,
      [`${prefix}.flipping`]: true,
    });

    const t = setTimeout(() => {
      this.setData({
        [`${prefix}.curr`]: newVal,
        [`${prefix}.flipping`]: false,
      });
    }, 320);

    this._flipTimers.push(t);
  },

  // ========================
  // Motto rolling text
  // ========================

  _startMotto() {
    this._stopMotto();
    this._updateMotto();
    this._mottoTimer = setInterval(() => this._updateMotto(), 5000);
  },

  _stopMotto() {
    if (this._mottoTimer) { clearInterval(this._mottoTimer); this._mottoTimer = null; }
    if (this._mottoFadeTimer) { clearTimeout(this._mottoFadeTimer); this._mottoFadeTimer = null; }
  },

  _updateMotto() {
    const { activeTab } = this.data;
    const arr = activeTab === 'future' ? MOTTOS_FUTURE : MOTTOS_PAST;
    const key = activeTab === 'future' ? '_mottoIndexFuture' : '_mottoIndexPast';
    const text = arr[this[key] % arr.length];
    this[key] = (this[key] + 1) % arr.length;

    if (!this.data.mottoText) {
      this.setData({ mottoText: text, mottoVisible: true });
      return;
    }
    this.setData({ mottoVisible: false });
    if (this._mottoFadeTimer) clearTimeout(this._mottoFadeTimer);
    this._mottoFadeTimer = setTimeout(() => {
      this.setData({ mottoText: text, mottoVisible: true });
    }, 350);
  },

  // ========================
  // Interactions
  // ========================

  onTapEventName() { this.setData({ showEventList: true, sheetTab: 'active' }); },
  onCloseEventList() {
    if (this._lottieAnim) { this._lottieAnim.destroy(); this._lottieAnim = null; }
    this.setData({ showEventList: false }, () => { this._pickAndPlayLottie(); });
  },

  onSelectEvent(e) {
    const id = e.currentTarget.dataset.id;
    const { currentTabEvents } = this.data;
    const event = currentTabEvents.find(ev => (ev._id || ev.id) === id);
    if (event) {
      if (this._lottieAnim) { this._lottieAnim.destroy(); this._lottieAnim = null; }
      this.setData({ currentEvent: event, showEventList: false }, () => {
        this._resetDigits();
        this._computeEventMeta();
        this._updateCountdown();
        this._pickAndPlayLottie();
      });
    }
  },

  onPinEvent(e) {
    const id = e.currentTarget.dataset.id;
    const newPinned = this.data.pinnedEventId === id ? null : id;
    this.setData({ pinnedEventId: newPinned });
    app.setPinnedEvent(newPinned);
    wx.showToast({ title: newPinned ? '已置顶' : '已取消置顶', icon: 'success', duration: 1500 });
  },

  onSwitchSheetTab(e) {
    this.setData({ sheetTab: e.currentTarget.dataset.tab });
  },

  // Quick time edit
  onQuickEditTime(e) {
    const { id, date, time } = e.currentTarget.dataset;
    const now = new Date();
    const minDate = `${now.getFullYear() - 100}-01-01`;
    const maxDate = `${now.getFullYear() + 20}-12-31`;
    this.setData({ showQuickEdit: true, quickEditEventId: id, quickEditDate: date, quickEditTime: time || '00:00', pickerMinDate: minDate, pickerMaxDate: maxDate });
  },

  onQuickEditDateChange(e) { this.setData({ quickEditDate: e.detail.value }); },
  onQuickEditTimeChange(e) { this.setData({ quickEditTime: e.detail.value }); },

  onCancelQuickEdit() { this.setData({ showQuickEdit: false }); },

  onConfirmQuickEdit() {
    const { quickEditEventId, quickEditDate, quickEditTime } = this.data;
    if (!quickEditDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中…', mask: true });
    wx.cloud.database().collection('events').doc(quickEditEventId).update({
      data: { targetDate: quickEditDate, targetTime: quickEditTime, updatedAt: wx.cloud.database().serverDate() }
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已更新', icon: 'success' });
      this.setData({ showQuickEdit: false });
      this._loadEvents();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
    });
  },

  // Special events
  onAddSpecialEvent(e) {
    const { type } = e.currentTarget.dataset;
    if (type === 'retire') {
      this.setData({ showRetireSheet: true, retireBirthYear: '', retireBirthMonth: '', retireGender: 'male' });
    } else if (type === 'gaokao') {
      // Auto-add next June 7
      const now = new Date();
      let target = new Date(now.getFullYear(), 5, 7);
      if (target <= now) target = new Date(now.getFullYear() + 1, 5, 7);
      const dateStr = target.getFullYear() + '-06-07';
      this._saveSpecialEvent('高考', '📚', dateStr, '00:00');
    } else {
      const names = { summer: '暑假', winter: '寒假', wedding: '结婚', baby: '宝宝出生' };
      const icons = { summer: '☀️', winter: '❄️', wedding: '💍', baby: '👶' };
      const now = new Date();
      const minDate = `${now.getFullYear()}-01-01`;
      const maxDate = `${now.getFullYear() + 20}-12-31`;
      this.setData({ showSpecialTimeSheet: true, specialEventType: type, specialEventName: names[type], specialDate: '', specialTime: '00:00', pickerMinDate: minDate, pickerMaxDate: maxDate, specialEventIcon: icons[type] });
    }
  },

  onSpecialDateChange(e) { this.setData({ specialDate: e.detail.value }); },
  onSpecialTimeChange(e) { this.setData({ specialTime: e.detail.value }); },
  onCancelSpecialTime() { this.setData({ showSpecialTimeSheet: false }); },

  onConfirmSpecialTime() {
    const { specialEventName, specialEventIcon, specialDate, specialTime } = this.data;
    if (!specialDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    this._saveSpecialEvent(specialEventName, specialEventIcon, specialDate, specialTime);
    this.setData({ showSpecialTimeSheet: false });
  },

  _saveSpecialEvent(name, icon, targetDate, targetTime) {
    if (!app.globalData.isLoggedIn) { wx.showToast({ title: '请先登录', icon: 'none' }); return; }
    wx.showLoading({ title: '添加中…', mask: true });
    const db = wx.cloud.database();
    db.collection('events').add({ data: { name, icon, targetDate, targetTime: targetTime || '00:00', type: 'custom_once', isRecurring: false, note: '', createdAt: db.serverDate() } })
      .then(() => { wx.hideLoading(); wx.showToast({ title: '已添加', icon: 'success' }); this._loadEvents(); })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '添加失败', icon: 'error' }); });
  },

  onRetireGenderChange(e) { this.setData({ retireGender: e.currentTarget.dataset.gender }); },
  onRetireBirthYearInput(e) { this.setData({ retireBirthYear: e.detail.value }); },
  onRetireBirthMonthInput(e) { this.setData({ retireBirthMonth: e.detail.value }); },
  onCancelRetire() { this.setData({ showRetireSheet: false }); },

  onConfirmRetire() {
    const { retireBirthYear, retireBirthMonth, retireGender } = this.data;
    const year = parseInt(retireBirthYear);
    const month = parseInt(retireBirthMonth);
    if (!year || year < 1920 || year > 2010) { wx.showToast({ title: '请输入有效出生年份', icon: 'none' }); return; }
    if (!month || month < 1 || month > 12) { wx.showToast({ title: '请输入有效出生月份(1-12)', icon: 'none' }); return; }
    const retireAge = retireGender === 'male' ? 65 : 60;
    const retireYear = year + retireAge;
    const targetDate = `${retireYear}-${String(month).padStart(2,'0')}-01`;
    // Save birth info to user profile
    if (app.globalData.openid) {
      const db = wx.cloud.database();
      db.collection('users').where({ _openid: app.globalData.openid }).update({ data: { birthYear: year, birthMonth: month, gender: retireGender, updatedAt: db.serverDate() } }).catch(() => {});
    }
    this._saveSpecialEvent('退休', '🏖️', targetDate, '00:00');
    this.setData({ showRetireSheet: false });
  },

  onGoCalendar() { wx.navigateTo({ url: '/pages/calendar/calendar' }); },
  onGoProfile()  { wx.navigateTo({ url: '/pages/profile/profile' }); },
  onAddEvent()   { wx.navigateTo({ url: '/pages/event-edit/event-edit' }); },
});
