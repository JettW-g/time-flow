Component({
  data: {
    selected: 0,
    tabs: [
      { text: '倒计时', pagePath: '/pages/countdown/countdown' },
      { text: '日历', pagePath: '/pages/calendar/calendar' },
      { text: '我的', pagePath: '/pages/profile/profile' }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const tab = this.data.tabs[index];
      wx.switchTab({ url: tab.pagePath });
    }
  }
});
