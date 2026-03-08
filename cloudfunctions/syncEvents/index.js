const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, eventData, eventId } = event;

  try {
    switch (action) {
      case 'list': {
        const res = await db.collection('events')
          .where({ _openid: openid })
          .orderBy('targetDate', 'asc')
          .get();
        return { success: true, data: res.data };
      }

      case 'add': {
        const res = await db.collection('events').add({
          data: {
            ...eventData,
            _openid: openid,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        return { success: true, id: res._id };
      }

      case 'update': {
        await db.collection('events').doc(eventId).update({
          data: { ...eventData, updatedAt: db.serverDate() }
        });
        return { success: true };
      }

      case 'delete': {
        await db.collection('events').doc(eventId).remove();
        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (err) {
    console.error('syncEvents error:', err);
    return { success: false, error: err.message };
  }
};
