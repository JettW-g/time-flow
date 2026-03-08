const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 管理员云函数：更新指定年份的法定节假日数据
 * 调用方式：仅通过云开发控制台或有管理员权限的接口调用
 *
 * 入参:
 *   year: number - 年份
 *   holidays: Array<{
 *     date: string (YYYY-MM-DD),
 *     name: string,
 *     category: 'legal',
 *     isHoliday: boolean (true=放假, false=调休上班),
 *     linkedHoliday: string
 *   }>
 */
exports.main = async (event, context) => {
  const { year, holidays } = event;

  if (!year || !Array.isArray(holidays)) {
    return { success: false, error: 'Invalid parameters. Need year and holidays array.' };
  }

  try {
    // Delete existing records for this year
    const existing = await db.collection('holidays').where({ year }).get();
    const deletePromises = existing.data.map(doc =>
      db.collection('holidays').doc(doc._id).remove()
    );
    await Promise.all(deletePromises);

    // Insert new records
    const addPromises = holidays.map(h =>
      db.collection('holidays').add({
        data: {
          year,
          date: h.date,
          name: h.name,
          category: h.category || 'legal',
          isHoliday: h.isHoliday,
          linkedHoliday: h.linkedHoliday || h.name,
          updatedAt: db.serverDate()
        }
      })
    );
    await Promise.all(addPromises);

    return {
      success: true,
      year,
      count: holidays.length,
      message: `Successfully updated ${holidays.length} holiday records for ${year}`
    };
  } catch (err) {
    console.error('updateHolidays error:', err);
    return { success: false, error: err.message };
  }
};
