const app = getApp();
const { formatLunarDisplay } = require('../../utils/lunar');
const { getInternationalHolidays, getBuiltinLegalHolidays, buildHolidayMap } = require('../../utils/holidays');
const { daysUntil } = require('../../utils/countdown');

Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    calendarDays: [],
    selectedDate: '',
    selectedDayEvents: [],
    showDaySheet: false,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    isLoading: true,
    touchStartX: 0,
    monthEventGroups: []
  },

  _holidayMap: {},
  _userEventsByDate: {},
  _allHolidays: [],

  onLoad() {
    this._loadHolidayData();
  },

  onShow() {
    this._loadUserEvents();
  },

  // ========================
  // Data Loading
  // ========================

  _loadHolidayData() {
    const year = this.data.currentYear;
    const intl = getInternationalHolidays(year);
    const legal = getBuiltinLegalHolidays(year);
    this._holidayMap = buildHolidayMap(legal);

    // Merge all static holiday data
    this._allHolidays = [...legal, ...intl];

    // Try cloud for fresh legal holiday data
    wx.cloud.database().collection('holidays')
      .where({ year })
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          const cloudLegal = res.data;
          this._holidayMap = buildHolidayMap(cloudLegal);
          this._allHolidays = [...cloudLegal, ...intl];
          this._buildCalendar();
        }
      })
      .catch(() => {});

    this._buildCalendar();
  },

  _loadUserEvents() {
    // 先用已有数据立即渲染，云端数据回来后静默更新
    this._buildCalendar();

    if (!app.globalData.isLoggedIn) return;

    wx.cloud.database().collection('events')
      .get()
      .then(res => {
        const events = res.data || [];
        const byDate = {};
        events.forEach(ev => {
          const date = ev.targetDate;
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(ev);
        });
        this._userEventsByDate = byDate;
        this._buildCalendar();
      })
      .catch(() => {});
  },

  // ========================
  // Calendar Building
  // ========================

  _buildCalendar() {
    const { currentYear, currentMonth } = this.data;
    const today = new Date();
    const todayStr = this._formatDate(today);

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startWeekday = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const days = [];

    // Leading empty cells
    for (let i = 0; i < startWeekday; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }

    // Day cells
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const dateStr = this._formatDate(date);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = dateStr === todayStr;

      const legalInfo = this._holidayMap[dateStr];
      const isHoliday = legalInfo ? legalInfo.isHoliday : false;
      const isWorkday = legalInfo ? !legalInfo.isHoliday : false; // 调休上班

      // Collect markers and holiday name
      const markers = [];
      let primaryHolidayName = '';
      let holidayCategory = '';

      // Legal holiday
      if (legalInfo && legalInfo.isHoliday) {
        primaryHolidayName = legalInfo.name;
        holidayCategory = 'legal';
        markers.push({ type: 'legal', color: '#EF5350' });
      }

      // International/traditional from all holidays
      const dayHols = this._allHolidays.filter(h => h.date === dateStr && h.category !== 'legal');
      if (dayHols.length > 0 && !primaryHolidayName) {
        primaryHolidayName = dayHols[0].name;
        holidayCategory = dayHols[0].category;
      }
      dayHols.forEach(h => {
        const colorMap = { traditional: '#42A5F5', international: '#AB47BC' };
        markers.push({ type: h.category, color: colorMap[h.category] || '#78909C' });
      });

      // User events
      const userEventsForDay = this._userEventsByDate[dateStr] || [];
      if (userEventsForDay.length > 0) {
        markers.push({ type: 'user', color: '#00BCD4' });
      }

      // Lunar display
      let lunarText = '';
      try {
        lunarText = formatLunarDisplay(currentYear, currentMonth, d);
      } catch (e) {
        lunarText = '';
      }

      days.push({
        key: dateStr,
        date: dateStr,
        day: d,
        lunarText,
        isToday,
        isWeekend: isWeekend && !isHoliday && !isWorkday,
        isHoliday,
        isWorkday,
        holidayName: primaryHolidayName,
        holidayCategory,
        markers: markers.slice(0, 3), // max 3 dots
        hasUserEvent: userEventsForDay.length > 0,
        empty: false
      });
    }

    this.setData({ calendarDays: days, isLoading: false, selectedDate: this.data.selectedDate || '' });
    this._buildMonthEventGroups();
  },

  // ========================
  // Month Event Groups (list below calendar)
  // ========================

  _buildMonthEventGroups() {
    const { currentYear, currentMonth } = this.data;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // Legal holidays: deduplicate by linkedHoliday, keep earliest date in month
    const legalMap = {};
    Object.keys(this._holidayMap).forEach(date => {
      if (!date.startsWith(monthPrefix)) return;
      const h = this._holidayMap[date];
      if (!h.isHoliday) return;
      const key = h.linkedHoliday || h.name;
      if (!legalMap[key] || date < legalMap[key].date) {
        legalMap[key] = { name: key, date };
      }
    });

    // Traditional & international from _allHolidays
    const traditional = this._allHolidays.filter(
      h => h.date.startsWith(monthPrefix) && h.category === 'traditional'
    );
    const international = this._allHolidays.filter(
      h => h.date.startsWith(monthPrefix) && h.category === 'international'
    );

    // User events in this month
    const custom = [];
    Object.keys(this._userEventsByDate).forEach(date => {
      if (!date.startsWith(monthPrefix)) return;
      this._userEventsByDate[date].forEach(ev => {
        custom.push({ name: ev.name, date: ev.targetDate });
      });
    });

    const makeDaysInfo = (date) => {
      const target = new Date(date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      const diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
      if (diff === 0) return { text: '就是今天', cls: 'today' };
      if (diff > 0) return { text: `还有 ${diff} 天`, cls: 'future' };
      return { text: `已过去 ${Math.abs(diff)} 天`, cls: 'past' };
    };

    const toItems = (arr) => arr.map(e => {
      const info = makeDaysInfo(e.date);
      return { name: e.name, date: e.date, daysText: info.text, daysClass: info.cls };
    });

    const groups = [];
    const legalArr = Object.values(legalMap).sort((a, b) => a.date.localeCompare(b.date));
    // 合并所有节假日类型，统一展示为"节假日"，按名称+日期去重
    const seenKeys = new Set();
    const allHolidayItems = [...legalArr, ...traditional, ...international]
      .filter(item => {
        const key = `${item.name}|${item.date}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (allHolidayItems.length) groups.push({ category: 'holiday', label: '节假日', color: '#EF5350', events: toItems(allHolidayItems) });
    if (custom.length)          groups.push({ category: 'custom',  label: '我的事件', color: '#00BCD4', events: toItems(custom) });

    this.setData({ monthEventGroups: groups });
  },

  // ========================
  // Month Navigation
  // ========================

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    this.setData({ currentYear, currentMonth, showDaySheet: false });
    this._loadHolidayData();
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    this.setData({ currentYear, currentMonth, showDaySheet: false });
    this._loadHolidayData();
  },

  prevYear() {
    const currentYear = this.data.currentYear - 1;
    this.setData({ currentYear, showDaySheet: false });
    this._loadHolidayData();
  },

  nextYear() {
    const currentYear = this.data.currentYear + 1;
    this.setData({ currentYear, showDaySheet: false });
    this._loadHolidayData();
  },

  goToToday() {
    const today = new Date();
    this.setData({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1,
      showDaySheet: false
    });
    this._loadHolidayData();
  },

  // ========================
  // Touch Swipe
  // ========================

  onTouchStart(e) {
    this.data.touchStartX = e.touches[0].clientX;
  },

  onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.data.touchStartX;
    if (Math.abs(dx) > 60) {
      if (dx < 0) this.nextMonth();
      else this.prevMonth();
    }
  },

  // ========================
  // Day Click - show half sheet
  // ========================

  onDayTap(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) return;

    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();

    // Collect all events for this date
    const events = [];

    // Legal holiday
    const legalInfo = this._holidayMap[date];
    const seenHolidayNames = new Set();
    if (legalInfo && legalInfo.isHoliday) {
      seenHolidayNames.add(legalInfo.name);
      events.push({
        name: legalInfo.name,
        category: 'legal',
        categoryLabel: '节假日',
        color: '#EF5350',
        isHoliday: true,
        daysText: this._getDaysText(date)
      });
    }

    // All holidays on this date (skip legal and skip duplicates by name)
    this._allHolidays.filter(h => h.date === date).forEach(h => {
      if (h.category !== 'legal' && !seenHolidayNames.has(h.name)) {
        seenHolidayNames.add(h.name);
        const colors = { traditional: '#42A5F5', international: '#AB47BC' };
        events.push({
          name: h.name,
          category: h.category,
          categoryLabel: '节假日',
          color: colors[h.category] || '#78909C',
          isHoliday: true,
          daysText: this._getDaysText(date)
        });
      }
    });

    // User events
    const userEvs = this._userEventsByDate[date] || [];
    userEvs.forEach(ev => {
      const days = daysUntil(ev.targetDate, ev.targetTime);
      events.push({
        _id: ev._id,
        name: ev.name,
        category: ev.type,
        categoryLabel: this._typeLabel(ev.type),
        color: '#00BCD4',
        daysText: days === 0 ? '今天' : days > 0 ? `还有 ${days} 天` : `已过 ${Math.abs(days)} 天`
      });
    });

    this.setData({
      selectedDate: date,
      selectedDayEvents: events,
      showDaySheet: true
    });
  },

  _getDaysText(dateStr) {
    const target = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天';
    if (diff > 0) return `还有 ${diff} 天`;
    return `已过 ${Math.abs(diff)} 天`;
  },

  _typeLabel(type) {
    const map = {
      birthday: '生日',
      anniversary: '纪念日',
      custom_once: '自定义',
      custom_repeat: '自定义重复'
    };
    return map[type] || '事件';
  },

  closeDaySheet() {
    this.setData({ showDaySheet: false });
  },

  onAddEvent() {
    const { selectedDate } = this.data;
    wx.navigateTo({
      url: `/pages/event-edit/event-edit?date=${selectedDate}`
    });
  },

  onAddHolidayEvent(e) {
    const { name, date } = e.currentTarget.dataset;
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const db = wx.cloud.database();
    const newEvent = {
      name,
      targetDate: date,
      targetTime: '00:00',
      type: 'custom_once',
      icon: '⭐',
      isRecurring: false,
      note: '',
      createdAt: db.serverDate()
    };
    wx.showLoading({ title: '添加中…', mask: true });
    db.collection('events').add({ data: newEvent })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已添加到关注', icon: 'success' });
        this._loadUserEvents();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '添加失败', icon: 'error' });
      });
  },

  // ========================
  // Helpers
  // ========================

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
});
