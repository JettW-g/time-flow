/**
 * 倒计时计算工具模块
 */
const { isWorkday, formatDate, getNextWorkday } = require('./holidays');

/**
 * 计算目标时间的倒计时（未来事件）
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} targetTime HH:mm
 * @returns {{ days, hours, minutes, seconds, totalMs, expired }} | null
 */
function calculateCountdown(targetDate, targetTime = '00:00') {
  const target = new Date(`${targetDate}T${targetTime}:00`);
  const now = new Date();
  const diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, expired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, totalMs: diff, expired: false };
}

/**
 * 计算历史事件至今已过去多久（过去事件）
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} targetTime HH:mm
 * @returns {{ days, hours, minutes, seconds, totalMs, isPast }} | null
 */
function calculateElapsed(targetDate, targetTime = '00:00') {
  const target = new Date(`${targetDate}T${targetTime}:00`);
  const now = new Date();
  const diff = now - target;

  if (diff <= 0) {
    return null; // 尚未到达，不是过去事件
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, totalMs: diff, isPast: true };
}

/**
 * 数字补零
 */
function padZero(n) {
  return String(n).padStart(2, '0');
}

/**
 * 获取本周末目标时间（本周五 18:00）
 * - 周一至周五 18:00 之前：倒计时到本周五 18:00
 * - 周五 18:00 之后、周六、周日：返回已过去的本周五 18:00（倒计时显示 0）
 * @returns {{ date: string, time: string, label: string }}
 */
function getNextWeekendTarget() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat

  let friday = new Date(now);
  if (day === 6) {
    friday.setDate(now.getDate() - 1);      // 周六 → 昨天（周五）
  } else if (day === 0) {
    friday.setDate(now.getDate() - 2);      // 周日 → 前天（周五）
  } else {
    friday.setDate(now.getDate() + (5 - day)); // 周一~周五 → 本周五
  }
  friday.setHours(18, 0, 0, 0);

  return {
    date: formatDate(friday),
    time: '18:00',
    label: '本周末'
  };
}

/**
 * 获取下一个工作日开始（周一09:00）
 */
function getNextWeekdayStart(holidayMap = {}) {
  const now = new Date();
  let d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    if (isWorkday(d, holidayMap)) {
      return {
        date: formatDate(d),
        time: '09:00',
        label: '距离上班'
      };
    }
    d.setDate(d.getDate() + 1);
  }

  return { date: formatDate(d), time: '09:00', label: '距离上班' };
}

/**
 * 获取今天下班时间（仅工作日）
 * - 今天是工作日：固定返回今天 18:00，过了不顺延（倒计时显示 0）
 * - 今天非工作日：返回 null，不展示该事件
 * @param {string} offWorkTime HH:mm (default '18:00')
 * @param {Object} holidayMap
 * @returns {{ date: string, time: string, label: string } | null}
 */
function getOffWorkTarget(offWorkTime = '18:00', holidayMap = {}) {
  const now = new Date();
  const todayStr = formatDate(now);

  if (!isWorkday(todayStr, holidayMap)) {
    return null;
  }

  return {
    date: todayStr,
    time: offWorkTime,
    label: '今天下班'
  };
}

/**
 * 计算年度循环事件的下一次发生日期
 * @param {string} originDate MM-DD (公历)
 * @returns {string} YYYY-MM-DD
 */
function getNextAnnualDate(originDate) {
  const now = new Date();
  const year = now.getFullYear();
  const [month, day] = originDate.split('-').map(Number);

  let target = new Date(year, month - 1, day);
  if (target <= now) {
    target = new Date(year + 1, month - 1, day);
  }
  return formatDate(target);
}

/**
 * 计算月度循环事件的下一次发生日期
 * @param {number} dayOfMonth 1-31
 * @returns {string} YYYY-MM-DD
 */
function getNextMonthlyDate(dayOfMonth) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based

  let target = new Date(year, month, dayOfMonth);
  if (target <= now) {
    month++;
    if (month > 11) { month = 0; year++; }
    target = new Date(year, month, dayOfMonth);
    // Handle month overflow (e.g., Feb 31 -> Feb 28)
    if (target.getMonth() !== month % 12) {
      target = new Date(year, month + 1, 0); // last day of month
    }
  }
  return formatDate(target);
}

/**
 * 计算周度循环事件的下一次发生日期
 * @param {string} targetDate YYYY-MM-DD 上一次发生的日期
 * @returns {string} YYYY-MM-DD
 */
function getNextWeeklyDate(targetDate) {
  const now = new Date();
  const d = new Date(targetDate);
  while (d <= now) {
    d.setDate(d.getDate() + 7);
  }
  return formatDate(d);
}

/**
 * 根据事件类型获取预置系统事件列表
 * @param {string} offWorkTime
 * @param {Object} holidayMap
 * @returns {Array<{id, name, label, targetDate, targetTime, type, isSystem}>}
 */
function getSystemEvents(offWorkTime = '18:00', holidayMap = {}) {
  const events = [];

  const offWork = getOffWorkTarget(offWorkTime, holidayMap);
  if (offWork) {
    events.push({
      id: 'sys_offwork',
      name: '今天下班',
      label: offWork.label,
      targetDate: offWork.date,
      targetTime: offWork.time,
      type: 'system',
      isSystem: true,
      isRecurring: false
    });
  }

  const weekend = getNextWeekendTarget();
  events.push({
    id: 'sys_weekend',
    name: '本周末',
    label: weekend.label,
    targetDate: weekend.date,
    targetTime: weekend.time,
    type: 'system',
    isSystem: true,
    isRecurring: false
  });

  return events;
}

/**
 * 选择最近的未过期事件（自动就近逻辑）
 * @param {Array} events
 * @returns {Object|null}
 */
function selectNearestEvent(events) {
  const now = new Date();
  let nearest = null;
  let minDiff = Infinity;

  events.forEach(event => {
    const target = new Date(`${event.targetDate}T${event.targetTime || '00:00'}:00`);
    const diff = target - now;
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      nearest = event;
    }
  });

  return nearest;
}

/**
 * 选择最近发生的过去事件（距今最近）
 * @param {Array} events
 * @returns {Object|null}
 */
function selectMostRecentPastEvent(events) {
  const now = new Date();
  let nearest = null;
  let minDiff = Infinity;

  events.forEach(event => {
    const target = new Date(`${event.targetDate}T${event.targetTime || '00:00'}:00`);
    const diff = now - target; // positive for past events
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      nearest = event;
    }
  });

  return nearest;
}

/**
 * 计算事件距今天数（用于列表显示）
 * @param {string} targetDate
 * @param {string} targetTime
 * @returns {number} 天数，负数表示已过期
 */
function daysUntil(targetDate, targetTime = '00:00') {
  const target = new Date(`${targetDate}T${targetTime}:00`);
  const now = new Date();
  const diff = target - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

module.exports = {
  calculateCountdown,
  calculateElapsed,
  padZero,
  getNextWeekendTarget,
  getNextWeekdayStart,
  getOffWorkTarget,
  getNextAnnualDate,
  getNextMonthlyDate,
  getNextWeeklyDate,
  getSystemEvents,
  selectNearestEvent,
  selectMostRecentPastEvent,
  daysUntil
};
