const app = getApp();
const {
  calculateCountdown,
  calculateElapsed,
  padZero,
  getSystemEvents,
  selectNearestEvent,
  selectMostRecentPastEvent
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

    // ── Digit flip cards ───────────────────────────────
    dayDigits: [emptyDigit(), emptyDigit(), emptyDigit()],
    hDigits:   [emptyDigit(), emptyDigit()],
    mDigits:   [emptyDigit(), emptyDigit()],
    sDigits:   [emptyDigit(), emptyDigit()],
  },

  _timer: null,
  _holidayMap: {},
  _flipTimers: [],
  _arrivedShown: false,
  _overdueNotified: false,

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ statusBarHeight });
    this._initHolidays();
  },

  onShow() {
    this._loadEvents();
    this._startTimer();
  },

  onHide()   { this._stopTimer(); },
  onUnload() { this._stopTimer(); },

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
      const futureEvents = allEvents.filter(e => {
        if (e.isSystem) return true;
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        return t >= now;
      });

      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const pastEvents = allEvents.filter(e => {
        if (e.isSystem) return false;
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        if (t >= now) return false;
        // 未来事件到期后直接归档，不分流到"过去" tab
        const createdAt = e.createdAt ? new Date(e.createdAt) : now;
        if (t >= createdAt) return false;
        // 过去事件：超过1年的已归档，不在主界面显示
        return (now - t) < oneYearMs;
      });

      // Auto-archive past events older than 1 year
      const overdueEvents = pastEvents.filter(e => {
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        return (now - t) > oneYearMs;
      });
      if (overdueEvents.length > 0) {
        const db = wx.cloud.database();
        const ids = overdueEvents.map(e => e._id).filter(Boolean);
        Promise.all(ids.map(id => db.collection('events').doc(id).remove()))
          .catch(() => {});
        pastEvents = pastEvents.filter(e => !ids.includes(e._id));
        if (!self._overdueNotified) {
          self._overdueNotified = true;
          wx.showModal({
            title: '已超过一年，自动归档',
            content: '往事不可追',
            showCancel: false,
            confirmText: '知道了'
          });
        }
      }

      self.setData({ futureEvents, pastEvents, pinnedEventId, isLoading: false });
      self._selectForActiveTab();
    });
  },

  _fetchUserEvents() {
    return new Promise(resolve => {
      if (!app.globalData.isLoggedIn) { resolve([]); return; }
      wx.cloud.database().collection('events').orderBy('targetDate', 'asc').get()
        .then(res => resolve(res.data || []))
        .catch(() => resolve([]));
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
    this._updateCountdown();
  },

  _resetDigits() {
    const zero = () => emptyDigit();
    this._arrivedShown = false;
    this.setData({
      dayDigits: [zero(), zero(), zero()],
      hDigits:   [zero(), zero()],
      mDigits:   [zero(), zero()],
      sDigits:   [zero(), zero()],
      showArrivedOverlay: false,
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
          '000'.split('').forEach((v, i) => {
            if (v !== this.data.dayDigits[i].curr) this._triggerFlip('dayDigits', i, v);
          });
          '00'.split('').forEach((v, i) => {
            if (v !== this.data.hDigits[i].curr) this._triggerFlip('hDigits', i, v);
            if (v !== this.data.mDigits[i].curr) this._triggerFlip('mDigits', i, v);
            if (v !== this.data.sDigits[i].curr) this._triggerFlip('sDigits', i, v);
          });
        } else {
          // 用户事件到期：显示"未来已来"覆盖层，2.5s 后重新分流到"过去"tab
          if (!this._arrivedShown) {
            this._arrivedShown = true;
            // 先把数字归零
            '000'.split('').forEach((v, i) => {
              if (v !== this.data.dayDigits[i].curr) this._triggerFlip('dayDigits', i, v);
            });
            '00'.split('').forEach((v, i) => {
              if (v !== this.data.hDigits[i].curr) this._triggerFlip('hDigits', i, v);
              if (v !== this.data.mDigits[i].curr) this._triggerFlip('mDigits', i, v);
              if (v !== this.data.sDigits[i].curr) this._triggerFlip('sDigits', i, v);
            });
            this.setData({ showArrivedOverlay: true });
            const t = setTimeout(() => {
              this.setData({ showArrivedOverlay: false });
              this._arrivedShown = false;
              this._loadEvents();
            }, 2500);
            this._flipTimers.push(t);
          }
        }
        return;
      }
      result.totalSeconds = result.days * 86400 + result.hours * 3600 + result.minutes * 60 + result.seconds;
    }

    const t = currentEvent.targetTime || '00:00';
    const targetTimeStr = `${currentEvent.targetDate} ${t.length === 5 ? t + ':00' : t}`;
    this.setData({ countdown: result, targetTimeStr });

    const d = String(result.days).padStart(3, '0');
    const h = padZero(result.hours);
    const m = padZero(result.minutes);
    const s = padZero(result.seconds);

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
  // Interactions
  // ========================

  onTapEventName() { this.setData({ showEventList: true }); },
  onCloseEventList() { this.setData({ showEventList: false }); },

  onSelectEvent(e) {
    const id = e.currentTarget.dataset.id;
    const { currentTabEvents } = this.data;
    const event = currentTabEvents.find(ev => (ev._id || ev.id) === id);
    if (event) {
      this.setData({ currentEvent: event, showEventList: false });
      this._resetDigits();
      this._updateCountdown();
    }
  },

  onPinEvent(e) {
    const id = e.currentTarget.dataset.id;
    const newPinned = this.data.pinnedEventId === id ? null : id;
    this.setData({ pinnedEventId: newPinned });
    app.setPinnedEvent(newPinned);
    wx.showToast({ title: newPinned ? '已置顶' : '已取消置顶', icon: 'success', duration: 1500 });
  },

  onGoCalendar() { wx.navigateTo({ url: '/pages/calendar/calendar' }); },
  onGoProfile()  { wx.navigateTo({ url: '/pages/profile/profile' }); },
  onAddEvent()   { wx.navigateTo({ url: '/pages/event-edit/event-edit' }); },
});
