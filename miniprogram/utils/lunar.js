/**
 * 农历工具模块 - 自包含实现，无需 npm 包
 * 使用已知的春节日期锚点 + 朔望月近似计算农历日期
 */

// 各年春节（正月初一）公历日期
const SPRING_FESTIVALS = {
  2019: '2019-02-05', 2020: '2020-01-25', 2021: '2021-02-12',
  2022: '2022-02-01', 2023: '2023-01-22', 2024: '2024-02-10',
  2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06',
  2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03',
  2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31',
  2034: '2034-02-19', 2035: '2035-02-08'
};

// 各农历年的闰月（0=无闰月）
const LEAP_MONTHS = {
  2020: 4, 2023: 2, 2025: 6, 2028: 5, 2031: 3, 2033: 11
};

// 传统节日硬编码公历日期（主要节日）
const FESTIVAL_DATES = {
  // 2023
  '2023-01-22': '春节',  '2023-02-05': '元宵节', '2023-06-22': '端午节',
  '2023-08-22': '七夕节', '2023-09-29': '中秋节', '2023-10-23': '重阳节',
  '2024-01-07': '腊八节',
  // 2024
  '2024-02-10': '春节',  '2024-02-24': '元宵节', '2024-06-10': '端午节',
  '2024-08-10': '七夕节', '2024-09-17': '中秋节', '2024-10-11': '重阳节',
  '2025-01-07': '腊八节',
  // 2025
  '2025-01-29': '春节',  '2025-02-12': '元宵节', '2025-05-31': '端午节',
  '2025-08-29': '七夕节', '2025-10-06': '中秋节', '2025-10-29': '重阳节',
  '2026-01-26': '腊八节',
  // 2026
  '2026-02-17': '春节',  '2026-03-03': '元宵节', '2026-06-19': '端午节',
  '2026-08-19': '七夕节', '2026-09-24': '中秋节', '2026-10-18': '重阳节',
  '2027-02-14': '腊八节',
  // 2027
  '2027-02-06': '春节',  '2027-02-20': '元宵节', '2027-06-08': '端午节',
  '2027-08-08': '七夕节', '2027-09-15': '中秋节', '2027-10-08': '重阳节',
  '2028-01-04': '腊八节',
  // 2028
  '2028-01-26': '春节',  '2028-02-09': '元宵节', '2028-05-27': '端午节',
  '2028-08-25': '七夕节', '2028-10-02': '中秋节', '2028-10-25': '重阳节',
  '2029-01-22': '腊八节',
  // 小年（腊月二十三）
  '2024-02-02': '小年',  '2025-01-22': '小年',  '2026-02-11': '小年',
  '2027-01-31': '小年',  '2028-01-21': '小年',
  // 除夕
  '2024-02-09': '除夕',  '2025-01-28': '除夕',  '2026-02-16': '除夕',
  '2027-02-05': '除夕',  '2028-01-25': '除夕'
};

// 农历日名称
const LUNAR_DAYS = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

// 农历月名称
const LUNAR_MONTHS = [
  '', '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月'
];

const SYNODIC = 29.53059; // 朔望月天数

/**
 * 日期转字符串 YYYY-MM-DD
 */
function _formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算两个日期之间的天数差
 */
function _daysDiff(d1, d2) {
  return Math.round((d2 - d1) / 86400000);
}

/**
 * 找到给定公历日期对应的农历年（即哪一年的春节之后）
 */
function _findLunarYear(date) {
  const years = Object.keys(SPRING_FESTIVALS).map(Number).sort((a, b) => a - b);
  let lunarYear = years[0];
  for (const y of years) {
    const sf = new Date(SPRING_FESTIVALS[y]);
    if (date >= sf) lunarYear = y;
    else break;
  }
  return lunarYear;
}

/**
 * 公历日期转农历信息
 * @param {number} year @param {number} month 1-12 @param {number} day
 * @returns {{ lunarMonth, lunarDay, monthName, dayName, festivalName, displayText }}
 */
function solarToLunar(year, month, day) {
  try {
    const date = new Date(year, month - 1, day);
    const dateStr = _formatDate(date);

    // 先查节日表
    const festivalName = FESTIVAL_DATES[dateStr] || '';

    const lunarYear = _findLunarYear(date);
    const sfDate = new Date(SPRING_FESTIVALS[lunarYear]);
    const daysSinceSf = _daysDiff(sfDate, date);

    if (daysSinceSf < 0) {
      return { lunarMonth: 12, lunarDay: 1, monthName: '腊月', dayName: '初一', festivalName, displayText: festivalName || '腊月' };
    }

    const leapMonth = LEAP_MONTHS[lunarYear] || 0;

    // 按朔望月估算当前是第几个月（从正月=1开始）
    // 闰月之后的月份需要+1个月偏移
    let totalMonths = daysSinceSf / SYNODIC;
    let approxMonthIndex = Math.floor(totalMonths); // 0-based month index
    let approxDay = Math.floor(daysSinceSf - approxMonthIndex * SYNODIC) + 1;

    // 映射到实际农历月号（考虑闰月）
    let lunarMonth, isLeap;
    if (leapMonth > 0) {
      // 闰月之前：month index 直接对应
      // 闰月本身：index == leapMonth (0-based: leapMonth)
      // 闰月之后：index > leapMonth，月号 = index（因为多了一个月）
      const leapIdx = leapMonth; // 0-based: 正月=0, 二月=1, ..., 闰月在第leapMonth位(1-based)
      if (approxMonthIndex < leapIdx) {
        lunarMonth = approxMonthIndex + 1;
        isLeap = false;
      } else if (approxMonthIndex === leapIdx) {
        lunarMonth = leapMonth;
        isLeap = true;
      } else {
        lunarMonth = approxMonthIndex; // approxMonthIndex >= leapIdx+1, back to normal month numbering
        isLeap = false;
      }
    } else {
      lunarMonth = approxMonthIndex + 1;
      isLeap = false;
    }

    // 限制范围
    lunarMonth = Math.max(1, Math.min(12, lunarMonth));
    approxDay = Math.max(1, Math.min(30, approxDay));

    const monthName = (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth];
    const dayName = LUNAR_DAYS[approxDay] || '';

    let displayText;
    if (festivalName) {
      displayText = festivalName;
    } else if (approxDay === 1) {
      displayText = monthName; // 初一显示月份名
    } else {
      displayText = dayName;
    }

    return {
      lunarYear, lunarMonth, lunarDay: approxDay,
      monthName, dayName, isLeap, festivalName, displayText
    };
  } catch (e) {
    return { lunarMonth: 1, lunarDay: 1, monthName: '', dayName: '', festivalName: '', displayText: '' };
  }
}

/**
 * 农历日期转公历日期（用于农历生日计算）
 * @param {number} lunarMonth 1-12
 * @param {number} lunarDay 1-30
 * @param {number} [targetLunarYear] 目标农历年，默认当年
 * @returns {string} YYYY-MM-DD
 */
function lunarToSolar(lunarMonth, lunarDay, targetLunarYear) {
  try {
    const now = new Date();
    const lunarYear = targetLunarYear || _findLunarYear(now);
    const sfDate = new Date(SPRING_FESTIVALS[lunarYear]);
    if (!sfDate) return null;

    const leapMonth = LEAP_MONTHS[lunarYear] || 0;
    // 计算该农历月份距春节的天数
    let monthsBefore = lunarMonth - 1;
    if (leapMonth > 0 && leapMonth < lunarMonth) monthsBefore++; // 闰月导致多一个月

    const totalDays = Math.round(monthsBefore * SYNODIC) + (lunarDay - 1);
    const result = new Date(sfDate);
    result.setDate(result.getDate() + totalDays);
    return _formatDate(result);
  } catch (e) {
    return null;
  }
}

/**
 * 计算农历生日下一次公历日期
 */
function getNextLunarBirthday(lunarMonth, lunarDay) {
  const now = new Date();
  const thisLunarYear = _findLunarYear(now);

  const thisYearDate = lunarToSolar(lunarMonth, lunarDay, thisLunarYear);
  if (thisYearDate && new Date(thisYearDate) > now) return thisYearDate;

  return lunarToSolar(lunarMonth, lunarDay, thisLunarYear + 1) || thisYearDate;
}

/**
 * 获取指定公历年的传统节日列表
 */
function getTraditionalFestivals(year) {
  const results = [];
  Object.entries(FESTIVAL_DATES).forEach(([date, name]) => {
    if (date.startsWith(String(year))) {
      results.push({ date, name, category: 'traditional' });
    }
  });
  return results;
}

/**
 * 格式化日历格子中显示的农历文字
 */
function formatLunarDisplay(year, month, day) {
  try {
    const info = solarToLunar(year, month, day);
    return info ? info.displayText : '';
  } catch (e) {
    return '';
  }
}

module.exports = {
  solarToLunar,
  lunarToSolar,
  getNextLunarBirthday,
  getTraditionalFestivals,
  formatLunarDisplay
};
