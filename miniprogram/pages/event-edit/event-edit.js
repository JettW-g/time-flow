const app = getApp();
const { getNextAnnualDate, getNextMonthlyDate, getNextWeeklyDate } = require('../../utils/countdown');
const { lunarToSolar } = require('../../utils/lunar');

Page({
  data: {
    mode: 'create', // 'create' | 'edit'
    eventId: null,
    form: {
      name: '',
      type: 'custom_once',
      date: '',
      time: '00:00',
      calendarType: 'solar',
      isRecurring: false,
      recurringRule: 'yearly',
      note: ''
    },
    typeOptions: [
      { value: 'custom_once', label: '一次性事件', desc: '到达日期后归档' },
      { value: 'custom_repeat', label: '重复事件', desc: '按自定周期循环' }
    ],
    recurringRules: ['yearly', 'monthly', 'weekly'],
    recurringRuleLabels: ['每年', '每月', '每周'],
    calendarTypes: [
      { value: 'solar', label: '公历' },
      { value: 'lunar', label: '农历' }
    ],
    isPastDate: false,
    isSubmitting: false,
    // Date picker arrays
    years: [],
    months: ['01','02','03','04','05','06','07','08','09','10','11','12'],
    days: [],
    selectedYearIndex: 0,
    selectedMonthIndex: 0,
    selectedDayIndex: 0,
    // Time picker
    hours: [],
    minutes: [],
    selectedHourIndex: 0,
    selectedMinuteIndex: 0
  },

  onLoad(options) {
    const { id, date } = options;
    this._initPickerData();

    if (id) {
      this.setData({ mode: 'edit', eventId: id });
      this._loadEvent(id);
    } else {
      // Pre-fill date if provided (from calendar page)
      if (date) {
        this.setData({ 'form.date': date });
        this._syncPickerFromDate(date);
        this._updateIsPastDate(date);
      } else {
        const today = new Date();
        const dateStr = this._formatDate(today);
        this.setData({ 'form.date': dateStr });
        this._syncPickerFromDate(dateStr);
        this._updateIsPastDate(dateStr);
      }
      this._updateRecurringDefaults('custom_once');
    }
  },

  _initPickerData() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear - 100; y <= currentYear + 20; y++) {
      years.push(String(y));
    }
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    const days = this._getDaysInMonth(currentYear, 1);

    this.setData({
      years,
      days,
      hours,
      minutes,
      selectedYearIndex: years.indexOf(String(currentYear)),
      selectedMonthIndex: new Date().getMonth(),
      selectedDayIndex: new Date().getDate() - 1,
      selectedHourIndex: 0,
      selectedMinuteIndex: 0
    });
  },

  _getDaysInMonth(year, month) {
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'));
  },

  _syncPickerFromDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const years = this.data.years;
    const days = this._getDaysInMonth(y, m);
    this.setData({
      days,
      selectedYearIndex: years.indexOf(String(y)),
      selectedMonthIndex: m - 1,
      selectedDayIndex: Math.min(d - 1, days.length - 1)
    });
  },

  _loadEvent(id) {
    wx.showLoading({ title: '加载中' });
    wx.cloud.database().collection('events').doc(id).get()
      .then(res => {
        wx.hideLoading();
        const ev = res.data;
        this.setData({
          form: {
            name: ev.name || '',
            type: ev.type || 'custom_once',
            date: ev.targetDate || '',
            time: ev.targetTime || '00:00',
            calendarType: 'solar', // 日历类型选择已移除，统一公历
            isRecurring: ev.isRecurring || false,
            recurringRule: ev.recurringRule || 'yearly',
            note: ev.note || ''
          }
        });
        this._syncPickerFromDate(ev.targetDate || '');
        const [h, m] = (ev.targetTime || '00:00').split(':').map(Number);
        this.setData({
          selectedHourIndex: h,
          selectedMinuteIndex: m
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'error' });
        wx.navigateBack();
      });
  },

  // ========================
  // Form inputs
  // ========================

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value });
  },

  _updateIsPastDate(dateStr) {
    const isPastDate = dateStr ? new Date(dateStr) < new Date() : false;
    this.setData({ isPastDate });
    // 过去日期只能选一次性事件
    if (isPastDate && this.data.form.type === 'custom_repeat') {
      this.setData({ 'form.type': 'custom_once', 'form.isRecurring': false });
    }
  },

  onTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    // 过去日期不允许选重复事件
    if (type === 'custom_repeat' && this.data.isPastDate) return;
    this.setData({ 'form.type': type });
    this._updateRecurringDefaults(type);
  },

  _updateRecurringDefaults(type) {
    if (type === 'custom_once') {
      this.setData({ 'form.isRecurring': false });
    } else if (type === 'custom_repeat') {
      this.setData({ 'form.isRecurring': true });
    }
  },

  onCalendarTypeChange(e) {
    this.setData({ 'form.calendarType': e.currentTarget.dataset.caltype });
  },

  onRecurringToggle(e) {
    this.setData({ 'form.isRecurring': e.detail.value });
  },

  onRecurringRuleChange(e) {
    const rules = ['yearly', 'monthly', 'weekly'];
    this.setData({ 'form.recurringRule': rules[e.detail.value] });
  },

  // Date picker (multi-column)
  onDateChange(e) {
    const [yIdx, mIdx, dIdx] = e.detail.value;
    const year = parseInt(this.data.years[yIdx]);
    const month = parseInt(this.data.months[mIdx]);
    const days = this._getDaysInMonth(year, month);
    const dayIdx = Math.min(dIdx, days.length - 1);
    const day = parseInt(days[dayIdx]);

    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    this.setData({
      days,
      selectedYearIndex: yIdx,
      selectedMonthIndex: mIdx,
      selectedDayIndex: dayIdx,
      'form.date': dateStr
    });
    this._updateIsPastDate(dateStr);
  },

  // Time picker
  onTimeChange(e) {
    const [hIdx, mIdx] = e.detail.value;
    const h = String(hIdx).padStart(2, '0');
    const m = String(mIdx).padStart(2, '0');
    this.setData({
      selectedHourIndex: hIdx,
      selectedMinuteIndex: mIdx,
      'form.time': `${h}:${m}`
    });
  },

  // ========================
  // Submit
  // ========================

  onSubmit() {
    const { form, mode, eventId } = this.data;

    // Validate
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入事件名称', icon: 'none' });
      return;
    }
    if (!form.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });

    // Compute actual target date（日历类型选择已移除，统一使用公历）
    let targetDate = form.date;

    // For recurring events, compute next occurrence
    if (form.isRecurring) {
      if (form.recurringRule === 'yearly') {
        const [, m, d] = targetDate.split('-');
        targetDate = getNextAnnualDate(`${m}-${d}`);
      } else if (form.recurringRule === 'monthly') {
        const [, , d] = targetDate.split('-');
        targetDate = getNextMonthlyDate(parseInt(d));
      } else if (form.recurringRule === 'weekly') {
        targetDate = getNextWeeklyDate(targetDate);
      }
    }

    const [, originM, originD] = form.date.split('-');
    const eventData = {
      name: form.name.trim(),
      type: form.type,
      targetDate,
      targetTime: form.time,
      originDate: `${originM}-${originD}`,
      calendarType: form.calendarType,
      isRecurring: form.isRecurring,
      recurringRule: form.isRecurring ? form.recurringRule : null,
      note: form.note.trim(),
      updatedAt: wx.cloud.database().serverDate()
    };

    const db = wx.cloud.database();

    const doSave = () => {
      let op;
      if (mode === 'edit' && eventId) {
        op = db.collection('events').doc(eventId).update({ data: eventData });
      } else {
        eventData.createdAt = db.serverDate();
        op = db.collection('events').add({ data: eventData });
      }
      op.then(() => {
        this.setData({ isSubmitting: false });
        wx.showToast({ title: mode === 'edit' ? '已更新' : '已添加', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      })
      .catch(err => {
        console.error('Save event error:', err);
        this.setData({ isSubmitting: false });
        wx.showToast({ title: '保存失败', icon: 'error' });
      });
    };

    if (mode !== 'create') {
      doSave();
      return;
    }

    // Check 1-year boundary rules
    const now = new Date();
    const eventDateTime = new Date(`${targetDate}T${form.time || '00:00'}:00`);
    const isPast = eventDateTime < now;
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    if (isPast && (now - eventDateTime) > oneYearMs) {
      this.setData({ isSubmitting: false });
      wx.showModal({
        title: '不能创建',
        content: '事情过去这么久了，该放下就要放下，向前看',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    if (!isPast && (eventDateTime - now) > oneYearMs) {
      this.setData({ isSubmitting: false });
      wx.showModal({
        title: '不能创建超过一年的事件',
        content: '还早着呢，别着急，慢慢来',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // Check event count limits before creating
    const limit = isPast ? 10 : 20;
    const limitMsg = isPast
      ? '有些事情，该放下就要放下，向前看'
      : '别给自己太大压力，专注在最重要的事情上，慢慢来';

    db.collection('events').get().then(res => {
      const allEvents = res.data || [];
      const count = allEvents.filter(e => {
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        return isPast ? t < now : t >= now;
      }).length;

      if (count >= limit) {
        this.setData({ isSubmitting: false });
        wx.showModal({
          title: '已达上限',
          content: limitMsg,
          showCancel: false,
          confirmText: '知道了'
        });
      } else {
        doSave();
      }
    }).catch(() => {
      // If query fails, allow save
      doSave();
    });
  },

  onCancel() {
    wx.navigateBack();
  },

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
});
