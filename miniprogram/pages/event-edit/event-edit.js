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
      note: '',
      icon: ''
    },
    iconOptions: ['🎂','🎉','✈️','🏖️','🎓','💼','🏠','❤️','⭐','🎵','🏃','🎯','🌟','📅','🎁','🌸','🌙','☀️','🎊','🏆','💪','🔥','🍀','🎈','🍜','🎸','📷','🐶','🌈','🎮'],
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
    minDate: '',
    maxDate: ''
  },

  onLoad(options) {
    const { id, date, name } = options;
    const now = new Date();
    const minDate = this._formatDate(new Date(now.getFullYear() - 100, now.getMonth(), now.getDate()));
    const maxDate = this._formatDate(new Date(now.getFullYear() + 20, now.getMonth(), now.getDate()));
    this.setData({ minDate, maxDate });

    if (id) {
      this.setData({ mode: 'edit', eventId: id });
      this._loadEvent(id);
    } else {
      const dateStr = date || this._formatDate(now);
      this.setData({ 'form.date': dateStr });
      this._updateIsPastDate(dateStr);
      this._updateRecurringDefaults('custom_once');
      if (name) {
        this.setData({ 'form.name': decodeURIComponent(name) });
      }
    }
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
            note: ev.note || '',
            icon: ev.icon || ''
          }
        });
        this._updateIsPastDate(ev.targetDate || '');
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

  onIconSelect(e) {
    const icon = e.currentTarget.dataset.icon;
    this.setData({ 'form.icon': this.data.form.icon === icon ? '' : icon });
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

  onDateChange(e) {
    const dateStr = e.detail.value;
    this.setData({ 'form.date': dateStr });
    this._updateIsPastDate(dateStr);
  },

  onTimeChange(e) {
    this.setData({ 'form.time': e.detail.value });
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
      icon: form.icon || '',
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

    // Check event count limits before creating
    const now = new Date();
    const eventDateTime = new Date(`${targetDate}T${form.time || '00:00'}:00`);
    const isPast = eventDateTime < now;

    // 过去事件：时间范围不能超过10年前
    if (isPast) {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      if (eventDateTime < tenYearsAgo) {
        this.setData({ isSubmitting: false });
        wx.showToast({ title: '过去事件不能早于10年前', icon: 'none', duration: 2000 });
        return;
      }
    }

    const limit = isPast ? 5 : 20;
    const limitMsg = isPast
      ? '有些事情，该放下就要放下，向前看'
      : '别给自己太大压力，专注在最重要的事情上，慢慢来';

    db.collection('events').get().then(res => {
      const allEvents = res.data || [];
      // 重名检测
      const nameExists = allEvents.some(e => e.name === form.name.trim());
      if (nameExists) {
        this.setData({ isSubmitting: false });
        wx.showToast({ title: '已有同名事件', icon: 'none' });
        return;
      }
      const count = allEvents.filter(e => {
        if (e.archived) return false; // 已归档不计入
        const t = new Date(`${e.targetDate}T${e.targetTime || '00:00'}:00`);
        if (isPast) {
          // 过去事件：targetDate < createdAt（原本就是过去事件）
          const createdAt = e.createdAt ? new Date(e.createdAt) : now;
          return t < createdAt;
        }
        return t >= now;
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
