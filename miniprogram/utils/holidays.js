/**
 * 节假日数据模块
 * 包含国际节日（固定公历日期）和2026年法定节假日数据
 * 法定节假日需每年由管理员通过 updateHolidays 云函数更新
 */

// 国际节日（固定公历月/日）
const INTERNATIONAL_HOLIDAYS = [
  { month: 1, day: 1, name: '元旦' },
  { month: 2, day: 14, name: '情人节' },
  { month: 3, day: 8, name: '妇女节' },
  { month: 3, day: 12, name: '植树节' },
  { month: 4, day: 1, name: '愚人节' },
  { month: 5, day: 1, name: '劳动节' },
  { month: 6, day: 1, name: '儿童节' },
  { month: 8, day: 1, name: '建军节' },
  { month: 9, day: 10, name: '教师节' },
  { month: 10, day: 1, name: '国庆节' },
  { month: 10, day: 31, name: '万圣节' },
  { month: 12, day: 24, name: '平安夜' },
  { month: 12, day: 25, name: '圣诞节' }
];

/**
 * 2026年法定节假日与调休数据（需根据国务院公告确认）
 * isHoliday: true = 放假, false = 调休上班
 */
const LEGAL_HOLIDAYS_2026 = [
  // 元旦 (1月1日-1月2日放假，1月3日调休)
  { date: '2026-01-01', name: '元旦', isHoliday: true, linkedHoliday: '元旦' },
  { date: '2026-01-02', name: '元旦', isHoliday: true, linkedHoliday: '元旦' },
  { date: '2026-01-03', name: '元旦调休', isHoliday: false, linkedHoliday: '元旦' },

  // 春节（农历正月初一为2026年2月17日，预计2月17-23放假）
  { date: '2026-02-17', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-18', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-19', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-20', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-21', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-22', name: '春节', isHoliday: true, linkedHoliday: '春节' },
  { date: '2026-02-23', name: '春节', isHoliday: true, linkedHoliday: '春节' },

  // 清明节（4月5日前后）
  { date: '2026-04-04', name: '清明节', isHoliday: true, linkedHoliday: '清明节' },
  { date: '2026-04-05', name: '清明节', isHoliday: true, linkedHoliday: '清明节' },
  { date: '2026-04-06', name: '清明节', isHoliday: true, linkedHoliday: '清明节' },

  // 劳动节（5月1-5日）
  { date: '2026-05-01', name: '劳动节', isHoliday: true, linkedHoliday: '劳动节' },
  { date: '2026-05-02', name: '劳动节', isHoliday: true, linkedHoliday: '劳动节' },
  { date: '2026-05-03', name: '劳动节', isHoliday: true, linkedHoliday: '劳动节' },
  { date: '2026-05-04', name: '劳动节', isHoliday: true, linkedHoliday: '劳动节' },
  { date: '2026-05-05', name: '劳动节', isHoliday: true, linkedHoliday: '劳动节' },

  // 端午节（农历五月初五，2026年为6月20日前后）
  { date: '2026-06-19', name: '端午节', isHoliday: true, linkedHoliday: '端午节' },
  { date: '2026-06-20', name: '端午节', isHoliday: true, linkedHoliday: '端午节' },
  { date: '2026-06-21', name: '端午节', isHoliday: true, linkedHoliday: '端午节' },

  // 国庆节 + 中秋节
  { date: '2026-10-01', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-02', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-03', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-04', name: '中秋节', isHoliday: true, linkedHoliday: '中秋节' },
  { date: '2026-10-05', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-06', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-07', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' },
  { date: '2026-10-08', name: '国庆节', isHoliday: true, linkedHoliday: '国庆节' }
];

/**
 * 获取指定年份的国际节日列表
 * @param {number} year
 * @returns {Array<{date, name, category}>}
 */
function getInternationalHolidays(year) {
  return INTERNATIONAL_HOLIDAYS.map(h => ({
    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
    name: h.name,
    category: 'international'
  }));
}

/**
 * 获取内置法定节假日数据
 * @param {number} year
 * @returns {Array}
 */
function getBuiltinLegalHolidays(year) {
  if (year === 2026) return LEGAL_HOLIDAYS_2026;
  return [];
}

/**
 * 将节假日数组转换为以日期为键的Map
 * @param {Array} holidays
 * @returns {Object}
 */
function buildHolidayMap(holidays) {
  const map = {};
  holidays.forEach(h => {
    map[h.date] = h;
  });
  return map;
}

/**
 * 判断某天是否是工作日（考虑调休）
 * @param {Date|string} date
 * @param {Object} holidayMap 节假日Map
 * @returns {boolean}
 */
function isWorkday(date, holidayMap = {}) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateStr = formatDate(d);
  const dayOfWeek = d.getDay(); // 0=Sunday, 6=Saturday

  if (holidayMap[dateStr]) {
    // isHoliday: false means 调休上班
    return !holidayMap[dateStr].isHoliday;
  }

  // Regular weekday
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取下一个工作日
 * @param {Object} holidayMap
 * @returns {Date}
 */
function getNextWorkday(holidayMap = {}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(today);
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 30; i++) {
    if (isWorkday(d, holidayMap)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

module.exports = {
  getInternationalHolidays,
  getBuiltinLegalHolidays,
  buildHolidayMap,
  isWorkday,
  formatDate,
  getNextWorkday,
  INTERNATIONAL_HOLIDAYS,
  LEGAL_HOLIDAYS_2026
};
