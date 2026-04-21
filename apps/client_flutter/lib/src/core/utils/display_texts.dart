String todoStatusText(String value) {
  switch (value) {
    case 'pending':
      return '待办';
    case 'completed':
      return '已完成';
    case 'archived':
      return '已归档';
    case 'deleted':
      return '已删除';
    default:
      return value;
  }
}

String todoPriorityText(String value) {
  switch (value) {
    case 'low':
      return '低';
    case 'medium':
      return '中';
    case 'high':
      return '高';
    default:
      return value;
  }
}

String reminderChannelText(String value) {
  switch (value) {
    case 'webhook':
      return 'Webhook';
    case 'android_local':
      return 'Android 本地提醒';
    case 'windows_local':
      return 'Windows 本地提醒';
    default:
      return value;
  }
}

String reminderRepeatTypeText(String value) {
  switch (value) {
    case 'none':
      return '不重复';
    case 'daily':
      return '每天';
    case 'weekly':
      return '每周';
    case 'workday':
      return '工作日';
    case 'custom':
      return '自定义';
    default:
      return value;
  }
}

String reminderStatusText(String value) {
  switch (value) {
    case 'pending':
      return '待触发';
    case 'triggered':
      return '已触发';
    case 'cancelled':
      return '已取消';
    case 'failed':
      return '失败';
    default:
      return value;
  }
}

String endpointTypeText(String value) {
  switch (value) {
    case 'webhook':
      return 'Webhook';
    default:
      return value;
  }
}

String enabledStatusText(bool value) {
  return value ? '已启用' : '已停用';
}

String endpointTestStatusText(String value) {
  switch (value) {
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
    case 'simulated':
      return '模拟';
    default:
      return value;
  }
}

String timezoneText(String value) {
  switch (value) {
    case 'Asia/Shanghai':
      return '亚洲/上海';
    case 'Asia/Tokyo':
      return '亚洲/东京';
    case 'Asia/Singapore':
      return '亚洲/新加坡';
    case 'UTC':
      return '协调世界时';
    case 'Europe/London':
      return '欧洲/伦敦';
    case 'Europe/Berlin':
      return '欧洲/柏林';
    case 'America/New_York':
      return '美洲/纽约';
    case 'America/Chicago':
      return '美洲/芝加哥';
    case 'America/Denver':
      return '美洲/丹佛';
    case 'America/Los_Angeles':
      return '美洲/洛杉矶';
    default:
      return value;
  }
}
