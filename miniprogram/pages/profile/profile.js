const app = getApp();
const { daysUntil, calculateCountdown } = require('../../utils/countdown');

Page({
  data: {
    userInfo: null,
    activeEvents: [],
    archivedEvents: [],
    archivedFutureEvents: [],
    archivedPastEvents: [],
    activeCount: 0,
    archivedCount: 0,
    totalCount: 0,
    isLoading: true,
    showDeleteConfirm: false,
    pendingDeleteId: null,
    pendingDeleteName: '',
    editingName: false,
    tempName: ''
  },

  _firstLoad: true,

  onLoad() {
    this._loadUserInfo();
  },

  onUnload() {
    this._firstLoad = true;
  },

  onShow() {
    if (this._firstLoad) {
      this._firstLoad = false;
      this._loadEvents(true);
    } else {
      // 已有数据时静默刷新，不显示 loading
      this._loadEvents(false);
    }
  },

  // ========================
  // Data Loading
  // ========================

  _loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  _loadEvents(showLoading = false) {
    if (!app.globalData.isLoggedIn) {
      this.setData({ isLoading: false });
      return;
    }

    if (showLoading) {
      this.setData({ isLoading: true });
    }

    wx.cloud.database().collection('events')
      .orderBy('targetDate', 'asc')
      .limit(100)
      .get()
      .then(res => {
        const now = new Date();
        const oneYearMs = 365 * 24 * 60 * 60 * 1000;
        const all = (res.data || []).map(ev => {
          const enriched = this._enrichEvent(ev);
          const targetDT = new Date(`${ev.targetDate}T${ev.targetTime || '00:00'}:00`);
          const createdDT = ev.createdAt ? new Date(ev.createdAt) : now;
          // 判断创建时是"过去事件"还是"未来事件"
          const wasOriginallyPast = targetDT < createdDT;
          enriched.wasOriginallyPast = wasOriginallyPast;
          if (wasOriginallyPast) {
            // 过去事件：已过去 ≥ 1年则归档
            enriched.isArchivedPast = (now - targetDT) >= oneYearMs;
          } else {
            // 未来事件：倒计时已到期则归档
            enriched.isArchivedPast = targetDT < now;
          }
          return enriched;
        });
        // 进行中：未来事件（未到期）+ 过去事件（< 1年）
        const activeEvents = all
          .filter(e => !e.isArchivedPast)
          .sort((a, b) => a.daysRemaining - b.daysRemaining);
        // 已归档：未来事件（已到期）+ 过去事件（≥ 1年）
        const archivedEvents = all
          .filter(e => e.isArchivedPast)
          .sort((a, b) => b.daysRemaining - a.daysRemaining);
        // 已归档子分类：循环事件归入"未来事件"列
        const archivedFutureEvents = archivedEvents.filter(e => !e.wasOriginallyPast || e.isRecurring);
        const archivedPastEvents   = archivedEvents.filter(e => e.wasOriginallyPast && !e.isRecurring);
        this.setData({
          activeEvents,
          archivedEvents,
          archivedFutureEvents,
          archivedPastEvents,
          activeCount: activeEvents.length,
          archivedCount: archivedEvents.length,
          totalCount: all.length,
          isLoading: false
        });
      })
      .catch(err => {
        console.error('Load events error:', err);
        this.setData({ isLoading: false });
        if (showLoading) wx.showToast({ title: '加载失败', icon: 'error' });
      });
  },

  _enrichEvent(ev) {
    const days = daysUntil(ev.targetDate, ev.targetTime || '00:00');
    const cd = calculateCountdown(ev.targetDate, ev.targetTime || '00:00');
    const typeLabels = {
      birthday: '生日',
      anniversary: '纪念日',
      custom_once: '自定义',
      custom_repeat: '重复事件'
    };

    let daysText = '';
    if (days === 0) daysText = '就是今天';
    else if (days > 0) daysText = `还有 ${days} 天`;
    else daysText = `已过去 ${Math.abs(days)} 天`;

    // Anniversary: compute years
    let anniversaryText = '';
    if (ev.type === 'anniversary' && ev.createdAt) {
      const startYear = new Date(ev.createdAt).getFullYear();
      const currentYear = new Date().getFullYear();
      const years = currentYear - startYear;
      if (years > 0) anniversaryText = `第 ${years} 周年`;
    }

    return {
      ...ev,
      daysRemaining: days,
      expired: cd ? cd.expired : (days < 0),
      daysText,
      typeLabel: typeLabels[ev.type] || '事件',
      anniversaryText,
      swipeOpen: false
    };
  },

  // ========================
  // User Info
  // ========================

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    const userInfo = { ...(this.data.userInfo || {}), avatarUrl };
    this.setData({ userInfo });
    app.saveUserInfo(userInfo);
  },

  onEditName() {
    const nickName = (this.data.userInfo && this.data.userInfo.nickName) || '';
    this.setData({ editingName: true, tempName: nickName });
  },

  onNameInput(e) {
    this.setData({ tempName: e.detail.value });
  },

  onCancelEditName() {
    this.setData({ editingName: false, tempName: '' });
  },

  onSaveName() {
    const nickName = this.data.tempName.trim();
    if (!nickName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none', duration: 1500 });
      return;
    }
    const userInfo = { ...(this.data.userInfo || {}), nickName };
    this.setData({ userInfo, editingName: false, tempName: '' });
    app.saveUserInfo(userInfo);
    wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 });
  },

  // ========================
  // Event Actions
  // ========================

  onAddEvent() {
    wx.navigateTo({ url: '/pages/event-edit/event-edit' });
  },

  onEditEvent(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/event-edit/event-edit?id=${id}` });
  },

  onDeleteEventConfirm(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      showDeleteConfirm: true,
      pendingDeleteId: id,
      pendingDeleteName: name
    });
  },

  onCancelDelete() {
    this.setData({ showDeleteConfirm: false, pendingDeleteId: null });
  },

  onConfirmDelete() {
    const id = this.data.pendingDeleteId;
    if (!id) return;

    wx.cloud.database().collection('events').doc(id).remove()
      .then(() => {
        const activeEvents        = this.data.activeEvents.filter(ev => ev._id !== id);
        const archivedEvents      = this.data.archivedEvents.filter(ev => ev._id !== id);
        const archivedFutureEvents = this.data.archivedFutureEvents.filter(ev => ev._id !== id);
        const archivedPastEvents   = this.data.archivedPastEvents.filter(ev => ev._id !== id);
        this.setData({
          activeEvents,
          archivedEvents,
          archivedFutureEvents,
          archivedPastEvents,
          activeCount: activeEvents.length,
          archivedCount: archivedEvents.length,
          totalCount: activeEvents.length + archivedEvents.length,
          showDeleteConfirm: false,
          pendingDeleteId: null
        });
        if (app.globalData.pinnedEventId === id) app.setPinnedEvent(null);
        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '删除失败', icon: 'error' });
        this.setData({ showDeleteConfirm: false });
      });
  },

  // Swipe gesture for edit/delete reveal
  onSwipeEvent(e) {
    const id = e.currentTarget.dataset.id;
    const toggle = arr => arr.map(ev => ({ ...ev, swipeOpen: ev._id === id ? !ev.swipeOpen : false }));
    this.setData({
      activeEvents:         toggle(this.data.activeEvents),
      archivedEvents:       toggle(this.data.archivedEvents),
      archivedFutureEvents: toggle(this.data.archivedFutureEvents),
      archivedPastEvents:   toggle(this.data.archivedPastEvents)
    });
  },

  onCloseSwipe() {
    const close = arr => arr.map(ev => ({ ...ev, swipeOpen: false }));
    this.setData({
      activeEvents:         close(this.data.activeEvents),
      archivedEvents:       close(this.data.archivedEvents),
      archivedFutureEvents: close(this.data.archivedFutureEvents),
      archivedPastEvents:   close(this.data.archivedPastEvents)
    });
  },

  // ========================
  // Settings
  // ========================

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  onGoToLogin() {
    // Trigger WeChat login
    app.login();
    wx.showToast({ title: '正在登录...', icon: 'loading' });
  }
});
