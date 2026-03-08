const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 定时触发云函数（每日执行）：刷新已过期的循环事件的 targetDate
 * 在云开发控制台配置定时触发器：0 2 * * * (每天凌晨2点)
 */
exports.main = async (event, context) => {
  const now = new Date();
  const todayStr = formatDate(now);

  console.log(`refreshRecurring started at ${now.toISOString()}`);

  try {
    // Query all recurring events that have expired
    const res = await db.collection('events')
      .where({
        isRecurring: true,
        targetDate: _.lt(todayStr)
      })
      .get();

    const expiredEvents = res.data || [];
    console.log(`Found ${expiredEvents.length} expired recurring events`);

    let updatedCount = 0;
    const errors = [];

    for (const ev of expiredEvents) {
      try {
        const newDate = computeNextDate(ev);
        if (newDate) {
          await db.collection('events').doc(ev._id).update({
            data: {
              targetDate: newDate,
              updatedAt: db.serverDate()
            }
          });
          updatedCount++;
          console.log(`Updated event ${ev._id} (${ev.name}): ${ev.targetDate} -> ${newDate}`);
        }
      } catch (err) {
        console.error(`Failed to update event ${ev._id}:`, err);
        errors.push({ id: ev._id, error: err.message });
      }
    }

    return {
      success: true,
      processedCount: expiredEvents.length,
      updatedCount,
      errors
    };
  } catch (err) {
    console.error('refreshRecurring error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Compute next occurrence date for a recurring event
 */
function computeNextDate(ev) {
  const { recurringRule, originDate, targetDate, calendarType } = ev;
  const now = new Date();

  switch (recurringRule) {
    case 'yearly': {
      if (calendarType === 'lunar') {
        // For lunar birthdays, compute next occurrence
        // In production, use the lunarToSolar conversion
        // Here we advance by 1 year as approximation
        const d = new Date(targetDate);
        d.setFullYear(d.getFullYear() + 1);
        return formatDate(d);
      } else {
        // Solar annual: use originDate (MM-DD) with next valid year
        const [month, day] = (originDate || '').split('-').map(Number);
        if (!month || !day) {
          // Fallback: add 1 year to current targetDate
          const d = new Date(targetDate);
          d.setFullYear(d.getFullYear() + 1);
          return formatDate(d);
        }
        let year = now.getFullYear();
        let candidate = new Date(year, month - 1, day);
        if (candidate <= now) {
          candidate = new Date(year + 1, month - 1, day);
        }
        return formatDate(candidate);
      }
    }

    case 'monthly': {
      const d = new Date(targetDate);
      let year = d.getFullYear();
      let month = d.getMonth() + 1;
      const day = d.getDate();

      // Advance month until future
      while (new Date(year, month - 1, day) <= now) {
        month++;
        if (month > 12) { month = 1; year++; }
      }

      // Handle month overflow (e.g. March 31 -> April 30)
      const candidate = new Date(year, month - 1, day);
      if (candidate.getMonth() !== month - 1) {
        // Overflow: go to last day of the month
        return formatDate(new Date(year, month, 0));
      }
      return formatDate(candidate);
    }

    case 'weekly': {
      const d = new Date(targetDate);
      while (d <= now) {
        d.setDate(d.getDate() + 7);
      }
      return formatDate(d);
    }

    default:
      return null;
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
