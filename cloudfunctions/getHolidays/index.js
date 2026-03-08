const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { year } = event;
  const targetYear = year || new Date().getFullYear();

  try {
    // Fetch legal holidays for the year
    const res = await db.collection('holidays')
      .where({ year: targetYear })
      .orderBy('date', 'asc')
      .get();

    return {
      success: true,
      year: targetYear,
      holidays: res.data || []
    };
  } catch (err) {
    console.error('getHolidays error:', err);
    return { success: false, error: err.message, holidays: [] };
  }
};
