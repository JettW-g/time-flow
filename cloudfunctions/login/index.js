const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // Check if user exists
    const res = await db.collection('users').where({ _openid: openid }).get();

    if (res.data && res.data.length > 0) {
      // User exists, return existing record
      const userRecord = res.data[0];
      await db.collection('users').doc(userRecord._id).update({
        data: { updatedAt: db.serverDate() }
      });
      return { openid, userRecord };
    } else {
      // Create new user
      const newUser = {
        _openid: openid,
        nickName: '',
        avatarUrl: '',
        pinnedEventId: null,
        settings: {
          offWorkTime: '18:00',
          showLunar: true
        },
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      };
      const addRes = await db.collection('users').add({ data: newUser });
      return { openid, userRecord: { _id: addRes._id, ...newUser } };
    }
  } catch (err) {
    console.error('Login cloud function error:', err);
    return { openid, userRecord: null, error: err.message };
  }
};
